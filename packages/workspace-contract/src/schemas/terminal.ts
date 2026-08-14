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

export const daemonHealthSchema = z
	.object({
		reachable: z.boolean(),
		unreachableForMs: z.number(),
	})
	.nullable();

export const detectedPortSchema = z.object({
	port: z.number(),
	pid: z.number(),
	processName: z.string(),
	terminalId: z.string(),
	workspaceId: z.string(),
	detectedAt: z.number(),
	address: z.string(),
});

export const enrichedPortSchema = detectedPortSchema.extend({
	label: z.string().nullable(),
});

export const portEventSchema = z.union([
	z.object({ type: z.literal("add"), port: detectedPortSchema }),
	z.object({ type: z.literal("remove"), port: detectedPortSchema }),
]);
