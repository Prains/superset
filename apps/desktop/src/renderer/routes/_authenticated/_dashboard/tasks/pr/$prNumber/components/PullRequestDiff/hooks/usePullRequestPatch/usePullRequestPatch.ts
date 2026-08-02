import { type CodeViewItem, parsePatchFiles, processFile } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { getHostServiceHeaders } from "renderer/lib/host-service-auth";
import {
	appendFileDiff,
	createPatchAccumulator,
	type PullRequestDiffStats,
	type PullRequestTreeSource,
	snapshotTreeSource,
	takePendingItems,
} from "../../utils/patchAccumulator";
import { streamGitPatchFiles } from "../../utils/streamGitPatchFiles";

// Batching cadence ported from Pierre's diffshub (usePatchLoader): parse on
// an 8ms work budget so the main thread never stalls, publish the first
// viewport-sized batch fast, then append in coarser batches while the rest
// of the patch streams in.
const STREAM_PUBLISH_INTERVAL_MS = 100;
const STREAM_INITIAL_PUBLISH_INTERVAL_MS = 500;
const STREAM_WORK_BUDGET_MS = 8;
const BATCH_FILE_COUNT = 25;
const BATCH_FILE_COUNT_MAX = 96;
const ESTIMATED_FILE_ROW_HEIGHT = 24;

export type PullRequestPatchLoadState =
	| "fetching"
	| "streaming"
	| "ready"
	| "error";

export type PullRequestCollapseMode = "expanded" | "collapsed";

interface UsePullRequestPatchOptions {
	hostUrl: string | null;
	projectId: string;
	prNumber: number;
	viewerRef: RefObject<CodeViewHandle<undefined> | null>;
}

interface UsePullRequestPatchResult {
	applyCollapseMode: (mode: PullRequestCollapseMode) => void;
	errorMessage: string | null;
	initialItems: CodeViewItem[];
	loadState: PullRequestPatchLoadState;
	retry: () => void;
	stats: PullRequestDiffStats | null;
	treeSource: PullRequestTreeSource | null;
}

function getInitialBatchSize(): number {
	const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
	if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
		return BATCH_FILE_COUNT;
	}
	return Math.min(
		BATCH_FILE_COUNT_MAX,
		Math.max(
			BATCH_FILE_COUNT,
			Math.ceil(viewportHeight / ESTIMATED_FILE_ROW_HEIGHT),
		),
	);
}

