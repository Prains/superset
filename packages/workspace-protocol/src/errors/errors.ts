/**
 * The workspace error taxonomy.
 *
 * A runtime serving this protocol signals expected domain failures by
 * throwing a tRPC error whose `cause` is one of the shapes below. Today
 * host-service builds these inline as object literals and clients recover
 * them by string-matching `kind`, with no shared type on either side; this
 * module is that shared type.
 *
 * Two rules a compliant runtime must keep:
 *
 * 1. **The pairing is part of the contract.** Each cause is documented with
 *    the tRPC error code it must ride on. Clients branch on `code` first
 *    (retry, auth, surface) and on `kind` second (which message to show), so
 *    moving a kind to a different code is a breaking change.
 * 2. **These are never 500s.** Every kind here is an expected state of the
 *    user's environment, not a bug. host-service's Sentry middleware reports
 *    anything still `INTERNAL_SERVER_ERROR` at the tRPC boundary, so a
 *    runtime that lets one of these escape untranslated pages someone.
 *
 * Serialization caveat: tRPC wraps a non-`Error` `cause` in a synthetic
 * `UnknownCauseError`, and superjson then serializes it as an Error —
 * message and stack only. A cause that must survive to the client verbatim
 * has to be re-emitted through the router's `errorFormatter` into
 * `shape.data` (host-service does this for `TEARDOWN_FAILED`,
 * `PROJECT_NOT_SETUP`, and `DELETE_IN_PROGRESS`, all control-plane; see the
 * exclusion note at the bottom). The kinds in this union are consumed
 * in-process or matched on `code` + `message`, so none of them currently
 * needs formatter passthrough — a runtime that wants a cause field readable
 * client-side must add that passthrough itself.
 */

// ── Terminal ───────────────────────────────────────────────────────
//
// Source: `toTerminalSessionError` in
// packages/host-service/src/trpc/router/terminal/errors.ts. That switch is
// exhaustive over `TerminalSessionErrorKind`, so a new terminal failure
// cannot be added without deciding its code — mirror that here.
//
// `TERMINAL_START_FAILED` is deliberately absent: it stays a 500 with no
// cause because a terminal that cannot spawn is a bug, not a domain state.

/** `FORBIDDEN` — the terminal id exists but belongs to another workspace. */
export interface SessionWrongWorkspaceCause {
	kind: "SESSION_WRONG_WORKSPACE";
}

/** `NOT_FOUND` — no session with this id. */
export interface SessionNotFoundCause {
	kind: "SESSION_NOT_FOUND";
}

/** `NOT_FOUND` — the session existed and its process has exited. */
export interface SessionExitedCause {
	kind: "SESSION_EXITED";
}

/** `NOT_FOUND` — the session row survives but has no live process behind it. */
export interface SessionNotActiveCause {
	kind: "SESSION_NOT_ACTIVE";
}

/** `NOT_FOUND` — the workspace the session names is gone. */
export interface TerminalWorkspaceNotFoundCause {
	kind: "WORKSPACE_NOT_FOUND";
}

/** `NOT_FOUND` — the session's working directory no longer exists on disk. */
export interface WorktreeGoneCause {
	kind: "WORKTREE_GONE";
}

/**
 * `SERVICE_UNAVAILABLE` — the terminal runtime is not answering right now.
 * Transient by definition: callers may retry the same terminal id.
 */
export interface DaemonUnavailableCause {
	kind: "DAEMON_UNAVAILABLE";
}

export type TerminalErrorCause =
	| SessionWrongWorkspaceCause
	| SessionNotFoundCause
	| SessionExitedCause
	| SessionNotActiveCause
	| TerminalWorkspaceNotFoundCause
	| WorktreeGoneCause
	| DaemonUnavailableCause;

// ── Filesystem ─────────────────────────────────────────────────────
//
// Source: `translateFsError` in
// packages/host-service/src/trpc/router/filesystem/filesystem.ts.

/** Path-validation failures raised before any syscall runs. */
export type PathValidationCode = "INVALID_TARGET" | "SYMLINK_ESCAPE";

/**
 * The requested path failed workspace boundary validation.
 *
 * Code depends on `code`:
 * - `INVALID_TARGET`  → `BAD_REQUEST`
 * - `SYMLINK_ESCAPE`  → `FORBIDDEN`
 */
export interface PathValidationCause {
	kind: "PATH_VALIDATION";
	code: PathValidationCode;
}

/** The errno values host-service translates instead of rethrowing as 500s. */
export type FsErrnoCode =
	| "ENOENT"
	| "EISDIR"
	| "ENOTDIR"
	| "EACCES"
	| "EPERM"
	| "ENOSPC";

/**
 * A recognized filesystem errno, message preserved verbatim.
 *
 * Code depends on `errno`:
 * - `ENOENT`  → `NOT_FOUND`
 * - `EISDIR`  → `BAD_REQUEST`
 * - `ENOTDIR` → `BAD_REQUEST`
 * - `EACCES`  → `FORBIDDEN`
 * - `EPERM`   → `FORBIDDEN`
 * - `ENOSPC`  → `PRECONDITION_FAILED`
 */
