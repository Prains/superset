import { z } from "zod";
import type { ProtocolNamespace } from "../procedure";

export const notificationsContract = {
	/**
	 * Agent lifecycle hook ingress. The in-shell hook script POSTs here; the
	 * server normalizes the event, resolves the terminal's workspace, and
	 * fans it out on the event bus as `agent:lifecycle`. Unrecognized event
	 * types and unknown terminal ids are accepted and ignored (`ignored:
	 * true`) rather than rejected — the hook must never fail a user's shell.
	 *
	 * UNAUTHENTICATED BY DESIGN, AND LOOPBACK-ONLY. Reusing the workspace
	 * bearer token would leak it into every agent shell's environment for no
	 * practical gain, so this procedure accepts anonymous callers. That is
	 * only safe because the caller is inside the workspace, dialing
	 * 127.0.0.1. A runtime serving this protocol MUST NOT make this path
	 * reachable through the relay, a tunnel, or any other remote ingress:
	 * an anonymous remote caller could otherwise forge lifecycle events for
	 * any terminal id — chimes, working indicators, and the forward-only
	 * "linked task started" nudge.
	 */
	hook: {
		kind: "mutation",
		exposure: "loopback-only",
		input: z.object({
			terminalId: z.string().optional(),
			eventType: z.string().optional(),
			agent: z
				.object({
					agentId: z.string().optional(),
					sessionId: z.string().optional(),
					definitionId: z.string().optional(),
				})
				.optional(),
		}),
		output: z.object({ success: z.boolean(), ignored: z.boolean() }),
	},
} as const satisfies ProtocolNamespace;
