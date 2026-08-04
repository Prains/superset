import { WorkspaceFsPathError } from "@superset/workspace-fs/host";
import { TRPCError } from "@trpc/server";

export type FsErrnoCode =
	| "ENOENT"
	| "EISDIR"
	| "ENOTDIR"
	| "EACCES"
	| "EPERM"
	| "ENOSPC";

export interface FsErrnoCause {
	kind: "FS_ERRNO";
	errno: FsErrnoCode;
}

const ERRNO_TO_TRPC: Record<FsErrnoCode, TRPCError["code"]> = {
	ENOENT: "NOT_FOUND",
	EISDIR: "BAD_REQUEST",
	ENOTDIR: "BAD_REQUEST",
	EACCES: "FORBIDDEN",
	EPERM: "FORBIDDEN",
	ENOSPC: "PRECONDITION_FAILED",
};

const PATH_ERROR_TO_TRPC: Record<
	WorkspaceFsPathError["code"],
	TRPCError["code"]
> = {
	INVALID_TARGET: "BAD_REQUEST",
	SYMLINK_ESCAPE: "FORBIDDEN",
};

/**
 * Translates user-environment filesystem failures into typed non-500
 * TRPCErrors (message preserved verbatim); anything unrecognized rethrows and
 * stays a reported 500.
 */
export function translateFsError(error: unknown): never {
	if (error instanceof WorkspaceFsPathError) {
		throw new TRPCError({
			code: PATH_ERROR_TO_TRPC[error.code],
			message: error.message,
			cause: { kind: "PATH_VALIDATION", code: error.code },
		});
	}

	const errno = (error as NodeJS.ErrnoException | null)?.code;
	if (typeof errno === "string" && errno in ERRNO_TO_TRPC) {
		const cause: FsErrnoCause = {
			kind: "FS_ERRNO",
			errno: errno as FsErrnoCode,
		};
		throw new TRPCError({
			code: ERRNO_TO_TRPC[errno as FsErrnoCode],
			message: error instanceof Error ? error.message : String(error),
			cause,
		});
	}

	throw error;
}

export async function withFsErrorTranslation<T>(
	fn: () => Promise<T>,
): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		translateFsError(error);
	}
}
