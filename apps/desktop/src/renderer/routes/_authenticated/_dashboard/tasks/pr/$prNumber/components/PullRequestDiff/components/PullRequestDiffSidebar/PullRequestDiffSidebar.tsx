import {
	FileTree as PierreFileTree,
	useFileTree as usePierreFileTree,
} from "@pierre/trees/react";
import { memo, useEffect, useRef } from "react";
import { useFallthroughIcons } from "renderer/lib/fileIcons";
import {
	createPierreTreeStyle,
	PIERRE_TREE_UNSAFE_CSS,
} from "renderer/lib/pierreTree";
import type {
	PullRequestDiffStats,
	PullRequestTreeSource,
} from "../../utils/patchAccumulator";

const TREE_ROW_HEIGHT = 24;
const TREE_LEVEL_INDENT = 12;
const TREE_STYLE = createPierreTreeStyle({
	rowHeight: TREE_ROW_HEIGHT,
	levelIndent: TREE_LEVEL_INDENT,
});

interface PullRequestDiffSidebarProps {
	source: PullRequestTreeSource | null;
	stats: PullRequestDiffStats | null;
	onSelectItem: (itemId: string) => void;
}

export const PullRequestDiffSidebar = memo(function PullRequestDiffSidebar({
	source,
	stats,
	onSelectItem,
}: PullRequestDiffSidebarProps) {
	const sourceRef = useRef(source);
	sourceRef.current = source;
	// The tree model is constructed once and never re-reads its options, so
	// selection routes through a ref to reach the latest closure.
	const onSelectItemRef = useRef(onSelectItem);
	onSelectItemRef.current = onSelectItem;

	const { model } = usePierreFileTree({
		paths: [],
		initialExpansion: "open",
		search: false,
		flattenEmptyDirectories: true,
		stickyFolders: true,
		unsafeCSS: PIERRE_TREE_UNSAFE_CSS,
		icons: { set: "complete", colored: true },
		itemHeight: TREE_ROW_HEIGHT,
		onSelectionChange: (paths) => {
			const last = paths[paths.length - 1];
			if (!last || last.endsWith("/")) return;
			const itemId = sourceRef.current?.pathToItemId.get(last);
			if (itemId != null) {
				onSelectItemRef.current(itemId);
			}
		},
	});

	useFallthroughIcons(model);

	const appliedVersionRef = useRef(0);
	useEffect(() => {
		if (source == null || source.version === appliedVersionRef.current) {
			return;
		}
		appliedVersionRef.current = source.version;
		model.resetPaths(source.paths);
		model.setGitStatus(source.gitStatus);
	}, [model, source]);

	return (
		<div className="flex h-full w-64 shrink-0 flex-col border-r border-border">
			<PierreFileTree
				model={model}
				className="min-h-0 flex-1 overflow-auto overscroll-contain py-1"
				style={TREE_STYLE}
			/>
			{stats ? (
				<div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground tabular-nums">
					<span>
						{stats.fileCount} {stats.fileCount === 1 ? "file" : "files"}
					</span>
					<span className="text-green-600 dark:text-green-400">
						+{stats.additions}
					</span>
					<span className="text-red-600 dark:text-red-400">
						−{stats.deletions}
					</span>
				</div>
			) : null}
		</div>
	);
});
