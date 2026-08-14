import { z } from "zod";
import type { ProtocolNamespace } from "../procedure";

const authStatusSchema = z.object({
	authenticated: z.boolean(),
	method: z.enum(["api_key", "oauth", "env"]).nullable(),
	source: z.enum(["external", "managed"]).nullable(),
	issue: z.literal("expired").nullable(),
	hasManagedOAuth: z.boolean().optional(),
});

/**
 * Read-only credential status, so a workspace client can tell the user why
 * an agent will not start. The mutating half of host-service's `auth.*`
 * (OAuth start/complete/cancel/disconnect, API-key writes, env-config edits)
 * is device-only: model credentials are acquired on the person's machine,
 * and a sandbox runtime is handed them rather than acquiring them itself.
 */
export const authContract = {
	getAnthropicStatus: {
		kind: "query",
		exposure: "authenticated",
		input: z.void(),
		output: authStatusSchema,
	},
	getOpenAIStatus: {
		kind: "query",
		exposure: "authenticated",
		input: z.void(),
		output: authStatusSchema,
	},
} as const satisfies ProtocolNamespace;
