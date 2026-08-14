import { z } from "zod";

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

/** The snapshot `git.getStatus` resolves to, computed off the event loop. */
export const gitStatusSnapshotSchema = z.object({
	currentBranch: branchSchema,
	defaultBranch: branchSchema,
	againstBase: z.array(changedFileSchema),
	staged: z.array(changedFileSchema),
	unstaged: z.array(changedFileSchema),
	ignoredPaths: z.array(z.string()),
});

/**
 * Workspace-level PR projection served by `pullRequests.getByWorkspaces`.
 * Distinct from `git.getPullRequest`: this one is the sidebar's denormalized
 * row (its own state/decision/check vocabularies), not the GitHub mirror.
 */
export const pullRequestRowStateSchema = z.enum([
	"open",
	"draft",
	"merged",
	"closed",
	"queued",
]);

export const pullRequestRowReviewDecisionSchema = z
	.enum(["approved", "changes_requested", "pending"])
	.nullable();

export const pullRequestRowChecksStatusSchema = z.enum([
	"success",
	"failure",
	"pending",
	"none",
]);

export const pullRequestRowCheckSchema = z.object({
	name: z.string(),
	status: z.enum(["success", "failure", "pending", "skipped", "cancelled"]),
	url: z.string().nullable(),
});

export const pullRequestStateSnapshotSchema = z.object({
	url: z.string(),
	number: z.number(),
	title: z.string(),
	state: pullRequestRowStateSchema,
	reviewDecision: pullRequestRowReviewDecisionSchema,
	checksStatus: pullRequestRowChecksStatusSchema,
	checks: z.array(pullRequestRowCheckSchema),
	/** First observed merged, epoch ms. Never cleared once set. */
	mergedAt: z.number().nullable(),
});

export const pullRequestWorkspaceSnapshotSchema = z.object({
	workspaceId: z.string(),
	pullRequest: pullRequestStateSnapshotSchema.nullable(),
	error: z.string().nullable(),
	lastFetchedAt: z.string().nullable(),
});
