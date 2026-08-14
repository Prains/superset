import { z } from "zod";
import type { ContractNamespace } from "../procedure";
import { enrichedPortSchema, portEventSchema } from "../schemas/terminal";

const workspaceIdsSchema = z.object({
	workspaceIds: z.array(z.string()).min(1),
});

export const portsContract = {
	getAll: {
		kind: "query",
		exposure: "authenticated",
		input: workspaceIdsSchema,
		output: z.array(enrichedPortSchema),
	},

	/**
	 * Stream port add/remove events for the requested workspaces. The stream
	 * runs until the client disconnects or its abort signal fires.
	 */
	subscribe: {
		kind: "subscription",
		exposure: "authenticated",
		input: workspaceIdsSchema,
		output: portEventSchema,
	},

	kill: {
		kind: "mutation",
		exposure: "authenticated",
		input: z.object({
			workspaceId: z.string(),
			terminalId: z.string(),
			port: z.number().int().positive(),
		}),
		output: z.object({
			success: z.boolean(),
			error: z.string().optional(),
		}),
	},
} as const satisfies ContractNamespace;
