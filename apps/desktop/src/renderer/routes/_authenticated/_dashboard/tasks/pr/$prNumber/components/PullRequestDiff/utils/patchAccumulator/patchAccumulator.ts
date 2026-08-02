import type {
	ChangeTypes,
	CodeViewItem,
	FileDiffMetadata,
} from "@pierre/diffs";
import type { GitStatus, GitStatusEntry } from "@pierre/trees";

export interface PullRequestDiffStats {
	fileCount: number;
	additions: number;
	deletions: number;
}

export interface PullRequestTreeSource {
	paths: readonly string[];
	gitStatus: readonly GitStatusEntry[];
	pathToItemId: ReadonlyMap<string, string>;
	version: number;
}

export interface PatchAccumulator {
	fileIndex: number;
	items: CodeViewItem[];
	pendingItems: CodeViewItem[];
	stats: PullRequestDiffStats;
	usedItemIds: Set<string>;
	paths: string[];
	gitStatus: GitStatusEntry[];
	pathToItemId: Map<string, string>;
	treeVersion: number;
}

export function createPatchAccumulator(): PatchAccumulator {
	return {
		fileIndex: 0,
		items: [],
		pendingItems: [],
		stats: { fileCount: 0, additions: 0, deletions: 0 },
		usedItemIds: new Set(),
		paths: [],
		gitStatus: [],
		pathToItemId: new Map(),
		treeVersion: 0,
	};
}

export function appendFileDiff(
	accumulator: PatchAccumulator,
	fileDiff: FileDiffMetadata,
): void {
	accumulator.fileIndex++;
	const item: CodeViewItem = {
		id: claimItemId(accumulator, fileDiff.name),
		type: "diff",
		fileDiff,
	};
	accumulator.items.push(item);
	accumulator.pendingItems.push(item);
	accumulator.stats.fileCount++;
	for (const hunk of fileDiff.hunks) {
		accumulator.stats.additions += hunk.additionLines;
		accumulator.stats.deletions += hunk.deletionLines;
	}
	if (!accumulator.pathToItemId.has(fileDiff.name)) {
		accumulator.paths.push(fileDiff.name);
		accumulator.gitStatus.push({
			path: fileDiff.name,
			status: mapChangeTypeToGitStatus(fileDiff.type),
		});
		accumulator.pathToItemId.set(fileDiff.name, item.id);
	}
}

export function takePendingItems(
	accumulator: PatchAccumulator,
): CodeViewItem[] {
	const pending = accumulator.pendingItems;
	accumulator.pendingItems = [];
	return pending;
}

export function snapshotTreeSource(
	accumulator: PatchAccumulator,
): PullRequestTreeSource {
	accumulator.treeVersion++;
	return {
		paths: accumulator.paths.slice(),
		gitStatus: accumulator.gitStatus.slice(),
		pathToItemId: accumulator.pathToItemId,
		version: accumulator.treeVersion,
	};
}

// Both rename variants fold into 'renamed' so the tree shows a consistent
// rename badge regardless of whether content also changed.
function mapChangeTypeToGitStatus(type: ChangeTypes): GitStatus {
	switch (type) {
		case "new":
			return "added";
		case "deleted":
			return "deleted";
		case "rename-pure":
		case "rename-changed":
			return "renamed";
		case "change":
			return "modified";
	}
}

function claimItemId(accumulator: PatchAccumulator, name: string): string {
	let id = name;
	for (let suffix = 2; accumulator.usedItemIds.has(id); suffix++) {
		id = `${name}#${suffix}`;
	}
	accumulator.usedItemIds.add(id);
	return id;
}
