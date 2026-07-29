import { posix } from "node:path";
import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { requireHostTarget, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Import an existing git worktree on a host as a workspace",
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
		project: string().required().desc("Project ID"),
		path: string()
			.required()
			.desc("Absolute path of the existing worktree on the target host"),
		branch: string().required().desc("Branch checked out in that worktree"),
		name: string().desc(
			"Workspace name (defaults to the worktree directory name)",
		),
		baseBranch: string().desc("Branch to record as the compare base"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		// The path is interpreted on the target host, which may not be this
		// machine — resolving it against the CLI's cwd would silently point
		// at the wrong directory.
		if (!posix.isAbsolute(options.path)) {
			throw new CLIError(
				`--path must be an absolute path on the target host: ${options.path}`,
				"Pass the full worktree path, e.g. --path /Users/me/code/repo/.worktrees/my-branch",
			);
		}
		const worktreePath = posix.normalize(options.path).replace(/\/+$/, "");

		const branch = options.branch.trim();
		if (!branch) {
			throw new CLIError(
				"--branch is empty",
				"Pass the branch checked out in the worktree",
			);
		}

		const workspaceName = options.name ?? posix.basename(worktreePath);
		if (!workspaceName) {
			throw new CLIError(
				"Could not derive a workspace name from --path",
				"Pass --name <name>",
			);
		}

		const hostId = requireHostTarget({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});

		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const result = await target.client.workspaceCreation.adopt.mutate({
			projectId: options.project,
			workspaceName,
			branch,
			worktreePath,
			baseBranch: options.baseBranch ?? undefined,
		});

		// The host reads the branch actually checked out at the path rather
		// than trusting `--branch`, so surface a disagreement instead of
		// silently registering a different branch than the caller asked for.
		const adoptedBranch = result.workspace.branch;
		const branchMismatch = adoptedBranch !== branch;

		return {
			data: { ...result, branchMismatch },
			message: branchMismatch
				? `Imported worktree ${worktreePath} as workspace "${result.workspace.name}" on host ${target.hostId} — it has "${adoptedBranch}" checked out, not "${branch}"`
				: `Imported worktree ${worktreePath} as workspace "${result.workspace.name}" on host ${target.hostId}`,
		};
	},
});
