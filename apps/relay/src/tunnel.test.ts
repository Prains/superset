import { afterEach, expect, mock, test } from "bun:test";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.FLY_REGION = "test-region";
process.env.FLY_MACHINE_ID = "test-machine";

const OWNER = "test-region:test-machine";
const ORG = "11111111-1111-1111-1111-111111111111";

// In-memory stand-in for the Upstash-backed tunnel directory. Mirrors the
// semantics the real module documents: unregister is a compare-and-delete on
// the owner string, and heartbeat refuses to refresh an entry whose OWNER
// field is already gone.
const directoryEntries = new Map<string, string>();
const registerGates: Array<() => void> = [];
let gateRegister = false;

mock.module("./directory", () => ({
	register: async (hostId: string, region: string, machineId: string) => {
		if (gateRegister) {
			await new Promise<void>((resolve) => registerGates.push(resolve));
		}
		directoryEntries.set(hostId, `${region}:${machineId}`);
	},
	unregister: async (hostId: string, region: string, machineId: string) => {
		if (directoryEntries.get(hostId) === `${region}:${machineId}`) {
			directoryEntries.delete(hostId);
		}
	},
	heartbeat: async (hostId: string) => directoryEntries.has(hostId),
	lookup: async () => null,
	sweepStale: async () => 0,
	clearStaleEntriesForMachine: async () => 0,
}));

const setOnlineCalls: Array<{ hostId: string; isOnline: boolean }> = [];

mock.module("./api-client", () => ({
	createApiClient: () => ({
		host: {
			setOnline: {
				mutate: async (input: { hostId: string; isOnline: boolean }) => {
					setOnlineCalls.push(input);
				},
			},
		},
	}),
}));

const { TunnelManager } = await import("./tunnel");

const WS_OPEN = 1;
const WS_CLOSED = 3;
// scheduleOnlineWrite debounces for 250ms before it hits the API.
const ONLINE_WRITE_FLUSH_MS = 400;

function fakeSocket() {
	return {
		readyState: WS_OPEN as number,
		send() {},
		close() {
			this.readyState = WS_CLOSED;
		},
	};
}

function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
	return new Promise((resolve, reject) => {
		const started = Date.now();
		const tick = () => {
			if (condition()) return resolve();
			if (Date.now() - started > timeoutMs) {
				return reject(new Error("waitFor timed out"));
			}
			setTimeout(tick, 5);
		};
		tick();
	});
}

let hostCounter = 0;
const live: Array<{
	manager: InstanceType<typeof TunnelManager>;
	hostId: string;
}> = [];

// Each test gets its own host id so a leftover presence write from an earlier
// test can never be mistaken for this test's.
function newManager() {
	hostCounter++;
	const hostId = `${ORG}:9dc3ec50f7046b1d263b0d5553${hostCounter}`;
	const manager = new TunnelManager();
	live.push({ manager, hostId });
	return { manager, hostId };
}

function onlineWritesFor(hostId: string) {
	return setOnlineCalls.filter((call) => call.hostId === hostId);
}

afterEach(async () => {
	// Drops the ping interval each live tunnel owns, so bun test can exit, and
	// lets the trailing debounced presence write flush before the next test.
	for (const entry of live) entry.manager.unregister(entry.hostId);
	live.length = 0;
	await new Promise((resolve) => setTimeout(resolve, ONLINE_WRITE_FLUSH_MS));
	directoryEntries.clear();
	registerGates.length = 0;
	gateRegister = false;
	setOnlineCalls.length = 0;
});

test("keeps the directory entry when a racing socket dies mid-register", async () => {
	const { manager, hostId } = newManager();
	gateRegister = true;

	const survivor = fakeSocket();
	const racer = fakeSocket();
	const first = manager.register(hostId, "jwt", survivor as never);
	const second = manager.register(hostId, "jwt", racer as never);

	await waitFor(() => registerGates.length === 2);

	// The first connection's directory write lands and its tunnel goes live.
	registerGates[0]?.();
	await first;
	expect(manager.hasTunnel(hostId)).toBe(true);
	expect(directoryEntries.get(hostId)).toBe(OWNER);

	// The racing connection dies while its own directory write is in flight,
	// so it takes the rollback path.
	racer.readyState = WS_CLOSED;
	registerGates[1]?.();
	await second;

	// The surviving tunnel is still serving traffic on this relay instance, so
	// the host must stay visible in the directory — the presence reconciler
	// reads exactly this to decide v2_hosts.is_online, and automation dispatch
	// skips with "target host offline" when it flips false.
	expect(manager.hasTunnel(hostId)).toBe(true);
	expect(directoryEntries.get(hostId)).toBe(OWNER);
});

test("re-registers a directory entry that vanished under a live tunnel", async () => {
	const { manager, hostId } = newManager();
	const socket = fakeSocket();
	await manager.register(hostId, "jwt", socket as never);
	await waitFor(() => onlineWritesFor(hostId).length === 1);
	expect(onlineWritesFor(hostId)[0]).toEqual({ hostId, isOnline: true });

	// The sweeper reclaimed the entry after a run of transient Upstash
	// failures let the TTL lapse. The tunnel itself never noticed: ping/pong
	// keeps flowing, so the host has no reason to reconnect.
	directoryEntries.delete(hostId);

	manager.handleMessage(hostId, JSON.stringify({ type: "pong" }));

	// The next pong has to put the entry back, or this healthy host stays
	// invisible to the cloud for as long as the tunnel stays up.
	await waitFor(() => directoryEntries.get(hostId) === OWNER);
	// ...and re-assert presence in the DB, which the reconciler has already
	// flipped to offline off the missing entry.
	await waitFor(() => onlineWritesFor(hostId).length === 2);
	expect(onlineWritesFor(hostId)[1]).toEqual({ hostId, isOnline: true });
});
