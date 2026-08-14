import { z } from "zod";
import type { ProtocolNamespace } from "../procedure";

export const hostContract = {
	/**
	 * Identity and version of the process serving this protocol.
	 *
	 * @deprecated Renaming to `runtime.info` in the desktop-adoption PR:
	 * "host" is device-side vocabulary and a cloud sandbox is not a host.
	 * `hostId`/`hostName` become generic runtime identity fields there. The
	 * path stays wire-identical until that PR runs the rename on both sides.
	 */
	info: {
		kind: "query",
		exposure: "authenticated",
		input: z.void(),
		output: z.object({
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
		}),
		deprecated: {
			replacement: "runtime.info",
			reason:
				"`host` is device-side vocabulary; a cloud sandbox serves the same contract without being a host.",
		},
	},
} as const satisfies ProtocolNamespace;
