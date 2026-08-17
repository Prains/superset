import { Database } from "bun:sqlite";
import { afterAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { plugins } from "../db/schema";
import type { EventBus } from "../events";
import type { ServerMessage } from "../events/types";
import { PluginRuntime, type PluginSkillSource } from "./runtime";
import { PluginStore } from "./store";

const MIGRATIONS_FOLDER = path.resolve(import.meta.dir, "../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	return db as unknown as HostDb;
}

interface BusStub {
	bus: EventBus;
	/** Feed a ServerMessage into the runtime's broadcast tap. */
	emit: (message: ServerMessage) => void;
	published: Array<{ pluginId: string; payload: unknown }>;
}

function createBusStub(): BusStub {
	let listener: ((message: ServerMessage) => void) | null = null;
	const published: BusStub["published"] = [];
	const bus = {
		onBroadcast(l: (message: ServerMessage) => void) {
			listener = l;
			return () => {
				listener = null;
			};
		},
		broadcastPluginEvent(event: { pluginId: string; payload: unknown }) {
			published.push(event);
		},
	} as unknown as EventBus;
	return { bus, emit: (message) => listener?.(message), published };
}

const tempDirs: string[] = [];

function makePluginDir(
	id: string,
	serverSource: string,
	manifestExtra: Record<string, unknown> = {},
): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "superset-plugin-test-"));
	tempDirs.push(dir);
	const serverEntry =
		(manifestExtra.server as string | undefined) ?? "dist/server.js";
	fs.mkdirSync(path.dirname(path.join(dir, serverEntry)), { recursive: true });
	fs.writeFileSync(
		path.join(dir, "superset-plugin.json"),
		JSON.stringify(pluginManifest(id, manifestExtra), null, 2),
	);
	fs.writeFileSync(path.join(dir, serverEntry), serverSource);
	return dir;
}

function pluginManifest(id: string, extra: Record<string, unknown> = {}) {
	return {
		id,
		name: id,
		version: "1.0.0",
		server: "dist/server.js",
		...extra,
	};
}

