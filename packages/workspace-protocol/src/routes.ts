/**
 * The non-tRPC surface of the workspace protocol: WebSocket and REST routes,
 * plus the replay invariants a terminal transport must honor.
 *
 * These are as load-bearing as the procedures. A runtime that serves every
 * tRPC procedure but gets the terminal attach semantics wrong produces
 * garbled scrollback on reconnect, which reads to a user as data loss.
 */

import { z } from "zod";

// ── Terminal ──────────────────────────────────────────────────────────────

/**
 * Live scrollback retained per session and replayed on a plain attach. A
 * client that attaches without a cursor gets at most this many bytes.
 */
export const TERMINAL_REPLAY_BUFFER_BYTES = 64 * 1024;

/**
 * Bytes retained beyond the replay buffer to satisfy `seq`-cursor catch-up.
 * A reconnecting client whose cursor still falls inside this window resumes
 * exactly; one that has fallen out of it must reanchor.
 */
export const TERMINAL_CATCHUP_RING_BYTES = 2 * 1024 * 1024;

/**
 * How a reattach resolved against the server's ring:
 * - `exact`: the client's cursor was in the ring; bytes resume with no gap.
 * - `tail`: the client asked for the tail; it gets the replay buffer.
 * - `reanchor`: the cursor was too old (or malformed). The server refuses to
 *   dump a partial stream and the client restarts its view. Malformed cursors
 *   degrade to this deliberately — never to `exact`.
 */
export const TERMINAL_ATTACH_MODES = ["exact", "tail", "reanchor"] as const;
export type TerminalAttachMode = (typeof TERMINAL_ATTACH_MODES)[number];

/** `GET /terminal/:terminalId` — WebSocket attach to a live PTY. */
export const TERMINAL_ATTACH_ROUTE = "/terminal/:terminalId" as const;

export const terminalAttachQuerySchema = z.object({
	workspaceId: z.string(),
	/**
	 * Resume cursor, `"<epoch>:<seq>"`. Absent means "tail": replay the
	 * buffer and continue. An epoch mismatch means the session restarted
	 * under the client, so the server reanchors.
	 */
	seq: z.string().optional(),
	/** `"1"` creates the session if it does not exist. */
	create: z.string().optional(),
	themeType: z.string().optional(),
});

/** REST session management, for clients not holding a socket. */
export const TERMINAL_SESSIONS_ROUTE = "/terminal/sessions" as const;
export const TERMINAL_SESSION_ROUTE = "/terminal/sessions/:terminalId" as const;

export const terminalCreateSessionBodySchema = z.object({
	terminalId: z.string(),
	workspaceId: z.string(),
	themeType: z.string().optional(),
	initialCommand: z.string().optional(),
	cwd: z.string().optional(),
	cols: z.number().optional(),
	rows: z.number().optional(),
});

export const terminalListSessionsQuerySchema = z.object({
	workspaceId: z.string().optional(),
});

// ── Event bus ─────────────────────────────────────────────────────────────

/** `GET /events` — WebSocket carrying the messages in `./events`. */
export const EVENTS_ROUTE = "/events" as const;

// ── Chat v3 ───────────────────────────────────────────────────────────────

/**
 * chat-v3 mounts its own tRPC instance and stream rather than joining the
 * workspace router, so the contract pins the mount points only. Legacy chat
 * (`chat.*`) is deliberately absent: it is being removed product-wide, and a
 * sandbox never serves it.
 */
export const CHAT_V3_TRPC_ROUTE = "/chat-v3/trpc" as const;
export const CHAT_V3_STREAM_ROUTE =
	"/chat-v3/sessions/:sessionId/stream" as const;

export const chatV3StreamQuerySchema = z.object({
	/** Resume cursor into the session journal. */
	since: z.string().optional(),
	/** Comma-separated delta channels to subscribe to. */
	deltas: z.string().optional(),
});

// ── Auth ──────────────────────────────────────────────────────────────────

/**
 * Every route above is guarded by the same pre-shared key the tRPC surface
 * uses: `Authorization: Bearer <secret>`, or `?token=` for WebSocket clients
 * that cannot set headers. The relay re-injects it on the host's behalf.
 */
export const WS_TOKEN_QUERY_PARAM = "token" as const;
