import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiClient } from "../api-client";

const originalFetch = globalThis.fetch;
const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const originalHostBin = process.env.SUPERSET_HOST_BIN;
const tempHome = mkdtempSync(join(tmpdir(), "superset-cli-spawn-"));
const hostBin = join(tempHome, "superset-host");

process.env.SUPERSET_HOME_DIR = tempHome;
process.env.SUPERSET_HOST_BIN = hostBin;
writeFileSync(hostBin, "");

type SpawnOptions = {
	env?: NodeJS.ProcessEnv;
	detached?: boolean;
	stdio?: unknown;
};

const spawnCalls: Array<{
	command: string;
	args: string[];
	options: SpawnOptions;
}> = [];

const spawnMock = mock(
	(command: string, args: string[], options: SpawnOptions) => {
		spawnCalls.push({ command, args, options });
		return {
			pid: 12345,
			kill: mock(() => undefined),
			unref: mock(() => undefined),
		};
	},
);

mock.module("node:child_process", () => ({
	spawn: spawnMock,
}));

const { SUPERSET_CONFIG_PATH } = await import("../config");
const { spawnHostService } = await import("./spawn");

function createApi(): ApiClient {
	return {
		analytics: {
			featureFlagPayload: {
				query: async () => null,
			},
		},
	} as unknown as ApiClient;
}

afterEach(() => {
	spawnCalls.length = 0;
	spawnMock.mockClear();
	globalThis.fetch = originalFetch;
});

afterAll(() => {
	rmSync(tempHome, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	if (originalHostBin === undefined) {
		delete process.env.SUPERSET_HOST_BIN;
	} else {
		process.env.SUPERSET_HOST_BIN = originalHostBin;
	}
});

describe("spawnHostService", () => {
	test("passes SUPERSET_AUTH_CONFIG_PATH when provided", async () => {
		globalThis.fetch = mock(
			async () => new Response("ok", { status: 200 }),
		) as unknown as typeof fetch;

		await spawnHostService({
			organizationId: "00000000-0000-0000-0000-000000000001",
			sessionToken: "session-token",
			authConfigPath: SUPERSET_CONFIG_PATH,
			api: createApi(),
			port: 54879,
			daemon: true,
		});

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnCalls[0]?.options.env?.SUPERSET_AUTH_CONFIG_PATH).toBe(
			SUPERSET_CONFIG_PATH,
		);
		expect(spawnCalls[0]?.options.env?.AUTH_TOKEN).toBe("session-token");
	});

	// Regression for #6054: `superset start` had no way to pin the host service
	// to loopback, so it always bound every interface.
	test("forwards --host to the host service as HOST_SERVICE_HOSTNAME", async () => {
		const fetched: string[] = [];
		globalThis.fetch = mock(async (url: string) => {
			fetched.push(String(url));
			return new Response("ok", { status: 200 });
		}) as unknown as typeof fetch;

		const result = await spawnHostService({
			organizationId: "00000000-0000-0000-0000-000000000001",
			sessionToken: "session-token",
			api: createApi(),
			port: 54880,
			hostname: "127.0.0.1",
			daemon: true,
		});

		expect(spawnCalls[0]?.options.env?.HOST_SERVICE_HOSTNAME).toBe("127.0.0.1");
		expect(result.hostname).toBe("127.0.0.1");
		expect(result.endpoint).toBe("http://127.0.0.1:54880");
		expect(fetched[0]).toBe("http://127.0.0.1:54880/trpc/health.check");
	});

	test("omitting --host keeps the wildcard bind and dials loopback", async () => {
		const fetched: string[] = [];
		globalThis.fetch = mock(async (url: string) => {
			fetched.push(String(url));
			return new Response("ok", { status: 200 });
		}) as unknown as typeof fetch;

		const result = await spawnHostService({
			organizationId: "00000000-0000-0000-0000-000000000001",
			sessionToken: "session-token",
			api: createApi(),
			port: 54881,
			daemon: true,
		});

		expect(spawnCalls[0]?.options.env?.HOST_SERVICE_HOSTNAME).toBeUndefined();
		expect(result.hostname).toBe("0.0.0.0");
		expect(result.endpoint).toBe("http://127.0.0.1:54881");
		expect(fetched[0]).toBe("http://127.0.0.1:54881/trpc/health.check");
	});

	test("dials a pinned non-loopback address instead of 127.0.0.1", async () => {
		const fetched: string[] = [];
		globalThis.fetch = mock(async (url: string) => {
			fetched.push(String(url));
			return new Response("ok", { status: 200 });
		}) as unknown as typeof fetch;

		const result = await spawnHostService({
			organizationId: "00000000-0000-0000-0000-000000000001",
			sessionToken: "session-token",
			api: createApi(),
			port: 54882,
			hostname: "100.64.0.2",
			daemon: true,
		});

		expect(result.endpoint).toBe("http://100.64.0.2:54882");
		expect(fetched[0]).toBe("http://100.64.0.2:54882/trpc/health.check");
	});
});
