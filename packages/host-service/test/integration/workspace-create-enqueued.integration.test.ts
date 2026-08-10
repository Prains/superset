import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import type { ServerMessage } from "../../src/events";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createProjectScenario } from "../helpers/scenarios";

type SettledMessage = Extract<
	ServerMessage,
	{ type: "workspace:create-settled" }
>;

/** Capture workspace:create-settled broadcasts without a WebSocket client. */
function captureSettled(eventBus: {
	broadcastWorkspaceCreateSettled: (
		message: Omit<SettledMessage, "type">,
	) => void;
}): Array<Omit<SettledMessage, "type">> {
	const captured: Array<Omit<SettledMessage, "type">> = [];
	const original = eventBus.broadcastWorkspaceCreateSettled.bind(eventBus);
	eventBus.broadcastWorkspaceCreateSettled = (message) => {
		captured.push(message);
		original(message);
	};
	return captured;
}

async function waitFor(
	predicate: () => boolean,
	timeoutMs = 30_000,
): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) {
			throw new Error("Timed out waiting for condition");
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

describe("workspaces.createEnqueued integration", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("returns immediately, then broadcasts a settled event with the create result", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;
		const settled = captureSettled(scenario.host.eventBus);

		const id = randomUUID();
		const enqueue = await scenario.host.trpc.workspaces.createEnqueued.mutate({
			projectId: scenario.projectId,
			name: "enqueued ws",
			branch: "feature/enqueued",
			id,
		});
		expect(enqueue.workspaceId).toBe(id);
		// The enqueue response must not wait for the create: no settled
		// broadcast may have happened synchronously with the mutation.
		await waitFor(() => settled.length > 0);

		const event = settled[0];
		expect(event?.workspaceId).toBe(id);
		expect(event?.ok).toBe(true);
		expect(event?.canonicalWorkspaceId).toBeTruthy();
		expect(event?.projectId).toBe(scenario.projectId);
		expect(event?.alreadyExists).toBe(false);

		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, event?.canonicalWorkspaceId ?? ""))
			.get();
		expect(persisted?.branch).toBe("feature/enqueued");
		expect(existsSync(persisted?.worktreePath ?? "")).toBe(true);
	});

	test("rejects without a client-minted id", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		await expect(
			scenario.host.trpc.workspaces.createEnqueued.mutate({
				projectId: scenario.projectId,
				branch: "feature/no-id",
			}),
		).rejects.toThrow(/requires a client-minted/);
	});

	test("a create that fails after enqueue broadcasts ok:false with the error", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;
		const settled = captureSettled(scenario.host.eventBus);

		const id = randomUUID();
		// ".." is invalid in a git ref, so the worktree add fails mid-create.
		const enqueue = await scenario.host.trpc.workspaces.createEnqueued.mutate({
			projectId: scenario.projectId,
			branch: "feature/bad..ref",
			id,
		});
		expect(enqueue.workspaceId).toBe(id);

		await waitFor(() => settled.length > 0);
		const event = settled[0];
		expect(event?.workspaceId).toBe(id);
		expect(event?.ok).toBe(false);
		expect(event?.error).toBeTruthy();
		expect(event?.canonicalWorkspaceId).toBeNull();
	});
});
