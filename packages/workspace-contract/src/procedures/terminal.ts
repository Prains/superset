import { z } from "zod";
import type { ContractNamespace } from "../procedure";
import {
	daemonHealthSchema,
	terminalDisposalResultSchema,
	terminalSessionSummarySchema,
} from "../schemas/terminal";

export const createTerminalSessionInputSchema = z.object({
	workspaceId: z.string(),
	terminalId: z.string().optional(),
	initialCommand: z.string().trim().min(1).optional(),
	cwd: z.string().optional(),
	themeType: z.string().optional(),
	cols: z.number().int().positive().optional(),
	rows: z.number().int().positive().optional(),
});

export const launchTerminalSessionInputSchema =
	createTerminalSessionInputSchema.extend({
		initialCommand: z.string().trim().min(1),
	});

export const createdTerminalSessionSchema = z.object({
	terminalId: z.string(),
	status: z.literal("active"),
});

const terminalRefSchema = z.object({
	terminalId: z.string(),
	workspaceId: z.string(),
});

export const terminalContract = {
	createSession: {
		kind: "mutation",
		exposure: "authenticated",
		input: createTerminalSessionInputSchema,
		output: createdTerminalSessionSchema,
	},

	/** `createSession` with a mandatory `initialCommand`. */
	launchSession: {
		kind: "mutation",
		exposure: "authenticated",
		input: launchTerminalSessionInputSchema,
		output: createdTerminalSessionSchema,
	},

	list: {
		kind: "query",
		exposure: "authenticated",
		input: z.object({ workspaceId: z.string().optional() }).optional(),
		output: z.object({ sessions: z.array(terminalSessionSummarySchema) }),
	},

	hasRunningProcess: {
		kind: "query",
		exposure: "authenticated",
		input: terminalRefSchema,
		output: z.object({ running: z.boolean() }),
	},

	writeInput: {
		kind: "mutation",
		exposure: "authenticated",
		input: terminalRefSchema.extend({ data: z.string() }),
		output: z.object({ success: z.literal(true) }),
	},

	/**
	 * Send a follow-up message into an already-running terminal instead of
	 * spawning a new session. Multi-line text is framed as a bracketed paste
	 * server-side.
	 */
	send: {
		kind: "mutation",
		exposure: "authenticated",
		input: terminalRefSchema.extend({
			text: z.string().min(1),
			submit: z.boolean().default(true),
		}),
		output: z.object({ terminalId: z.string(), submitted: z.boolean() }),
	},

	/**
	 * Non-destructive snapshot of the terminal's current screen plus recent
	 * scrollback, read off the per-session headless emulator.
	 */
	snapshot: {
		kind: "query",
		exposure: "authenticated",
		input: terminalRefSchema.extend({
			maxLines: z.number().int().positive().optional(),
		}),
		output: z.object({
			terminalId: z.string(),
			cols: z.number(),
			rows: z.number(),
			/** Plain text of the emulator buffer (alt-screen for TUI agents). */
			text: z.string(),
		}),
	},

	killSession: {
		kind: "mutation",
		exposure: "authenticated",
		input: terminalRefSchema,
		output: z.object({
			terminalId: z.string(),
			status: z.literal("disposed"),
		}),
	},

	/**
	 * Kill every session for a workspace, including backgrounded,
	 * client-detached ones.
	 */
	disposeWorkspaceSessions: {
		kind: "mutation",
		exposure: "authenticated",
		input: z.object({ workspaceId: z.string() }),
		output: terminalDisposalResultSchema,
	},

	/**
	 * @deprecated Renaming to `terminal.disposeSessionsByPath` in the
	 * desktop-adoption PR — "worktree" names a device-side git layout that a
	 * sandbox runtime has no equivalent of, while the argument is really just
	 * a filesystem path. The path stays wire-identical until then.
	 */
	disposeWorktreeSessions: {
		kind: "mutation",
		exposure: "authenticated",
		input: z.object({ worktreePath: z.string() }),
		output: terminalDisposalResultSchema,
		deprecated: {
			replacement: "terminal.disposeSessionsByPath",
			reason:
				"`worktreePath` is a device-side git concept; the operation is path-scoped disposal.",
		},
	},

	daemon: {
		/**
		 * Whether the terminal runtime is still answering, and for how long it
		 * has not been. Deliberately non-blocking: it is polled to decide
		 * whether a stall is worth surfacing, so it must answer immediately
		 * rather than wait on the thing that may be wedged.
		 *
		 * @deprecated Renaming to `terminal.health` in the desktop-adoption
		 * PR. "daemon" names the device's pty-daemon process; a sandbox
		 * runtime has a terminal runtime but no daemon supervisor.
		 */
		getHealth: {
			kind: "query",
			exposure: "authenticated",
			input: z.void(),
			output: daemonHealthSchema,
			deprecated: {
				replacement: "terminal.health",
				reason:
					"`daemon` names the device pty-daemon; the contract-level concept is terminal-runtime health.",
			},
		},

		/**
		 * Force-restart the terminal runtime. Destructive: live sessions do
		 * not survive.
		 *
		 * @deprecated Renaming to `terminal.restartRuntime` in the
		 * desktop-adoption PR, for the same reason as `daemon.getHealth`.
		 */
		restart: {
			kind: "mutation",
			exposure: "authenticated",
			input: z.void(),
			output: z.object({ success: z.literal(true) }),
			deprecated: {
				replacement: "terminal.restartRuntime",
				reason:
					"`daemon` names the device pty-daemon; the contract-level concept is restarting the terminal runtime.",
			},
		},
	},
} as const satisfies ContractNamespace;
