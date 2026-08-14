import { z } from "zod";
import type { ContractNamespace } from "../procedure";
import { base64PayloadSchema } from "../schemas/filesystem";

export const attachmentsContract = {
	/**
	 * Upload one attachment to the workspace runtime's storage. Returns an
	 * opaque `attachmentId` callers reference in agent prompts; the on-disk
	 * path is never exposed to clients.
	 */
	upload: {
		kind: "mutation",
		exposure: "authenticated",
		input: z.object({
			data: base64PayloadSchema.extend({ data: z.string().min(1) }),
			mediaType: z.string(),
			originalFilename: z.string().optional(),
		}),
		output: z.object({
			attachmentId: z.string(),
			originalFilename: z.string().optional(),
			mediaType: z.string(),
			sizeBytes: z.number(),
		}),
	},

	/** Idempotent: succeeds whether or not the attachment still exists. */
	delete: {
		kind: "mutation",
		exposure: "authenticated",
		input: z.object({ attachmentId: z.string().uuid() }),
		output: z.object({ success: z.literal(true) }),
	},
} as const satisfies ContractNamespace;
