import { z } from "zod";
import { base64PayloadSchema } from "../shared";

/**
 * Upload one attachment to the workspace runtime's storage. Returns an opaque
 * `attachmentId` callers reference in agent prompts; the on-disk path is never
 * exposed to clients.
 */
export const attachmentsUploadInput = z.object({
	data: base64PayloadSchema.extend({ data: z.string().min(1) }),
	mediaType: z.string(),
	originalFilename: z.string().optional(),
});

export const attachmentsUploadOutput = z.object({
	attachmentId: z.string(),
	originalFilename: z.string().optional(),
	mediaType: z.string(),
	sizeBytes: z.number(),
});

/** Idempotent: succeeds whether or not the attachment still exists. */
export const attachmentsDeleteInput = z.object({
	attachmentId: z.string().uuid(),
});

export const attachmentsDeleteOutput = z.object({
	success: z.literal(true),
});
