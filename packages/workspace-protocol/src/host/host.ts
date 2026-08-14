import { z } from "zod";

/**
 * Identity and version of the process serving this protocol.
 *
 * @deprecated `host.info` is renaming to `runtime.info` in the
 * desktop-adoption PR: "host" is device-side vocabulary and a cloud sandbox is
 * not a host. `hostId`/`hostName` become generic runtime identity fields
 * there. The path stays wire-identical until that PR runs the rename on both
 * sides.
 */
export const hostInfoOutput = z.object({
	hostId: z.string(),
	hostName: z.string(),
	version: z.string(),
	organization: z.object({
		id: z.string(),
		name: z.string(),
		slug: z.string(),
	}),
	platform: z.string(),
	uptime: z.number(),
});
