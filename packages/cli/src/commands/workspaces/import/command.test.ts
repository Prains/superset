import { afterEach, describe, expect, mock, test } from "bun:test";

let adoptInput: Record<string, unknown> | undefined;
let adoptedBranch = "feature/from-linear";

mock.module("../../../lib/host-target", () => ({
	requireHostTarget: () => "host-1",
	resolveHostTarget: () => ({
		hostId: "host-1",
		client: {
			workspaceCreation: {
				adopt: {
					mutate: async (input: Record<string, unknown>) => {
						adoptInput = input;
						return {
							workspace: {
								id: "ws-1",
								name: input.workspaceName,
								branch: adoptedBranch,
							},
							terminals: [],
							warnings: [],
						};
					},
				},
			},
		},
	}),
}));

const { default: importWorkspaceCommand } = await import("./command");

interface ImportResult {
	data: {
		workspace: { id: string; name: string; branch: string };
		branchMismatch: boolean;
	};
	message: string;
}

function invoke(
	overrides: {
		path?: string;
		branch?: string;
		name?: string;
		baseBranch?: string;
	} = {},
): Promise<ImportResult> {
	return importWorkspaceCommand.run({
		ctx: {
			config: { organizationId: "org-1" },
			bearer: "bearer",
		} as never,
		args: {} as never,
		options: {
			local: true,
			project: "project-1",
			path: "/repo/.worktrees/from-linear",
			branch: "feature/from-linear",
			...overrides,
		} as never,
		signal: new AbortController().signal,
	}) as Promise<ImportResult>;
}

afterEach(() => {
	adoptInput = undefined;
	adoptedBranch = "feature/from-linear";
});

describe("workspaces import", () => {
	test("adopts a pre-existing worktree by path on the target host", async () => {
		const result = await invoke();

		expect(adoptInput).toMatchObject({
			projectId: "project-1",
			worktreePath: "/repo/.worktrees/from-linear",
			branch: "feature/from-linear",
		});
		expect(result.data).toMatchObject({
			workspace: { id: "ws-1", branch: "feature/from-linear" },
		});
	});

	test("defaults the workspace name to the worktree directory name", async () => {
		await invoke();

		expect(adoptInput).toMatchObject({ workspaceName: "from-linear" });
	});

	test("honours an explicit --name", async () => {
		await invoke({ name: "Linear ENG-123" });

		expect(adoptInput).toMatchObject({ workspaceName: "Linear ENG-123" });
	});

	test("forwards --base-branch so the host records the compare base", async () => {
		await invoke({ baseBranch: "main" });

		expect(adoptInput).toMatchObject({ baseBranch: "main" });
	});

	test("rejects a relative --path instead of resolving it against the CLI cwd", async () => {
		await expect(invoke({ path: ".worktrees/from-linear" })).rejects.toThrow(
			/absolute path/i,
		);
		expect(adoptInput).toBeUndefined();
	});

	test("reports a branch mismatch when the worktree has another branch checked out", async () => {
		adoptedBranch = "feature/actually-this-one";

		const result = await invoke({ branch: "feature/from-linear" });

		expect(result.data).toMatchObject({ branchMismatch: true });
		expect(result.message).toContain("feature/actually-this-one");
	});
});
