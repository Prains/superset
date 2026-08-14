import { z } from "zod";

export const terminalSessionSummarySchema = z.object({
	terminalId: z.string(),
	workspaceId: z.string(),
	createdAt: z.number(),
	exited: z.boolean(),
	exitCode: z.number(),
	attached: z.boolean(),
	title: z.string().nullable(),
});

/** Result of a bulk dispose (`disposeWorkspaceSessions` and friends). */
export const terminalDisposalResultSchema = z.object({
	terminated: z.number(),
	failed: z.number(),
});

export const terminalRefSchema = z.object({
	terminalId: z.string(),
	workspaceId: z.string(),
});

export const createdTerminalSessionSchema = z.object({
	terminalId: z.string(),
	status: z.literal("active"),
});

export const terminalCreateSessionInput = z.object({
	workspaceId: z.string(),
	terminalId: z.string().optional(),
	initialCommand: z.string().trim().min(1).optional(),
	cwd: z.string().optional(),
	themeType: z.string().optional(),
	cols: z.number().int().positive().optional(),
	rows: z.number().int().positive().optional(),
});

/** `createSession` with a mandatory `initialCommand`. */
export const terminalLaunchSessionInput = terminalCreateSessionInput.extend({
	initialCommand: z.string().trim().min(1),
});

export const terminalListInput = z
	.object({ workspaceId: z.string().optional() })
	.optional();

export const terminalListOutput = z.object({
	sessions: z.array(terminalSessionSummarySchema),
});

export const terminalHasRunningProcessOutput = z.object({
	running: z.boolean(),
});

export const terminalWriteInputInput = terminalRefSchema.extend({
	data: z.string(),
});

export const terminalWriteInputOutput = z.object({
	success: z.literal(true),
});

/**
 * Send a follow-up message into an already-running terminal instead of
 * spawning a new session. Multi-line text is framed as a bracketed paste
 * server-side.
 */
export const terminalSendInput = terminalRefSchema.extend({
	text: z.string().min(1),
	submit: z.boolean().default(true),
});

export const terminalSendOutput = z.object({
	terminalId: z.string(),
	submitted: z.boolean(),
});

/**
 * Non-destructive snapshot of the terminal's current screen plus recent
 * scrollback, read off the per-session headless emulator.
 */
export const terminalSnapshotInput = terminalRefSchema.extend({
	maxLines: z.number().int().positive().optional(),
});

export const terminalSnapshotOutput = z.object({
	terminalId: z.string(),
	cols: z.number(),
	rows: z.number(),
	/** Plain text of the emulator buffer (alt-screen for TUI agents). */
	text: z.string(),
});

export const terminalKillSessionOutput = z.object({
	terminalId: z.string(),
	status: z.literal("disposed"),
});

/**
 * Kill every session for a workspace, including backgrounded,
 * client-detached ones.
 */
export const terminalDisposeWorkspaceSessionsInput = z.object({
	workspaceId: z.string(),
});

/**
 * @deprecated Renaming to `terminal.disposeSessionsByPath` in the
 * desktop-adoption PR — "worktree" names a device-side git layout that a
 * sandbox runtime has no equivalent of, while the argument is really just a
 * filesystem path. The path stays wire-identical until then.
 */
export const terminalDisposeWorktreeSessionsInput = z.object({
	worktreePath: z.string(),
});

/**
 * Whether the terminal runtime is still answering, and for how long it has
 * not been. Deliberately non-blocking: it is polled to decide whether a stall
 * is worth surfacing, so it must answer immediately rather than wait on the
 * thing that may be wedged.
 *
 * @deprecated `terminal.daemon.getHealth` is renaming to `terminal.health` in
 * the desktop-adoption PR. "daemon" names the device's pty-daemon process; a
 * sandbox runtime has a terminal runtime but no daemon supervisor.
 */
export const terminalDaemonGetHealthOutput = z
	.object({
		reachable: z.boolean(),
		unreachableForMs: z.number(),
	})
	.nullable();

/**
 * Force-restart the terminal runtime. Destructive: live sessions do not
 * survive.
 *
 * @deprecated `terminal.daemon.restart` is renaming to
 * `terminal.restartRuntime` in the desktop-adoption PR, for the same reason
 * as `terminal.daemon.getHealth`.
 */
export const terminalDaemonRestartOutput = z.object({
	success: z.literal(true),
});
