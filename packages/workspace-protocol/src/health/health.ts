import { z } from "zod";

/**
 * Liveness probe. Public on purpose: it carries no workspace data, and a
 * caller has to be able to reach it before it holds a token — including
 * `superset status`, which uses `registrationError` to explain a runtime that
 * is locally healthy but invisible to the cloud.
 */
export const healthCheckOutput = z.object({
	status: z.literal("ok"),
	cloudRegistered: z.boolean(),
	registrationError: z.string().nullable(),
});
