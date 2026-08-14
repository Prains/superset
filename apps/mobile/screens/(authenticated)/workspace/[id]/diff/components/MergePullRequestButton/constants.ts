export type MergeMethod = "squash" | "merge" | "rebase";

/** Squash first: it is this org's repo default and the desktop dropdown's order. */
export const MERGE_METHODS: MergeMethod[] = ["squash", "merge", "rebase"];

export const MERGE_METHOD_LABEL: Record<MergeMethod, string> = {
	squash: "Squash and merge",
	merge: "Create merge commit",
	rebase: "Rebase and merge",
};
