import { TRPCError } from "@trpc/server";
import { pathExistsCached } from "../../utils/path-exists-cache";

/**
 * Fast pre-check before spawning a git worker task: a worktree deleted
 * outside the app is a routine state, and every poll would otherwise burn a
 * doomed git process on it.
 */
export function assertWorktreeOnDisk(worktreePath: string): void {
	if (!pathExistsCached(worktreePath)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Worktree no longer exists on disk: ${worktreePath}`,
			cause: { kind: "WORKTREE_MISSING", worktreePath },
		});
	}
}

/**
 * Translates expected git failure states from the worker into typed non-500
 * TRPCErrors; anything unrecognized rethrows and stays a reported 500. Name
 * checks, never instanceof — the worker boundary preserves only
 * `{name, message, stack, code}`.
 */
export function translateGitTaskError(error: unknown): never {
	if (error instanceof Error) {
		if (error.name === "NotGitRepoError") {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: error.message,
				cause: { kind: "NOT_GIT_REPO" },
			});
		}
		if (error.name === "GitEnvironmentError") {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: error.message,
				cause: { kind: "GIT_ENVIRONMENT" },
			});
		}
	}
	throw error;
}
