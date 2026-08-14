import { z } from "zod";

/**
 * Workspace-level PR projection served by `pullRequests.getByWorkspaces`.
 * Distinct from `git.getPullRequest`: this one is the sidebar's denormalized
 * row (its own state/decision/check vocabularies), not the GitHub mirror.
 *
 * `pullRequests.getContent` is deliberately absent from the protocol: it
 * serves the desktop's PR reader (full diff bodies, review payloads) and
 * belongs to the device overlay, not to the workspace API surface.
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

export const pullRequestsWorkspaceIdsSchema = z.object({
	workspaceIds: z.array(z.string()),
});

export const pullRequestsGetByWorkspacesOutput = z.object({
	workspaces: z.array(pullRequestWorkspaceSnapshotSchema),
});

export const pullRequestsRefreshByWorkspacesOutput = z.object({
	ok: z.boolean(),
});

export const pullRequestsUnlinkFromWorkspaceInput = z.object({
	workspaceId: z.string(),
});

export const pullRequestsUnlinkFromWorkspaceOutput = z.object({
	ok: z.boolean(),
});
