import { z } from "zod";

/**
 * Only `mergePR` is in the protocol. The rest of host-service's `github.*` is
 * a thin authenticated proxy over Octokit reads that a client can make
 * directly with its own token; merging is here because it is the one write the
 * workspace surface performs against the workspace's own pull request, using
 * the runtime's git credentials rather than the client's.
 */
export const githubMergePRInput = z.object({
	owner: z.string(),
	repo: z.string(),
	pullNumber: z.number(),
	mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
});

export const githubMergePROutput = z.object({
	sha: z.string(),
	merged: z.boolean(),
	message: z.string(),
});
