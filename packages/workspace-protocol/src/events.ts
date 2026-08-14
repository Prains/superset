/**
 * Event-bus messages carried over the `/events` WebSocket.
 *
 * The bus is a broadcast: every message goes to every connected client of a
 * runtime, and receivers filter by `workspaceId`. A sandbox runtime serves
 * exactly one workspace, so its filter is trivially satisfied — but the
 * shapes stay identical so one client implementation works against both.
 *
 * Deliberately NOT in the protocol:
 * - `workspace:create-settled` — creation is a control-plane act for a
 *   sandbox (the cloud registry creates it before the VM exists), so a
 *   sandbox never emits a settle for its own creation.
 * - `project:changed` — projects are a device concept; a sandbox has one
 *   synthetic project row that never changes.
 * Device host-service still emits both; they are simply outside the surface
 * a sandbox must implement.
 */

import { z } from "zod";

// ── Server → Client ───────────────────────────────────────────────────────

/**
 * Raw watched-file changes. `events` is passed through from the platform
 * watcher; consumers must tolerate coalescing and duplicate delivery, which
 * differ per OS.
 */
export const fsEventsMessageSchema = z.object({
	type: z.literal("fs:events"),
	workspaceId: z.string(),
	events: z.array(z.unknown()),
});

/**
 * Absent `paths` is meaningful: it signals a broad `.git/` change (commit,
 * index, refs) and consumers should invalidate everything for the workspace
 * rather than assume nothing moved.
 */
export const gitChangedMessageSchema = z.object({
	type: z.literal("git:changed"),
	workspaceId: z.string(),
	paths: z.array(z.string()).optional(),
});

/**
 * Agent lifecycle, fanned out from the loopback `notifications.hook`. This is
 * what drives working indicators, chimes, and resume banners — the reason
 * that hook exists and the reason it must never be remotely reachable.
 * `agent` is absent for shells that bypass our hook wrappers.
 */
export const agentLifecycleMessageSchema = z.object({
	type: z.literal("agent:lifecycle"),
	workspaceId: z.string(),
	eventType: z.string(),
	terminalId: z.string(),
	agent: z
		.object({
			agentId: z.string().optional(),
			sessionId: z.string().optional(),
			definitionId: z.string().optional(),
		})
		.optional(),
	occurredAt: z.number(),
});

export const terminalLifecycleMessageSchema = z.object({
	type: z.literal("terminal:lifecycle"),
	workspaceId: z.string(),
	terminalId: z.string(),
	eventType: z.literal("exit"),
	exitCode: z.number(),
	signal: z.number(),
	occurredAt: z.number(),
});

export const portChangedMessageSchema = z.object({
	type: z.literal("port:changed"),
	workspaceId: z.string(),
	eventType: z.enum(["add", "remove"]),
	port: z.unknown(),
	label: z.string().nullable(),
	occurredAt: z.number(),
});

/**
 * Workspace metadata changed. A sandbox emits this for its own single
 * workspace; `workspace` is null on delete.
 */
export const workspaceChangedMessageSchema = z.object({
	type: z.literal("workspace:changed"),
	workspaceId: z.string(),
	eventType: z.enum(["created", "updated", "deleted"]),
	workspace: z.unknown().nullable(),
	occurredAt: z.number(),
});

export const errorMessageSchema = z.object({
	type: z.literal("error"),
	message: z.string(),
});

export const serverMessageSchema = z.discriminatedUnion("type", [
	fsEventsMessageSchema,
	gitChangedMessageSchema,
	agentLifecycleMessageSchema,
	terminalLifecycleMessageSchema,
	portChangedMessageSchema,
	workspaceChangedMessageSchema,
	errorMessageSchema,
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

// ── Client → Server ───────────────────────────────────────────────────────

/** Subscribe to recursive watching for a workspace. */
export const fsWatchMessageSchema = z.object({
	type: z.literal("fs:watch"),
	workspaceId: z.string(),
});

export const fsUnwatchMessageSchema = z.object({
	type: z.literal("fs:unwatch"),
	workspaceId: z.string(),
});

/**
 * Targeted watch for one file. Only installs a real watcher when the path is
 * pruned from the recursive watch (gitignored build dir, node_modules, nested
 * repo); a covered path records a no-op so unwatch stays symmetric.
 * Duplicate watches are deduped: one unwatch always stops delivery.
 */
export const fsWatchFileMessageSchema = z.object({
	type: z.literal("fs:watch-file"),
	workspaceId: z.string(),
	absolutePath: z.string(),
});

export const fsUnwatchFileMessageSchema = z.object({
	type: z.literal("fs:unwatch-file"),
	workspaceId: z.string(),
	absolutePath: z.string(),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
	fsWatchMessageSchema,
	fsUnwatchMessageSchema,
	fsWatchFileMessageSchema,
	fsUnwatchFileMessageSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