function yieldToBrowser(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export function usePullRequestPatch({
	hostUrl,
	projectId,
	prNumber,
	viewerRef,
}: UsePullRequestPatchOptions): UsePullRequestPatchResult {
	const [initialItems, setInitialItems] = useState<CodeViewItem[]>([]);
	const [stats, setStats] = useState<PullRequestDiffStats | null>(null);
	const [treeSource, setTreeSource] = useState<PullRequestTreeSource | null>(
		null,
	);
	const [loadState, setLoadState] =
		useState<PullRequestPatchLoadState>("fetching");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [loadAttempt, setLoadAttempt] = useState(0);
	const requestIdRef = useRef(0);
	const collapseModeRef = useRef<PullRequestCollapseMode>("expanded");
	// The viewer handle does not expose item enumeration, so collapse-all
	// walks our own index of every item handed to the viewer.
	const loadedItemIdsRef = useRef<Set<string>>(new Set());

	const applyCollapseMode = useCallback(
		(mode: PullRequestCollapseMode) => {
			collapseModeRef.current = mode;
			const targetCollapsed = mode === "collapsed";
			const viewer = viewerRef.current;
			if (viewer == null) {
				setInitialItems((prev) =>
					prev.map((item) =>
						item.type === "diff" &&
						(item.collapsed === true) !== targetCollapsed
							? { ...item, collapsed: targetCollapsed }
							: item,
					),
				);
				return;
			}
			for (const itemId of loadedItemIdsRef.current) {
				const item = viewer.getItem(itemId);
				if (item == null || item.type !== "diff") {
					continue;
				}
				if ((item.collapsed === true) === targetCollapsed) {
					continue;
				}
				item.collapsed = targetCollapsed;
				item.version = typeof item.version === "number" ? item.version + 1 : 1;
				viewer.updateItem(item);
			}
		},
		[viewerRef],
	);

	useEffect(() => {
		if (!hostUrl) {
			return;
		}

		const controller = new AbortController();
		const requestId = ++requestIdRef.current;
		const isCurrentRequest = () =>
			requestIdRef.current === requestId && !controller.signal.aborted;

		setInitialItems([]);
		setStats(null);
		setTreeSource(null);
		setErrorMessage(null);
		setLoadState("fetching");
		loadedItemIdsRef.current = new Set();

		// Pre-mutates fresh items so they arrive in the viewer matching the
		// current collapse mode, and records their ids for later bulk updates.
		const prepareItemsForViewer = (items: readonly CodeViewItem[]) => {
			const targetCollapsed = collapseModeRef.current === "collapsed";
			for (const item of items) {
				loadedItemIdsRef.current.add(item.id);
				if (item.type === "diff") {
					item.collapsed = targetCollapsed;
				}
			}
		};

		const cacheKeyPrefix = `pr-${projectId}-${prNumber}-${loadAttempt}`;

		async function loadPatch() {
			try {
				const accumulator = createPatchAccumulator();
				let pendingPublishFileCount = 0;
				let hasPublishedInitialItems = false;
				let lastPublishTime = performance.now();
				let lastWorkYieldTime = lastPublishTime;
				const initialPublishFileBatchSize = getInitialBatchSize();

				const publishPendingData = async () => {
					if (pendingPublishFileCount === 0 || !isCurrentRequest()) {
						return;
					}

					pendingPublishFileCount = 0;
					lastPublishTime = performance.now();
					const pendingItems = takePendingItems(accumulator);
					prepareItemsForViewer(pendingItems);
					setStats({ ...accumulator.stats });
					setTreeSource(snapshotTreeSource(accumulator));
					if (!hasPublishedInitialItems) {
						hasPublishedInitialItems = true;
						setInitialItems(pendingItems);
					} else {
						const viewer = viewerRef.current;
						if (viewer != null) {
							viewer.addItems(pendingItems);
						} else {
							setInitialItems((prev) => [...prev, ...pendingItems]);
						}
					}
					await yieldToBrowser();
					lastWorkYieldTime = performance.now();
				};

				const publishPendingDataIfNeeded = async () => {
					if (pendingPublishFileCount === 0) {
						return;
					}

					const elapsed = performance.now() - lastPublishTime;
					const publishFileBatchSize = hasPublishedInitialItems
						? BATCH_FILE_COUNT
						: initialPublishFileBatchSize;
					const publishInterval = hasPublishedInitialItems
						? STREAM_PUBLISH_INTERVAL_MS
						: STREAM_INITIAL_PUBLISH_INTERVAL_MS;
					if (
						pendingPublishFileCount < publishFileBatchSize &&
						elapsed < publishInterval
					) {
						return;
					}

					await publishPendingData();
				};

				const shouldDeferInitialPublishForBatchTarget = () => {
					if (hasPublishedInitialItems) {
						return false;
					}

					const elapsed = performance.now() - lastPublishTime;
					return (
						pendingPublishFileCount < initialPublishFileBatchSize &&
						elapsed < STREAM_INITIAL_PUBLISH_INTERVAL_MS
					);
				};

				const appendStreamedFile = async (fileText: string) => {
					const fileDiff = processFile(fileText, {
						cacheKey: `${cacheKeyPrefix}-0-${accumulator.fileIndex}`,
						isGitDiff: true,
					});
					if (fileDiff == null) {
						return;
					}

					appendFileDiff(accumulator, fileDiff);
					pendingPublishFileCount++;
					const elapsedWork = performance.now() - lastWorkYieldTime;
					if (elapsedWork >= STREAM_WORK_BUDGET_MS) {
						if (shouldDeferInitialPublishForBatchTarget()) {
							await yieldToBrowser();
							lastWorkYieldTime = performance.now();
						} else {
							await publishPendingData();
						}
					} else {
						await publishPendingDataIfNeeded();
					}
				};

				const commitFullPatch = async (patchContent: string) => {
					if (!isCurrentRequest()) {
						return;
					}
					await yieldToBrowser();
					if (!isCurrentRequest()) {
						return;
					}
					const parsedPatches = parsePatchFiles(patchContent, cacheKeyPrefix);
					for (const parsedPatch of parsedPatches) {
						for (const fileDiff of parsedPatch.files) {
							appendFileDiff(accumulator, fileDiff);
						}
					}
					prepareItemsForViewer(takePendingItems(accumulator));
					setStats({ ...accumulator.stats });
					setTreeSource(snapshotTreeSource(accumulator));
					setInitialItems(accumulator.items);
					setLoadState("ready");
				};

				const response = await fetch(
					`${hostUrl}/pull-requests/diff?${new URLSearchParams({
						projectId,
						prNumber: String(prNumber),
					})}`,
					{
						signal: controller.signal,
						headers: getHostServiceHeaders(hostUrl ?? ""),
						cache: "no-store",
					},
				);
				if (!response.ok) {
					const detail = (await response.text()).trim();
					throw new Error(
						detail.length > 0 ? detail : `Request failed (${response.status})`,
					);
				}
				if (response.body == null) {
					await commitFullPatch(await response.text());
					return;
				}

				if (!isCurrentRequest()) {
					return;
				}
				setLoadState("streaming");
				await yieldToBrowser();
				if (!isCurrentRequest()) {
					return;
				}

				const fallbackPatchContent = await streamGitPatchFiles(
					response.body,
					appendStreamedFile,
				);
				if (!isCurrentRequest()) {
					return;
				}

				await publishPendingData();
				if (fallbackPatchContent != null) {
					await commitFullPatch(fallbackPatchContent);
					return;
				}

				setStats({ ...accumulator.stats });
				setLoadState("ready");
			} catch (error) {
				if (!isCurrentRequest()) {
					return;
				}
				setErrorMessage(
					error instanceof Error ? error.message : "Failed to load diff",
				);
				setLoadState("error");
			}
		}

		void loadPatch();

		return () => {
			controller.abort();
		};
	}, [hostUrl, projectId, prNumber, loadAttempt, viewerRef]);

	return {
		applyCollapseMode,
		errorMessage,
		initialItems,
		loadState,
		retry: () => setLoadAttempt((attempt) => attempt + 1),
		stats,
		treeSource,
	};
}
