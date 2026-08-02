import { CodeView, type CodeViewHandle } from "@pierre/diffs/react";
import { Button } from "@superset/ui/button";
import { useCallback, useMemo, useRef, useState } from "react";
import { useSettings } from "renderer/stores/settings";
import { PullRequestDiffSidebar } from "./components/PullRequestDiffSidebar";
import { usePullRequestDiffTheme } from "./hooks/usePullRequestDiffTheme";
import {
	type PullRequestCollapseMode,
	usePullRequestPatch,
} from "./hooks/usePullRequestPatch";
import { createPullRequestFileLoader } from "./utils/createPullRequestFileLoader";

interface PullRequestDiffProps {
	hostUrl: string | null;
	projectId: string;
	prNumber: number;
}

export function PullRequestDiff({
	hostUrl,
	projectId,
	prNumber,
}: PullRequestDiffProps) {
	const viewerRef = useRef<CodeViewHandle<undefined>>(null);
	const settingsDiffStyle = useSettings((s) => s.diffStyle);
	const [diffStyle, setDiffStyle] = useState<"split" | "unified">(
		settingsDiffStyle,
	);
	const [collapseMode, setCollapseMode] =
		useState<PullRequestCollapseMode>("expanded");

	const {
		applyCollapseMode,
		errorMessage,
		initialItems,
		loadState,
		retry,
		stats,
		treeSource,
	} = usePullRequestPatch({ hostUrl, projectId, prNumber, viewerRef });

	const { options, style } = usePullRequestDiffTheme({ diffStyle });
	const loadDiffFiles = useMemo(
		() =>
			hostUrl
				? createPullRequestFileLoader({ hostUrl, projectId, prNumber })
				: undefined,
		[hostUrl, projectId, prNumber],
	);
	const codeViewOptions = useMemo(
		() => ({ ...options, loadDiffFiles }),
		[options, loadDiffFiles],
	);

	const handleSelectTreeItem = useCallback((itemId: string) => {
		const viewer = viewerRef.current;
		if (viewer == null) {
			return;
		}
		const item = viewer.getItem(itemId);
		if (item != null && item.collapsed === true) {
			item.collapsed = false;
			item.version = typeof item.version === "number" ? item.version + 1 : 1;
			viewer.updateItem(item);
		}
		viewer.scrollTo({
			type: "item",
			id: itemId,
			align: "start",
			behavior: "smooth",
		});
	}, []);

	const handleToggleCollapseMode = useCallback(() => {
		setCollapseMode((current) => {
			const next = current === "expanded" ? "collapsed" : "expanded";
			applyCollapseMode(next);
			return next;
		});
	}, [applyCollapseMode]);

	if (loadState === "error") {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-3">
				<p className="max-w-lg cursor-text select-text text-sm text-destructive">
					{errorMessage ?? "Failed to load diff"}
				</p>
				<Button variant="outline" size="sm" onClick={retry}>
					Retry
				</Button>
			</div>
		);
	}

	if (
		loadState === "fetching" ||
		(loadState === "streaming" && initialItems.length === 0)
	) {
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
				Loading diff…
			</div>
		);
	}

	if (loadState === "ready" && initialItems.length === 0) {
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
				No changes
			</div>
		);
	}

	return (
		<div className="flex h-full w-full min-h-0">
			<PullRequestDiffSidebar
				source={treeSource}
				stats={stats}
				onSelectItem={handleSelectTreeItem}
			/>
			<div className="flex h-full min-w-0 flex-1 flex-col">
				<div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground">
					{loadState === "streaming" ? <span>Streaming…</span> : null}
					<div className="ml-auto flex items-center gap-1">
						<Button
							variant="ghost"
							size="sm"
							className="h-6 px-2 text-xs"
							onClick={handleToggleCollapseMode}
						>
							{collapseMode === "expanded" ? "Collapse all" : "Expand all"}
						</Button>
						<Button
							variant={diffStyle === "unified" ? "secondary" : "ghost"}
							size="sm"
							className="h-6 px-2 text-xs"
							onClick={() => setDiffStyle("unified")}
						>
							Unified
						</Button>
						<Button
							variant={diffStyle === "split" ? "secondary" : "ghost"}
							size="sm"
							className="h-6 px-2 text-xs"
							onClick={() => setDiffStyle("split")}
						>
							Split
						</Button>
					</div>
				</div>
				<CodeView
					ref={viewerRef}
					className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-clip overscroll-contain [overflow-anchor:none]"
					style={style}
					initialItems={initialItems}
					options={codeViewOptions}
				/>
			</div>
		</div>
	);
}