afterAll(() => {
	for (const dir of tempDirs) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

interface Harness {
	db: HostDb;
	store: PluginStore;
	busStub: BusStub;
	runtime: PluginRuntime;
}

function createHarness(
	options: { onSkillsChanged?: (skills: PluginSkillSource[]) => void } = {},
): Harness {
	const db = createTestDb();
	const store = new PluginStore(db);
	const busStub = createBusStub();
	const runtime = new PluginRuntime({
		store,
		eventBus: busStub.bus,
		listWorkspaces: () => [],
		onSkillsChanged: options.onSkillsChanged,
	});
	return { db, store, busStub, runtime };
}

function seedRow(
	harness: Harness,
	id: string,
	dir: string,
	options: { enabled?: boolean; manifestExtra?: Record<string, unknown> } = {},
) {
	harness.store.upsert({
		id,
		name: id,
		version: "1.0.0",
		description: null,
		sourceType: "link",
		source: dir,
		sourceCommit: null,
		manifestJson: JSON.stringify(pluginManifest(id, options.manifestExtra)),
	});
	if (options.enabled === false) harness.store.setEnabled(id, false);
	const row = harness.store.get(id);
	if (!row) throw new Error(`seed failed for ${id}`);
	return row;
}

// The runtime cache-busts native imports with `?v=${row.updatedAt}`; give each
// reload a guaranteed-distinct value so an edited server.js is re-imported.
let updatedAtBump = 0;
function bumpUpdatedAt(harness: Harness, id: string) {
	updatedAtBump += 1;
	harness.db
		.update(plugins)
		.set({ updatedAt: Date.now() + updatedAtBump })
		.where(eq(plugins.id, id))
		.run();
}

function workspaceCreated(workspaceId: string): ServerMessage {
	return {
		type: "workspace:changed",
		workspaceId,
		eventType: "created",
		workspace: null,
		occurredAt: Date.now(),
	} as ServerMessage;
}

describe("PluginRuntime load + actions", () => {
	it("loads a server entry and invokes a registered action", async () => {
		const harness = createHarness();
		const dir = makePluginDir(
			"test.ping",
			`export default (api) => {
				api.actions.register("ping", (params) => ({ pong: params }));
			};`,
		);
		const row = seedRow(harness, "test.ping", dir);
		await harness.runtime.load(row);

		const result = await harness.runtime.invokeAction(
			"test.ping",
			"ping",
			{ x: 1 },
			{},
		);
		expect(result).toEqual({ pong: { x: 1 } });

		const snapshot = harness.runtime.list().find((p) => p.id === "test.ping");
		expect(snapshot?.status).toBe("running");
		expect(snapshot?.error).toBeNull();
		// Load broadcasts a lifecycle nudge so clients refetch the plugin list.
		expect(
			harness.busStub.published.some(
				(e) =>
					e.pluginId === "test.ping" &&
					(e.payload as { type?: string }).type === "lifecycle",
			),
		).toBe(true);
		await harness.runtime.dispose();
	});

	it("rejects unknown actions on a running plugin", async () => {
		const harness = createHarness();
		const dir = makePluginDir("test.noact", "export default () => {};");
		await harness.runtime.load(seedRow(harness, "test.noact", dir));
		expect(
			harness.runtime.invokeAction("test.noact", "missing", null, {}),
		).rejects.toThrow('no action "missing"');
		await harness.runtime.dispose();
	});
});

describe("PluginRuntime failure containment", () => {
	it("contains a throwing factory without affecting healthy plugins", async () => {
		const harness = createHarness();
		const dirBefore = makePluginDir(
			"test.healthy-before",
			`export default (api) => {
				api.actions.register("ok", () => "before");
			};`,
		);
		const dirBroken = makePluginDir(
			"test.broken",
			`export default () => {
				throw new Error("boom from factory");
			};`,
		);
		const dirAfter = makePluginDir(
			"test.healthy-after",
			`export default (api) => {
				api.actions.register("ok", () => "after");
			};`,
		);
		await harness.runtime.load(
			seedRow(harness, "test.healthy-before", dirBefore),
		);
		await harness.runtime.load(seedRow(harness, "test.broken", dirBroken));
		await harness.runtime.load(
			seedRow(harness, "test.healthy-after", dirAfter),
		);

		const byId = new Map(harness.runtime.list().map((p) => [p.id, p]));
		expect(byId.get("test.broken")?.status).toBe("error");
		expect(byId.get("test.broken")?.error).toContain("boom from factory");
		expect(byId.get("test.healthy-before")?.status).toBe("running");
		expect(byId.get("test.healthy-after")?.status).toBe("running");

		expect(
			harness.runtime.invokeAction("test.broken", "anything", null, {}),
		).rejects.toThrow("Plugin not running: test.broken");
		await expect(
			harness.runtime.invokeAction("test.healthy-before", "ok", null, {}),
		).resolves.toBe("before");
		await harness.runtime.dispose();
	});

	it("records a missing default-export factory as an error", async () => {
		const harness = createHarness();
		const dir = makePluginDir("test.nofactory", "export const nope = 1;");
		await harness.runtime.load(seedRow(harness, "test.nofactory", dir));
		const snapshot = harness.runtime
			.list()
			.find((p) => p.id === "test.nofactory");
		expect(snapshot?.status).toBe("error");
		expect(snapshot?.error).toContain("no default-exported factory");
		await harness.runtime.dispose();
	});

	// ACTION_TIMEOUT_MS is a 10s module const with no injection point, so the
	// never-resolving-action path is not exercised here (a real 10s wait is too
	// slow and bun:test has no timer mocking). Rejection propagation through the
	// same withTimeout wrapper is covered instead.
	it("propagates action rejections (sync and async throws)", async () => {
		const harness = createHarness();
		const dir = makePluginDir(
			"test.thrower",
			`export default (api) => {
				api.actions.register("sync-throw", () => {
					throw new Error("sync kaboom");
				});
				api.actions.register("async-throw", async () => {
					throw new Error("async kaboom");
				});
			};`,
		);
		await harness.runtime.load(seedRow(harness, "test.thrower", dir));
		expect(
			harness.runtime.invokeAction("test.thrower", "sync-throw", null, {}),
		).rejects.toThrow("sync kaboom");
		expect(
			harness.runtime.invokeAction("test.thrower", "async-throw", null, {}),
		).rejects.toThrow("async kaboom");
		// The plugin stays running after action failures.
		expect(
			harness.runtime.list().find((p) => p.id === "test.thrower")?.status,
		).toBe("running");
		await harness.runtime.dispose();
	});
});

describe("PluginRuntime atomic reload", () => {
	// Uses a TS server entry: reload-after-edit is the dev-link flow, which the
	// runtime routes through jiti with moduleCache disabled. The prebuilt-JS
	// path cache-busts native import() with `?v=updatedAt`, which Node honors
	// but bun's module cache ignores, so it can't be exercised under bun test.
	it("picks up edited server code and lands broken reloads in error", async () => {
		const harness = createHarness();
		const serverTs = { server: "src/server.ts" };
		const dir = makePluginDir(
			"test.reload",
			`export default (api) => {
				api.actions.register("greet", () => "v1");
			};`,
			serverTs,
		);
		const row = seedRow(harness, "test.reload", dir, {
			manifestExtra: serverTs,
		});
		await harness.runtime.load(row);
		await expect(
			harness.runtime.invokeAction("test.reload", "greet", null, {}),
		).resolves.toBe("v1");

		fs.writeFileSync(
			path.join(dir, "src/server.ts"),
			`export default (api) => {
				api.actions.register("greet", () => "v2");
			};`,
		);
		bumpUpdatedAt(harness, "test.reload");
		await harness.runtime.reload("test.reload");
		await expect(
			harness.runtime.invokeAction("test.reload", "greet", null, {}),
		).resolves.toBe("v2");

		fs.writeFileSync(
			path.join(dir, "src/server.ts"),
			`export default () => {
				throw new Error("broken v3");
			};`,
		);
		bumpUpdatedAt(harness, "test.reload");
		await harness.runtime.reload("test.reload");
		const snapshot = harness.runtime.list().find((p) => p.id === "test.reload");
		expect(snapshot?.status).toBe("error");
		expect(snapshot?.error).toContain("broken v3");
		// Old registrations are torn down, not left half-running.
		expect(
			harness.runtime.invokeAction("test.reload", "greet", null, {}),
		).rejects.toThrow("Plugin not running: test.reload");
		await harness.runtime.dispose();
	});

	it("does not reload a disabled plugin and rejects unknown ids", async () => {
		const harness = createHarness();
		const dir = makePluginDir(
			"test.disabled",
			`export default (api) => {
				api.actions.register("ok", () => "ok");
			};`,
		);
		seedRow(harness, "test.disabled", dir, { enabled: false });
		await harness.runtime.reload("test.disabled");
		expect(
			harness.runtime.list().find((p) => p.id === "test.disabled")?.status,
		).toBe("disabled");
		expect(harness.runtime.reload("test.missing")).rejects.toThrow(
			"Plugin not installed: test.missing",
		);
		await harness.runtime.dispose();
	});
});

describe("PluginRuntime handleHttp", () => {
	it("routes by method + path, with * matching any method", async () => {
		const harness = createHarness();
		const dir = makePluginDir(
			"test.http",
			`export default (api) => {
				api.http.route("POST", "/hook", (request) => ({
					status: 201,
					body: { got: request.body },
				}));
				api.http.route("*", "/any", () => ({ status: 200, body: "any" }));
			};`,
		);
		await harness.runtime.load(seedRow(harness, "test.http", dir));

		const request = (method: string, reqPath: string) => ({
			method,
			path: reqPath,
			query: {},
			headers: {},
			body: "payload",
		});

		const hit = await harness.runtime.handleHttp(
			"test.http",
			request("POST", "/hook"),
		);
		expect(hit).toEqual({ status: 201, body: { got: "payload" } });
		// Method mismatch and unknown path both fall through to null.
		expect(
			await harness.runtime.handleHttp("test.http", request("GET", "/hook")),
		).toBeNull();
		expect(
			await harness.runtime.handleHttp("test.http", request("POST", "/nope")),
		).toBeNull();
		// "*" routes match any method.
		expect(
			await harness.runtime.handleHttp("test.http", request("DELETE", "/any")),
		).toEqual({ status: 200, body: "any" });
		// Unknown plugin id.
		expect(
			await harness.runtime.handleHttp("test.ghost", request("POST", "/hook")),
		).toBeNull();
		await harness.runtime.dispose();
	});

	it("returns null for plugins in error state", async () => {
		const harness = createHarness();
		const dir = makePluginDir(
			"test.http-broken",
			`export default (api) => {
				api.http.route("POST", "/hook", () => ({ status: 200 }));
				throw new Error("late failure");
			};`,
		);
		await harness.runtime.load(seedRow(harness, "test.http-broken", dir));
		expect(
			await harness.runtime.handleHttp("test.http-broken", {
				method: "POST",
				path: "/hook",
				query: {},
				headers: {},
				body: "",
			}),
		).toBeNull();
		await harness.runtime.dispose();
	});
});

describe("PluginRuntime collectSkills", () => {
	it("namespaces skill dirs per plugin and excludes disabled plugins", () => {
		const harness = createHarness();
		const skillDir = makePluginDir(
			"test.skillful",
			"export default () => {};",
			{
				skills: ["skills/foo"],
			},
		);
		seedRow(harness, "test.skillful", skillDir, {
			manifestExtra: { skills: ["skills/foo"] },
		});
		const offDir = makePluginDir("test.dormant", "export default () => {};", {
			skills: ["skills/bar"],
		});
		seedRow(harness, "test.dormant", offDir, {
			enabled: false,
			manifestExtra: { skills: ["skills/bar"] },
		});

		const skills = harness.runtime.collectSkills();
		expect(skills).toEqual([
			{
				dirName: "plugin-test-skillful-foo",
				skillDir: path.join(skillDir, "skills/foo"),
			},
		]);
		expect(path.isAbsolute(skills[0]?.skillDir ?? "")).toBe(true);
	});

	it("fires onSkillsChanged debounced after lifecycle changes", async () => {
		const calls: PluginSkillSource[][] = [];
		const harness = createHarness({
			onSkillsChanged: (skills) => calls.push(skills),
		});
		const dir = makePluginDir("test.debounce", "export default () => {};", {
			skills: ["skills/foo"],
		});
		const row = seedRow(harness, "test.debounce", dir, {
			manifestExtra: { skills: ["skills/foo"] },
		});
		// Two lifecycle broadcasts inside the debounce window collapse to one call.
		await harness.runtime.load(row);
		await harness.runtime.reload("test.debounce");
		expect(calls.length).toBe(0);
		await Bun.sleep(600);
		expect(calls.length).toBe(1);
		expect(calls[0]).toEqual([
			{
				dirName: "plugin-test-debounce-foo",
				skillDir: path.join(dir, "skills/foo"),
			},
		]);
		await harness.runtime.dispose();
	});
});

describe("PluginRuntime KV storage", () => {
	it("round-trips values through api.storage and rejects oversize writes", async () => {
		const harness = createHarness();
		const dir = makePluginDir(
			"test.kv",
			`export default (api) => {
				api.actions.register("put", async ({ key, value }) => {
					await api.storage.set(key, value);
				});
				api.actions.register("get", ({ key }) => api.storage.get(key));
				api.actions.register("keys", () => api.storage.keys());
				api.actions.register("del", async ({ key }) => {
					await api.storage.delete(key);
				});
			};`,
		);
		await harness.runtime.load(seedRow(harness, "test.kv", dir));

		const invoke = (action: string, params: unknown) =>
			harness.runtime.invokeAction("test.kv", action, params, {});
		await invoke("put", { key: "greeting", value: { hello: "world" } });
		await expect(invoke("get", { key: "greeting" })).resolves.toEqual({
			hello: "world",
		});
		await expect(invoke("keys", null)).resolves.toEqual(["greeting"]);
		await invoke("del", { key: "greeting" });
		await expect(invoke("get", { key: "greeting" })).resolves.toBeNull();

		// 256KB limit: one byte over rejects and leaves nothing stored.
		expect(
			invoke("put", { key: "big", value: "x".repeat(256 * 1024) }),
		).rejects.toThrow("exceeds 262144 bytes");
		await expect(invoke("get", { key: "big" })).resolves.toBeNull();
		await harness.runtime.dispose();
	});
});

describe("PluginRuntime unload", () => {
	it("unsubscribes event handlers and calls dispose on the instance", async () => {
		const harness = createHarness();
		const dir = makePluginDir(
			"test.teardown",
			`export default (api) => {
				api.events.on("workspace.created", async (event) => {
					const seen = ((await api.storage.get("seen")) ?? 0) + 1;
					await api.storage.set("seen", seen);
				});
				return {
					dispose: async () => {
						await api.storage.set("disposed", true);
					},
				};
			};`,
		);
		seedRow(harness, "test.teardown", dir);
		// start() registers the broadcast tap and loads enabled rows.
		await harness.runtime.start();
		expect(
			harness.runtime.list().find((p) => p.id === "test.teardown")?.status,
		).toBe("running");

		harness.busStub.emit(workspaceCreated("ws-1"));
		await Bun.sleep(20);
		expect(harness.store.kvGet("test.teardown", "seen")).toBe(1);

		await harness.runtime.unload("test.teardown");
		expect(harness.store.kvGet("test.teardown", "disposed")).toBe(true);

		// Handlers were torn down: further events are not delivered.
		harness.busStub.emit(workspaceCreated("ws-2"));
		await Bun.sleep(20);
		expect(harness.store.kvGet("test.teardown", "seen")).toBe(1);
		await harness.runtime.dispose();
	});
});
