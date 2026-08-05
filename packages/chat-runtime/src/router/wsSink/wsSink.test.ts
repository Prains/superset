import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { envelopeSchema } from "@superset/chat/protocol";
import type { FakeHarnessScript } from "../../harness/fake";
import { agentMessage, turn } from "../../testing/fixtures";
import { createTestRuntime } from "../../testing/testRuntime";
import {
	createRecordingSink,
	FAKE_HARNESS,
	fakeHarnessRegistry,
	waitFor,
} from "../../testing/testUtils";
import type { WsSinkSocket } from "./wsSink";
import { createWsSink } from "./wsSink";

const SCRIPT: FakeHarnessScript = {
	turns: [
		[
			{ kind: "turn", turn: turn("t1") },
			{ kind: "item", item: agentMessage("a1", "done"), turnId: "t1" },
			{
				kind: "turn",
				turn: turn("t1", { status: "completed", completedAtMs: 2 }),
			},
			{ kind: "session", session: { status: "idle" } },
		],
	],
};

function createFakeSocket() {
	const frames: string[] = [];
	let closeCalls = 0;
	const socket: WsSinkSocket = {
		send: (data) => {
			frames.push(data);
		},
		close: () => {
			closeCalls += 1;
			socket.onclose?.();
		},
		onclose: null,
	};
	return { socket, frames, closeCalls: () => closeCalls };
}

describe("createWsSink", () => {
	test("serialized envelopes parse back and match a direct subscription", async () => {
		const { harnesses } = fakeHarnessRegistry(SCRIPT);
		const runtime = createTestRuntime({ harnesses });
		const created = runtime.commands.createSession({
			commandId: randomUUID(),
			workspaceId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
		});

		const direct = createRecordingSink();
		const { socket, frames } = createFakeSocket();
		runtime.subscribe(created.sessionId, { deltas: [] }, direct.sink);
		runtime.subscribe(created.sessionId, { deltas: [] }, createWsSink(socket));

		runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId: created.sessionId,
			clientId: "client-1",
			content: [{ type: "text", text: "hello" }],
		});
		await waitFor(
			() => runtime.sessions.get(created.sessionId)?.status === "idle",
		);

		const parsed = frames.map((frame) =>
			envelopeSchema.parse(JSON.parse(frame)),
		);
		expect(parsed.length).toBeGreaterThan(0);
		expect(parsed).toEqual(direct.envelopes);
		await runtime.dispose();
	});

	test("close closes the socket once and a closed socket drops sends", async () => {
		const { harnesses } = fakeHarnessRegistry(SCRIPT);
		const runtime = createTestRuntime({ harnesses });
		const created = runtime.commands.createSession({
			commandId: randomUUID(),
			workspaceId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
		});

		let callerHandlerRuns = 0;
		const { socket, frames, closeCalls } = createFakeSocket();
		socket.onclose = () => {
			callerHandlerRuns += 1;
		};
		const sink = createWsSink(socket);
		runtime.subscribe(created.sessionId, { deltas: [] }, sink);
		const sentBeforeClose = frames.length;

		sink.close();
		sink.close();
		expect(closeCalls()).toBe(1);
		expect(callerHandlerRuns).toBe(1);

		sink.send({
			v: 1,
			sessionId: created.sessionId,
			ts: Date.now(),
			reset: { reason: "invalid_cursor" },
		});
		expect(frames).toHaveLength(sentBeforeClose);
		await runtime.dispose();
	});

	test("a socket closed by the peer stops the sink from sending", async () => {
		const { harnesses } = fakeHarnessRegistry(SCRIPT);
		const runtime = createTestRuntime({ harnesses });
		const created = runtime.commands.createSession({
			commandId: randomUUID(),
			workspaceId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
		});

		const { socket, frames } = createFakeSocket();
		const sink = createWsSink(socket);
		runtime.subscribe(created.sessionId, { deltas: [] }, sink);
		const sentBeforeClose = frames.length;

		socket.onclose?.();
		sink.send({
			v: 1,
			sessionId: created.sessionId,
			ts: Date.now(),
			reset: { reason: "invalid_cursor" },
		});
		expect(frames).toHaveLength(sentBeforeClose);
		await runtime.dispose();
	});
});
