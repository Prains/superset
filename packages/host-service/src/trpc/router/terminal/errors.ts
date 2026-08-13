import { TRPCError } from "@trpc/server";

export function toTerminalIoError(message: string): TRPCError {
	if (message.includes("belong")) {
		return new TRPCError({ code: "FORBIDDEN", message });
	}
	// A worktree deleted underneath an open terminal is a routine lifecycle
	// state, not a bug — the runtime reports it as a plain string, so match
	// the stable prefix here to keep it out of Sentry.
	if (message.startsWith("Workspace worktree no longer exists")) {
		return new TRPCError({
			code: "NOT_FOUND",
			message,
			cause: { kind: "WORKTREE_GONE" },
		});
	}
	if (
		message.includes("not found") ||
		message.includes("not active") ||
		message.includes("exited")
	) {
		return new TRPCError({ code: "NOT_FOUND", message });
	}
	return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}
