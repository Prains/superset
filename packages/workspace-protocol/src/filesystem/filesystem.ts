import { z } from "zod";
import { base64PayloadSchema } from "../shared";

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

/** Payload of an `fs:events` bus message; see `../events`. */
export const fsWatchEventSchema = z.object({
	kind: z.enum(["create", "update", "delete", "rename", "overflow"]),
	absolutePath: z.string(),
	oldAbsolutePath: z.string().optional(),
	isDirectory: z.boolean().optional(),
});

export const fsWorkspacePathSchema = z.object({
	workspaceId: z.string(),
	absolutePath: z.string(),
});

export const fsSearchOptionsSchema = z.object({
	query: z.string(),
	includeHidden: z.boolean().optional(),
	includePattern: z.string().optional(),
	excludePattern: z.string().optional(),
	limit: z.number().optional(),
});

export const filesystemListDirectoryOutput = z.object({
	entries: z.array(fsEntrySchema),
});

export const filesystemReadFileInput = fsWorkspacePathSchema.extend({
	offset: z.number().optional(),
	maxBytes: z.number().optional(),
	encoding: z.string().optional(),
});

/**
 * `filesystem.readFile` re-encodes the binary arm before it leaves the
 * server: the service returns `Uint8Array`, the procedure base64s it. The
 * wire type is therefore `string` on both arms.
 */
export const filesystemReadFileOutput = z.union([
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

export const filesystemGetMetadataOutput = fsMetadataSchema.nullable();

/**
 * Resolve a path (absolute, relative-to-root, or `~`-prefixed) and report
 * whether it exists. `null` for anything unresolvable — used by the terminal
 * link detector, which must not treat a miss as an error.
 *
 * A mutation despite being a pure read: it deliberately opts out of the query
 * timeout middleware and of client-side query caching, because the caller
 * resolves many one-shot paths per terminal frame.
 */
export const filesystemStatPathInput = z.object({
	workspaceId: z.string(),
	path: z.string(),
});

export const filesystemStatPathOutput = z
	.object({ resolvedPath: z.string(), isDirectory: z.boolean() })
	.nullable();

export const filesystemWriteFileInput = fsWorkspacePathSchema.extend({
	content: z.union([z.string(), base64PayloadSchema]),
	encoding: z.string().optional(),
	options: z.object({ create: z.boolean(), overwrite: z.boolean() }).optional(),
	precondition: z.object({ ifMatch: z.string() }).optional(),
});

export const filesystemWriteFileOutput = z.union([
	z.object({ ok: z.literal(true), revision: z.string() }),
	z.object({
		ok: z.literal(false),
		reason: z.literal("conflict"),
		currentRevision: z.string(),
	}),
	z.object({ ok: z.literal(false), reason: z.literal("exists") }),
	z.object({ ok: z.literal(false), reason: z.literal("not-found") }),
]);

export const filesystemCreateDirectoryInput = fsWorkspacePathSchema.extend({
	recursive: z.boolean().optional(),
});

export const filesystemCreateDirectoryOutput = z.object({
	absolutePath: z.string(),
	kind: z.literal("directory"),
});

export const filesystemDeletePathInput = fsWorkspacePathSchema.extend({
	permanent: z.boolean().optional(),
});

export const filesystemDeletePathOutput = z.object({
	absolutePath: z.string(),
});

export const filesystemMovePathInput = z.object({
	workspaceId: z.string(),
	sourceAbsolutePath: z.string(),
	destinationAbsolutePath: z.string(),
});

export const filesystemMovePathOutput = z.object({
	fromAbsolutePath: z.string(),
	toAbsolutePath: z.string(),
});

export const filesystemCopyPathInput = z.object({
	workspaceId: z.string(),
	sourceAbsolutePath: z.string(),
	destinationAbsolutePath: z.string(),
});

export const filesystemCopyPathOutput = z.object({
	fromAbsolutePath: z.string(),
	toAbsolutePath: z.string(),
});

/**
 * Fuzzy filename search. Exactly one of `workspaceId` / `projectId` must be
 * set; a `projectId` that this host has never cloned resolves to an empty
 * match list rather than a 404.
 */
export const filesystemSearchFilesInput = fsSearchOptionsSchema
	.extend({
		workspaceId: z.string().optional(),
		projectId: z.string().optional(),
	})
	.refine(
		(value) => !!value.workspaceId !== !!value.projectId,
		"Exactly one of workspaceId or projectId must be provided",
	);

export const filesystemSearchFilesOutput = z.object({
	matches: z.array(fsSearchMatchSchema),
});

export const filesystemSearchContentInput = fsSearchOptionsSchema.extend({
	workspaceId: z.string(),
});

export const filesystemSearchContentOutput = z.object({
	matches: z.array(fsContentMatchSchema),
});
