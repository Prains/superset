import { z } from "zod";

export const gitWorkspaceRefSchema = z.object({ workspaceId: z.string() });

export const gitSuccessSchema = z.object({ success: z.boolean() });

export const patchStatusSchema = z.enum([
	"added",
	"copied",
	"changed",
	"deleted",
	"modified",
	"renamed",
]);

export const fileStatusSchema = z.enum([
	...patchStatusSchema.options,
	"untracked",
]);

export const diffSideSchema = z.enum(["LEFT", "RIGHT"]);

/**
 * GitHub's PullRequestState plus the Superset-derived `queued` state for PRs
 * sitting in a repo's merge queue.
 */
export const pullRequestStateSchema = z.enum([
	"open",
	"closed",
	"merged",
	"queued",
]);

export const pullRequestReviewDecisionSchema = z.enum([
	"approved",
	"changes_requested",
	"review_required",
]);

export const checkStatusStateSchema = z.enum([
	"completed",
	"in_progress",
	"pending",
	"queued",
]);

export const checkConclusionStateSchema = z.enum([
	"success",
	"failure",
	"cancelled",
	"skipped",
	"neutral",
	"timed_out",
	"action_required",
	"stale",
]);

export const mergeableStateSchema = z.enum([
	"mergeable",
	"conflicting",
	"unknown",
]);

export const gitHubActorSchema = z.object({
	login: z.string(),
	avatarUrl: z.string(),
});

export const branchSchema = z.object({
	name: z.string(),
	isHead: z.boolean(),
	upstream: z.string().nullable(),
	aheadCount: z.number(),
	behindCount: z.number(),
	lastCommitHash: z.string(),
	lastCommitDate: z.string(),
});

export const changedFileSchema = z.object({
	path: z.string(),
	oldPath: z.string().optional(),
	status: fileStatusSchema,
	additions: z.number(),
	deletions: z.number(),
	isBinary: z.boolean().optional(),
});

export const commitSchema = z.object({
	hash: z.string(),
	shortHash: z.string(),
	message: z.string(),
	author: z.string(),
	authorEmail: z.string(),
	date: z.string(),
});

export const checkRunSchema = z.object({
	name: z.string(),
	status: checkStatusStateSchema,
	conclusion: checkConclusionStateSchema.nullable(),
	detailsUrl: z.string().nullable(),
	startedAt: z.string().nullable(),
	completedAt: z.string().nullable(),
});

export const pullRequestReviewCommentSchema = z.object({
	id: z.string(),
	databaseId: z.number(),
	author: gitHubActorSchema,
	body: z.string(),
	createdAt: z.string(),
});

export const pullRequestReviewThreadSchema = z.object({
	id: z.string(),
	isResolved: z.boolean(),
	isOutdated: z.boolean(),
	diffSide: diffSideSchema,
	line: z.number().nullable(),
	path: z.string(),
	comments: z.array(pullRequestReviewCommentSchema),
});

export const issueCommentSchema = z.object({
	id: z.number(),
	user: gitHubActorSchema,
	body: z.string(),
	createdAt: z.string(),
	htmlUrl: z.string(),
});

/**
 * Branch names only. The richer per-branch fields (`upstream`, ahead/behind,
 * last commit) cost four extra git spawns each and no consumer reads them, so
 * this deliberately returns the narrow shape.
 */
export const gitListBranchesOutput = z.object({
	branches: z.array(z.object({ name: z.string(), isHead: z.boolean() })),
});

export const gitGetStatusInput = gitWorkspaceRefSchema.extend({
	baseBranch: z.string().optional(),
	priority: z.enum(["foreground", "background"]).optional(),
});

/** The snapshot `git.getStatus` resolves to, computed off the event loop. */
export const gitGetStatusOutput = z.object({
	currentBranch: branchSchema,
	defaultBranch: branchSchema,
	againstBase: z.array(changedFileSchema),
	staged: z.array(changedFileSchema),
	unstaged: z.array(changedFileSchema),
	ignoredPaths: z.array(z.string()),
});

