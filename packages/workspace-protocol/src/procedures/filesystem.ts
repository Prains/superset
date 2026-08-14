import { z } from "zod";
import type { ProtocolNamespace } from "../procedure";
import {
	base64PayloadSchema,
	fsContentMatchSchema,
	fsEntrySchema,
	fsMetadataSchema,
	fsReadResultSchema,
	fsSearchMatchSchema,
	fsWriteResultSchema,
} from "../schemas/filesystem";

const workspacePathSchema = z.object({
	workspaceId: z.string(),
	absolutePath: z.string(),
});

const searchOptionsSchema = z.object({
	query: z.string(),
	includeHidden: z.boolean().optional(),
	includePattern: z.string().optional(),
	excludePattern: z.string().optional(),
	limit: z.number().optional(),
});

export const filesystemContract = {
	listDirectory: {
		kind: "query",
		exposure: "authenticated",
		input: workspacePathSchema,
		output: z.object({ entries: z.array(fsEntrySchema) }),
	},

	readFile: {
		kind: "query",
		exposure: "authenticated",
		timeoutMs: 30_000,
		input: workspacePathSchema.extend({
			offset: z.number().optional(),
			maxBytes: z.number().optional(),
			encoding: z.string().optional(),
		}),
		output: fsReadResultSchema,
	},

	getMetadata: {
		kind: "query",
		exposure: "authenticated",
		input: workspacePathSchema,
		output: fsMetadataSchema.nullable(),
	},

	/**
	 * Resolve a path (absolute, relative-to-root, or `~`-prefixed) and report
	 * whether it exists. `null` for anything unresolvable — used by the
	 * terminal link detector, which must not treat a miss as an error.
	 *
	 * A mutation despite being a pure read: it deliberately opts out of the
	 * query timeout middleware and of client-side query caching, because the
	 * caller resolves many one-shot paths per terminal frame.
	 */
	statPath: {
		kind: "mutation",
		exposure: "authenticated",
		input: z.object({ workspaceId: z.string(), path: z.string() }),
		output: z
			.object({ resolvedPath: z.string(), isDirectory: z.boolean() })
			.nullable(),
	},

	writeFile: {
		kind: "mutation",
		exposure: "authenticated",
		input: workspacePathSchema.extend({
			content: z.union([z.string(), base64PayloadSchema]),
			encoding: z.string().optional(),
			options: z
				.object({ create: z.boolean(), overwrite: z.boolean() })
				.optional(),
			precondition: z.object({ ifMatch: z.string() }).optional(),
		}),
		output: fsWriteResultSchema,
	},

	createDirectory: {
		kind: "mutation",
		exposure: "authenticated",
		input: workspacePathSchema.extend({ recursive: z.boolean().optional() }),
		output: z.object({
			absolutePath: z.string(),
			kind: z.literal("directory"),
		}),
	},

	deletePath: {
		kind: "mutation",
		exposure: "authenticated",
		input: workspacePathSchema.extend({ permanent: z.boolean().optional() }),
		output: z.object({ absolutePath: z.string() }),
	},

	movePath: {
		kind: "mutation",
		exposure: "authenticated",
		input: z.object({
			workspaceId: z.string(),
			sourceAbsolutePath: z.string(),
			destinationAbsolutePath: z.string(),
		}),
		output: z.object({
			fromAbsolutePath: z.string(),
			toAbsolutePath: z.string(),
		}),
	},

	copyPath: {
		kind: "mutation",
		exposure: "authenticated",
		input: z.object({
			workspaceId: z.string(),
			sourceAbsolutePath: z.string(),
			destinationAbsolutePath: z.string(),
		}),
		output: z.object({
			fromAbsolutePath: z.string(),
			toAbsolutePath: z.string(),
		}),
	},

	/**
	 * Fuzzy filename search. Exactly one of `workspaceId` / `projectId` must
	 * be set; a `projectId` that this host has never cloned resolves to an
	 * empty match list rather than a 404.
	 */
	searchFiles: {
		kind: "query",
		exposure: "authenticated",
		timeoutMs: 30_000,
		input: searchOptionsSchema
			.extend({
				workspaceId: z.string().optional(),
				projectId: z.string().optional(),
			})
			.refine(
				(value) => !!value.workspaceId !== !!value.projectId,
				"Exactly one of workspaceId or projectId must be provided",
			),
		output: z.object({ matches: z.array(fsSearchMatchSchema) }),
	},

	searchContent: {
		kind: "query",
		exposure: "authenticated",
		timeoutMs: 60_000,
		input: searchOptionsSchema.extend({ workspaceId: z.string() }),
		output: z.object({ matches: z.array(fsContentMatchSchema) }),
	},
} as const satisfies ProtocolNamespace;
