import { z } from "zod";
import type { ProtocolNamespace } from "../procedure";
import { pullRequestWorkspaceSnapshotSchema } from "../schemas/git";

const workspaceIdsSchema = z.object({ workspaceIds: z.array(z.string()) });

/**
 * The workspace-level PR projection. `pullRequests.getContent` is excluded:
 * it serves the desktop's PR reader (full diff bodies, review payloads) and
 * belongs to the device overlay, not to the workspace API surface.
 */
export const pullRequestsContract = {
	getByWorkspaces: {
		kind: "query",
		exposure: "authenticated",
		input: workspaceIdsSchema,
		output: z.object({
			workspaces: z.array(pullRequestWorkspaceSnapshotSchema),
		}),
	},

	refreshByWorkspaces: {
		kind: "mutation",
		exposure: "authenticated",
		input: workspaceIdsSchema,
		output: z.object({ ok: z.boolean() }),
	},

	unlinkFromWorkspace: {
		kind: "mutation",
		exposure: "authenticated",
		input: z.object({ workspaceId: z.string() }),
		output: z.object({ ok: z.boolean() }),
	},
} as const satisfies ProtocolNamespace;
