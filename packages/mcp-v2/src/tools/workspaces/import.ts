import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_import",
		annotations: { destructiveHint: false },
		description:
			"Import a git worktree that already exists on a host into a Superset workspace, without creating a new worktree. Use this when something outside Superset (a script, a CI job, a manual `git worktree add`) already prepared the branch and directory and you only need Superset to manage sessions for it. `worktreePath` must be an absolute path on that host and must already be registered in the project's `git worktree list` — otherwise the call fails. Safe to repeat: importing the same path again reuses the existing workspace rather than duplicating it. To have Superset create the worktree itself, use workspaces_create instead. Use projects_list and hosts_list first to get the projectId and hostId.",
		inputSchema: {
			projectId: z.string().uuid().describe("Project UUID."),
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId the worktree lives on."),
			worktreePath: z
				.string()
				.min(1)
				.describe(
					"Absolute path of the existing worktree on the host, e.g. /Users/me/code/repo/.worktrees/my-branch.",
				),
			branch: z
				.string()
				.min(1)
				.describe(
					"Branch checked out in that worktree. The host reads the branch actually checked out at `worktreePath` and returns it, so compare the returned `workspace.branch` against what you sent.",
				),
			name: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Workspace name (display). Defaults to the worktree directory name.",
				),
			baseBranch: z
				.string()
				.optional()
				.describe("Branch to record as the compare base for this workspace."),
		},
		handler: async (input, ctx) => {
			const worktreePath = input.worktreePath.replace(/\/+$/, "");
			if (!worktreePath.startsWith("/")) {
				throw new Error(
					`worktreePath must be an absolute path on the host: ${input.worktreePath}`,
				);
			}
			const workspaceName =
				input.name ?? (worktreePath.split("/").pop() as string);

			return hostServiceCall<{
				workspace: {
					id: string;
					projectId: string;
					name: string;
					branch: string;
				};
				terminals: Array<{ terminalId: string; label?: string }>;
				warnings: string[];
			}>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"workspaceCreation.adopt",
				"mutation",
				{
					projectId: input.projectId,
					workspaceName,
					branch: input.branch,
					worktreePath,
					baseBranch: input.baseBranch,
				},
			);
		},
	});
}
