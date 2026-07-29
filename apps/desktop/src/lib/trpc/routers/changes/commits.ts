import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getSimpleGitWithShellPath } from "../workspaces/utils/git-client";
import { assertRegisteredWorktree } from "./security/path-validation";
import { type CommitMessage, readCommitMessage } from "./utils/commit-message";

export const createCommitsRouter = () => {
	return router({
		// The commit list is built from `git log --format=%s`, which drops the
		// body. Fetch the full message on demand instead of shipping every body
		// with each status refresh.
		getCommitMessage: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					commitHash: z.string(),
				}),
			)
			.query(async ({ input }): Promise<CommitMessage> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = await getSimpleGitWithShellPath(input.worktreePath);
				return readCommitMessage(git, input.commitHash);
			}),
	});
};