export interface FsErrnoCause {
	kind: "FS_ERRNO";
	errno: FsErrnoCode;
}

export type FilesystemErrorCause = PathValidationCause | FsErrnoCause;

// ── Git ────────────────────────────────────────────────────────────
//
// Sources: `rethrowEnvironmentalGitError` in
// packages/host-service/src/trpc/router/git/utils/classify-git-error.ts
// (post-hoc, matching git's own stderr) and `resolveWorktreePath` in
// .../utils/resolve-worktree.ts (pre-flight, before git runs).

/** `BAD_REQUEST` — the target directory is not a git repository. */
export interface NotGitRepoCause {
	kind: "NOT_GIT_REPO";
}

/**
 * `NOT_FOUND` — the directory resolves to a repository with no work tree:
 * a bare repo, or a linked worktree whose admin data was removed or pruned.
 */
export interface NotAWorkTreeCause {
	kind: "NOT_A_WORK_TREE";
}

/**
 * `NOT_FOUND` — the worktree is gone from disk. Raised pre-flight with
 * `worktreePath` when the check runs before git, and without it when git
 * itself reported the missing cwd mid-command, so consumers must treat the
 * field as optional.
 */
export interface WorktreeMissingCause {
	kind: "WORKTREE_MISSING";
	worktreePath?: string;
}

/**
 * `PRECONDITION_FAILED` — the worktree exists but git could not read its
 * working directory (typically a macOS permission denial).
 */
export interface GitEnvironmentCause {
	kind: "GIT_ENVIRONMENT";
}

/**
 * `PRECONDITION_FAILED` — no GitHub token is available to this runtime.
 * Thrown by the shared `ctx.github()` factory, so every procedure that
 * reaches GitHub inherits it: `github.*`, `pullRequests.*`, and the
 * PR-aware half of `git.*`.
 */
export interface NoGitHubTokenCause {
	kind: "NO_GITHUB_TOKEN";
}

export type GitErrorCause =
	| NotGitRepoCause
	| NotAWorkTreeCause
	| WorktreeMissingCause
	| GitEnvironmentCause
	| NoGitHubTokenCause;

// ── Agents ─────────────────────────────────────────────────────────

/**
 * `PRECONDITION_FAILED` — the runtime holds no model-provider credentials,
 * so no agent can be started. Surfaces from the agent-run and chat paths.
 */
export interface NoModelProviderCredentialsCause {
	kind: "NO_MODEL_PROVIDER_CREDENTIALS";
}

export type AgentErrorCause = NoModelProviderCredentialsCause;

// ── Union ──────────────────────────────────────────────────────────

export type WorkspaceContractErrorCause =
	| TerminalErrorCause
	| FilesystemErrorCause
	| GitErrorCause
	| AgentErrorCause;

export type WorkspaceContractErrorKind = WorkspaceContractErrorCause["kind"];

export const WORKSPACE_CONTRACT_ERROR_KINDS = [
	"SESSION_WRONG_WORKSPACE",
	"SESSION_NOT_FOUND",
	"SESSION_EXITED",
	"SESSION_NOT_ACTIVE",
	"WORKSPACE_NOT_FOUND",
	"WORKTREE_GONE",
	"DAEMON_UNAVAILABLE",
	"PATH_VALIDATION",
	"FS_ERRNO",
	"NOT_GIT_REPO",
	"NOT_A_WORK_TREE",
	"WORKTREE_MISSING",
	"GIT_ENVIRONMENT",
	"NO_GITHUB_TOKEN",
	"NO_MODEL_PROVIDER_CREDENTIALS",
] as const satisfies readonly WorkspaceContractErrorKind[];

/**
 * Narrows an unknown `TRPCClientError.cause` (or `error.data`) to the
 * taxonomy. Use this instead of string-matching `kind` at call sites — a
 * kind removed from the union then breaks the consumer at compile time
 * rather than silently never matching.
 */
export function isWorkspaceContractError(
	cause: unknown,
): cause is WorkspaceContractErrorCause {
	if (!cause || typeof cause !== "object" || !("kind" in cause)) return false;
	const { kind } = cause as { kind: unknown };
	return (
		typeof kind === "string" &&
		(WORKSPACE_CONTRACT_ERROR_KINDS as readonly string[]).includes(kind)
	);
}

/**
 * Deliberately excluded — control-plane causes, thrown only by procedures
 * outside the contract, and meaningless to a sandbox that cannot create or
 * destroy itself:
 *
 * - `TEARDOWN_FAILED`    (`workspaceCleanup.destroy`, `INTERNAL_SERVER_ERROR`)
 * - `DELETE_IN_PROGRESS` (`workspaceCleanup.destroy`, `CONFLICT`)
 * - `PROJECT_NOT_SETUP`  (`workspaceCreation.*`, `PRECONDITION_FAILED`)
 * - `PROJECT_DIR_MISSING`(`workspaceCreation.*`, `PRECONDITION_FAILED`)
 *
 * They stay defined in host-service (`src/trpc/error-types.ts`) and keep
 * their `errorFormatter` passthrough there.
 */
