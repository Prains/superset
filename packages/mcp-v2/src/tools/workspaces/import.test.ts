import { afterEach, describe, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../../auth";

interface CapturedTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	handler: (input: never, ctx: McpContext) => Promise<unknown>;
}

let tool: CapturedTool | undefined;
let hostCall:
	| { procedure: string; method: string; input: Record<string, unknown> }
	| undefined;

// `define-tool` and `host-service-client` are the seams: the real
// `define-tool` pulls the cloud auth/db env in at import time, and the real
// client would issue a relay fetch. Mocking both leaves the tool's own
// wiring — name, schema, path handling, target procedure — under test.
mock.module("../../define-tool", () => ({
	defineTool: (_server: McpServer, def: CapturedTool) => {
		tool = def;
	},
}));

mock.module("../../host-service-client", () => ({
	hostServiceCall: async (
		_options: unknown,
		procedure: string,
		method: string,
		input: Record<string, unknown>,
	) => {
		hostCall = { procedure, method, input };
		return {
			workspace: {
				id: "ws-1",
				projectId: input.projectId,
				name: input.workspaceName,
				branch: input.branch,
			},
			terminals: [],
			warnings: [],
		};
	},
}));

const { register } = await import("./import");

const ctx: McpContext = {
	userId: "user-1",
	email: "dev@example.com",
	organizationId: "org-1",
	organizationIds: ["org-1"],
	source: "api-key",
	clientLabel: null,
	requestId: "req-1",
	bearerToken: "jwt-1",
	relayUrl: "https://relay.example.com",
};

function registerTool(): CapturedTool {
	tool = undefined;
	register({} as McpServer);
	if (!tool) throw new Error("tool was not registered");
	return tool;
}

function invoke(args: Record<string, unknown> = {}) {
	const registered = registerTool();
	return registered.handler(
		{
			projectId: "11111111-1111-1111-1111-111111111111",
			hostId: "host-1",
			worktreePath: "/repo/.worktrees/from-linear",
			branch: "feature/from-linear",
			...args,
		} as never,
		ctx,
	);
}

afterEach(() => {
	hostCall = undefined;
});

describe("workspaces_import", () => {
	test("is exposed as an MCP tool taking a worktree path", () => {
		const registered = registerTool();

		expect(registered.name).toBe("workspaces_import");
		expect(Object.keys(registered.inputSchema)).toEqual(
			expect.arrayContaining(["projectId", "hostId", "worktreePath", "branch"]),
		);
	});

	test("adopts the existing worktree on the host instead of creating one", async () => {
		await invoke();

		expect(hostCall).toMatchObject({
			procedure: "workspaceCreation.adopt",
			method: "mutation",
			input: {
				projectId: "11111111-1111-1111-1111-111111111111",
				worktreePath: "/repo/.worktrees/from-linear",
				branch: "feature/from-linear",
				workspaceName: "from-linear",
			},
		});
	});

	test("honours an explicit name", async () => {
		await invoke({ name: "Linear ENG-123" });

		expect(hostCall?.input).toMatchObject({
			workspaceName: "Linear ENG-123",
		});
	});

	test("forwards baseBranch so the host records the compare base", async () => {
		await invoke({ baseBranch: "main" });

		expect(hostCall?.input).toMatchObject({ baseBranch: "main" });
	});

	test("rejects a relative worktreePath without calling the host", async () => {
		await expect(
			invoke({ worktreePath: ".worktrees/from-linear" }),
		).rejects.toThrow(/absolute path/i);
		expect(hostCall).toBeUndefined();
	});
});
