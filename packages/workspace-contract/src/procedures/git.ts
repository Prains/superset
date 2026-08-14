import { z } from "zod";
import type { ContractNamespace } from "../procedure";
import {
	changedFileSchema,
	checkRunSchema,
	commitSchema,
	gitStatusSnapshotSchema,
	issueCommentSchema,
	mergeableStateSchema,
	pullRequestReviewDecisionSchema,
	pullRequestReviewThreadSchema,
	pullRequestStateSchema,
} from "../schemas/git";

const workspaceRefSchema = z.object({ workspaceId: z.string() });

const successSchema = z.object({ success: z.boolean() });

export const gitContract = {
	/**
	 * Branch names only. The richer per-branch fields (`upstream`,
	 * ahead/behind, last commit) cost four extra git spawns each and no
	 * consumer reads them, so this deliberately returns the narrow shape.
	 */
	listBranches: {
		kind: "query",
		exposure: "authenticated",
		input: workspaceRefSchema,
		output: z.object({
			branches: z.array(z.object({ name: z.string(), isHead: z.boolean() })),
		}),
	},

	getStatus: {
		kind: "query",
		exposure: "authenticated",
		timeoutMs: 15_000,
		input: workspaceRefSchema.extend({
			baseBranch: z.string().optional(),
			priority: z.enum(["foreground", "background"]).optional(),
		}),
		output: gitStatusSnapshotSchema,
	},

	listCommits: {
		kind: "query",
		exposure: "authenticated",
		timeoutMs: 30_000,
		input: workspaceRefSchema.extend({ baseBranch: z.string().optional() }),
		output: z.object({ commits: z.array(commitSchema) }),
	},

	getCommitFiles: {
		kind: "query",
		exposure: "authenticated",
		timeoutMs: 15_000,
		input: workspaceRefSchema.extend({
			commitHash: z.string(),
			fromHash: z.string().optional(),
		}),
		output: z.object({ files: z.array(changedFileSchema) }),
	},

	getBaseBranch: {
		kind: "query",
		exposure: "authenticated",
		input: workspaceRefSchema,
		output: z.object({ baseBranch: z.string().nullable() }),
	},

	setBaseBranch: {
		kind: "mutation",
		exposure: "authenticated",
		input: workspaceRefSchema.extend({ baseBranch: z.string().nullable() }),
		output: z.object({ baseBranch: z.string().nullable() }),
	},

	renameBranch: {
		kind: "mutation",
		exposure: "authenticated",
		input: workspaceRefSchema.extend({
			oldName: z.string(),
			newName: z.string(),
		}),
		output: z.object({ name: z.string() }),
	},

	discardChanges: {
		kind: "mutation",
		exposure: "authenticated",
		input: workspaceRefSchema.extend({ filePath: z.string() }),
		output: successSchema,
	},

	discardAllUnstaged: {
		kind: "mutation",
		exposure: "authenticated",
		input: workspaceRefSchema,
		output: successSchema,
	},

	discardAllStaged: {
		kind: "mutation",
		exposure: "authenticated",
		input: workspaceRefSchema,
		output: successSchema,
	},

	stageAll: {
		kind: "mutation",
		exposure: "authenticated",
		input: workspaceRefSchema,
		output: successSchema,
	},

	unstageAll: {
		kind: "mutation",
		exposure: "authenticated",
		input: workspaceRefSchema,
		output: successSchema,
	},

	/**
	 * Both sides of one file's diff as whole-file contents; the client does
	 * the diffing. Missing blobs (new/deleted file, unreadable path) come
	 * back as empty strings rather than errors.
	 */
	getDiff: {
		kind: "query",
		exposure: "authenticated",
		timeoutMs: 30_000,
		input: workspaceRefSchema.extend({
			path: z.string(),
			category: z.enum(["against-base", "staged", "unstaged", "commit"]),
			baseBranch: z.string().optional(),
			commitHash: z.string().optional(),
			fromHash: z.string().optional(),
		}),
		output: z.object({
			oldFile: z.object({ name: z.string(), contents: z.string() }),
			newFile: z.object({ name: z.string(), contents: z.string() }),
		}),
	},

	getBranchSyncStatus: {
		kind: "query",
		exposure: "authenticated",
		timeoutMs: 30_000,
		input: workspaceRefSchema,
		output: z.object({
			hasRepo: z.boolean(),
			hasUpstream: z.boolean(),
			pushCount: z.number(),
			pullCount: z.number(),
			isDefaultBranch: z.boolean(),
			isDetached: z.boolean(),
			hasUncommitted: z.boolean(),
			currentBranch: z.string().nullable(),
			defaultBranch: z.string().nullable(),
		}),
	},

	/**
	 * The PR linked to this workspace, mirrored from GitHub's model.
	 * `null` when the workspace has no linked PR. `body` and `mergeable` are
	 * placeholders the local row does not carry.
	 */
	getPullRequest: {
		kind: "query",
		exposure: "authenticated",
		input: workspaceRefSchema,
		output: z
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
			.nullable(),
	},

	getCheckJobLogs: {
		kind: "query",
		exposure: "authenticated",
		timeoutMs: 30_000,
		input: workspaceRefSchema.extend({ detailsUrl: z.string() }),
		output: z.object({ logs: z.string() }),
	},

	/**
	 * Review threads and conversation comments for the linked PR. Degrades
	 * to empty arrays (never throws) when the workspace has no PR, no
	 * project, no GitHub remote, or the GitHub calls fail.
	 */
	getPullRequestThreads: {
		kind: "query",
		exposure: "authenticated",
		timeoutMs: 30_000,
		input: workspaceRefSchema,
		output: z.object({
			reviewThreads: z.array(pullRequestReviewThreadSchema),
			conversationComments: z.array(issueCommentSchema),
		}),
	},

	setReviewThreadResolution: {
		kind: "mutation",
		exposure: "authenticated",
		input: workspaceRefSchema.extend({
			threadId: z.string(),
			resolved: z.boolean(),
		}),
		output: z.object({ threadId: z.string(), isResolved: z.boolean() }),
	},
} as const satisfies ContractNamespace;
