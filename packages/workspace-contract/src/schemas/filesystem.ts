import { z } from "zod";

export const fsEntryKindSchema = z.enum([
	"file",
	"directory",
	"symlink",
	"other",
]);

export const fsEntrySchema = z.object({
	absolutePath: z.string(),
	name: z.string(),
	kind: fsEntryKindSchema,
});

/**
 * `filesystem.readFile` re-encodes the binary arm before it leaves the
 * server: the service returns `Uint8Array`, the procedure base64s it. The
 * wire type is therefore `string` on both arms.
 */
export const fsReadResultSchema = z.union([
	z.object({
		kind: z.literal("text"),
		content: z.string(),
		byteLength: z.number(),
		exceededLimit: z.boolean(),
		revision: z.string(),
	}),
	z.object({
		kind: z.literal("bytes"),
		content: z.string(),
		byteLength: z.number(),
		exceededLimit: z.boolean(),
		revision: z.string(),
	}),
]);

export const fsWriteResultSchema = z.union([
	z.object({ ok: z.literal(true), revision: z.string() }),
	z.object({
		ok: z.literal(false),
		reason: z.literal("conflict"),
		currentRevision: z.string(),
	}),
	z.object({ ok: z.literal(false), reason: z.literal("exists") }),
	z.object({ ok: z.literal(false), reason: z.literal("not-found") }),
]);

export const fsMetadataSchema = z.object({
	absolutePath: z.string(),
	kind: fsEntryKindSchema,
	size: z.number().nullable(),
	createdAt: z.string().nullable(),
	modifiedAt: z.string().nullable(),
	accessedAt: z.string().nullable(),
	mode: z.number().nullable().optional(),
	permissions: z.string().nullable().optional(),
	owner: z.string().nullable().optional(),
	group: z.string().nullable().optional(),
	symlinkTarget: z.string().nullable().optional(),
	revision: z.string(),
});

export const fsSearchMatchSchema = z.object({
	absolutePath: z.string(),
	relativePath: z.string(),
	name: z.string(),
	kind: fsEntryKindSchema,
	score: z.number(),
});

export const fsContentMatchSchema = z.object({
	absolutePath: z.string(),
	relativePath: z.string(),
	line: z.number(),
	column: z.number(),
	preview: z.string(),
});

export const fsWatchEventSchema = z.object({
	kind: z.enum(["create", "update", "delete", "rename", "overflow"]),
	absolutePath: z.string(),
	oldAbsolutePath: z.string().optional(),
	isDirectory: z.boolean().optional(),
});

/** Base64 envelope used wherever binary content crosses the wire as JSON. */
export const base64PayloadSchema = z.object({
	kind: z.literal("base64"),
	data: z.string(),
});
