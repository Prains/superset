import { z } from "zod";
import type { ContractNamespace } from "../procedure";

/**
 * Liveness probe. Public on purpose: it carries no workspace data, and a
 * caller has to be able to reach it before it holds a token — including
 * `superset status`, which uses `registrationError` to explain a runtime
 * that is locally healthy but invisible to the cloud.
 */
export const healthContract = {
	check: {
		kind: "query",
		exposure: "public",
		input: z.void(),
		output: z.object({
			status: z.literal("ok"),
			cloudRegistered: z.boolean(),
			registrationError: z.string().nullable(),
		}),
	},
} as const satisfies ContractNamespace;