export const gitListCommitsInput = gitWorkspaceRefSchema.extend({
	baseBranch: z.string().optional(),
});

export const gitListCommitsOutput = z.object({
	commits: z.array(commitSchema),
});

export const gitGetCommitFilesInput = gitWorkspaceRefSchema.extend({
	commitHash: z.string(),
	fromHash: z.string().optional(),
});

export const gitGetCommitFilesOutput = z.object({
	files: z.array(changedFileSchema),
});

export const gitGetBaseBranchOutput = z.object({
	baseBranch: z.string().nullable(),
});

export const gitSetBaseBranchInput = gitWorkspaceRefSchema.extend({
	baseBranch: z.string().nullable(),
});

export const gitSetBaseBranchOutput = z.object({
	baseBranch: z.string().nullable(),
});

export const gitRenameBranchInput = gitWorkspaceRefSchema.extend({
	oldName: z.string(),
	newName: z.string(),
});

export const gitRenameBranchOutput = z.object({ name: z.string() });

export const gitDiscardChangesInput = gitWorkspaceRefSchema.extend({
	filePath: z.string(),
});

export const gitGetDiffInput = gitWorkspaceRefSchema.extend({
	path: z.string(),
	category: z.enum(["against-base", "staged", "unstaged", "commit"]),
	baseBranch: z.string().optional(),
	commitHash: z.string().optional(),
	fromHash: z.string().optional(),
});

/**
 * Both sides of one file's diff as whole-file contents; the client does the
 * diffing. Missing blobs (new/deleted file, unreadable path) come back as
 * empty strings rather than errors.
 */
export const gitGetDiffOutput = z.object({
	oldFile: z.object({ name: z.string(), contents: z.string() }),
	newFile: z.object({ name: z.string(), contents: z.string() }),
});

export const gitGetBranchSyncStatusOutput = z.object({
	hasRepo: z.boolean(),
	hasUpstream: z.boolean(),
	pushCount: z.number(),
	pullCount: z.number(),
	isDefaultBranch: z.boolean(),
	isDetached: z.boolean(),
	hasUncommitted: z.boolean(),
	currentBranch: z.string().nullable(),
	defaultBranch: z.string().nullable(),
});

/**
 * The PR linked to this workspace, mirrored from GitHub's model. `null` when
 * the workspace has no linked PR. `body` and `mergeable` are placeholders the
 * local row does not carry.
 */
export const gitGetPullRequestOutput = z
	.object({
		number: z.number(),
		url: z.string(),
		title: z.string(),
		body: z.string().nullable(),
		state: pullRequestStateSchema,
		isDraft: z.boolean(),
		reviewDecision: pullRequestReviewDecisionSchema.nullable(),
		mergeable: mergeableStateSchema,
		headRefName: z.string(),
		updatedAt: z.string(),
		checks: z.array(checkRunSchema),
		repoOwner: z.string(),
		repoName: z.string(),
	})
	.nullable();

export const gitGetCheckJobLogsInput = gitWorkspaceRefSchema.extend({
	detailsUrl: z.string(),
});

export const gitGetCheckJobLogsOutput = z.object({ logs: z.string() });

/**
 * Review threads and conversation comments for the linked PR. Degrades to
 * empty arrays (never throws) when the workspace has no PR, no project, no
 * GitHub remote, or the GitHub calls fail.
 */
export const gitGetPullRequestThreadsOutput = z.object({
	reviewThreads: z.array(pullRequestReviewThreadSchema),
	conversationComments: z.array(issueCommentSchema),
});

export const gitSetReviewThreadResolutionInput = gitWorkspaceRefSchema.extend({
	threadId: z.string(),
	resolved: z.boolean(),
});

export const gitSetReviewThreadResolutionOutput = z.object({
	threadId: z.string(),
	isResolved: z.boolean(),
});
