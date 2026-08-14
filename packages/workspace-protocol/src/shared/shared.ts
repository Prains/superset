import { z } from "zod";

/** Base64 envelope used wherever binary content crosses the wire as JSON. */
export const base64PayloadSchema = z.object({
	kind: z.literal("base64"),
	data: z.string(),
});
