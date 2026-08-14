import { z } from "zod";

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

export const portsWorkspaceIdsSchema = z.object({
	workspaceIds: z.array(z.string()).min(1),
});

export const portsGetAllOutput = z.array(enrichedPortSchema);

/**
 * Stream port add/remove events for the requested workspaces. The stream runs
 * until the client disconnects or its abort signal fires.
 */
export const portsSubscribeOutput = z.union([
	z.object({ type: z.literal("add"), port: detectedPortSchema }),
	z.object({ type: z.literal("remove"), port: detectedPortSchema }),
]);

export const portsKillInput = z.object({
	workspaceId: z.string(),
	terminalId: z.string(),
	port: z.number().int().positive(),
});

export const portsKillOutput = z.object({
	success: z.boolean(),
	error: z.string().optional(),
});
