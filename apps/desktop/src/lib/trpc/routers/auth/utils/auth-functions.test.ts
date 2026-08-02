import {
	afterAll,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const testSupersetHomeDir = fs.mkdtempSync(
	path.join(os.tmpdir(), "auth-functions-test-"),
);
process.env.SUPERSET_HOME_DIR = testSupersetHomeDir;
const tokenFile = path.join(testSupersetHomeDir, "auth-token.enc");

mock.module("./crypto-storage", () => ({
	encrypt: (plaintext: string) => Buffer.from(plaintext),
	decrypt: (data: Buffer) => data.toString("utf8"),
}));

const {
	authEvents,
	clearToken,
	handleAuthCallback,
	loadToken,
	parseAuthDeepLink,
	saveToken,
	stateStore,
} = await import("./auth-functions");
const { PROTOCOL_SCHEME } = await import("shared/constants");

function quarantinedTokenPaths(): string[] {
	return fs
		.readdirSync(testSupersetHomeDir)
		.filter((name) => name.startsWith("auth-token.enc.corrupt-"))
		.map((name) => path.join(testSupersetHomeDir, name));
}

beforeEach(() => {
	process.env.SUPERSET_HOME_DIR = testSupersetHomeDir;
	for (const entry of fs.readdirSync(testSupersetHomeDir)) {
		fs.rmSync(path.join(testSupersetHomeDir, entry), {
			recursive: true,
			force: true,
		});
	}
	stateStore.clear();
});

afterAll(() => {
	fs.rmSync(testSupersetHomeDir, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
});

describe("auth token storage", () => {
	test("atomically stores credentials only in the test Superset home", async () => {
		await saveToken({ token: "token", expiresAt: "2099-01-01" });

		expect(fs.statSync(tokenFile).isFile()).toBe(true);
		expect(fs.statSync(tokenFile).mode & 0o777).toBe(0o600);
		expect(
			fs.readdirSync(testSupersetHomeDir).some((name) => name.endsWith(".tmp")),
		).toBe(false);
		expect(await loadToken()).toEqual({
			token: "token",
			expiresAt: "2099-01-01",
		});
	});

	test("quarantines a directory and preserves its contents before saving", async () => {
		fs.mkdirSync(tokenFile);
		fs.writeFileSync(path.join(tokenFile, "keep-me"), "important");
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		try {
			await saveToken({ token: "token", expiresAt: "2099-01-01" });
		} finally {
			warnSpy.mockRestore();
		}

		expect(fs.statSync(tokenFile).isFile()).toBe(true);
		const [quarantinedPath] = quarantinedTokenPaths();
		expect(fs.statSync(quarantinedPath).isDirectory()).toBe(true);
		expect(fs.readFileSync(path.join(quarantinedPath, "keep-me"), "utf8")).toBe(
			"important",
		);
	});

	test("quarantines corrupt token contents during load", async () => {
		fs.writeFileSync(tokenFile, "not valid auth JSON");
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		let loadedToken: Awaited<ReturnType<typeof loadToken>>;
		try {
			loadedToken = await loadToken();
		} finally {
			warnSpy.mockRestore();
		}

		expect(loadedToken).toEqual({ token: null, expiresAt: null });
		expect(fs.existsSync(tokenFile)).toBe(false);
		const [quarantinedPath] = quarantinedTokenPaths();
		expect(fs.readFileSync(quarantinedPath, "utf8")).toBe(
			"not valid auth JSON",
		);
	});

	test("quarantines a symlink without modifying its target", async () => {
		const targetFile = path.join(testSupersetHomeDir, "target-file");
		fs.writeFileSync(targetFile, "do not touch");
		fs.symlinkSync(targetFile, tokenFile);
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		try {
			await saveToken({ token: "token", expiresAt: "2099-01-01" });
		} finally {
			warnSpy.mockRestore();
		}

		expect(fs.readFileSync(targetFile, "utf8")).toBe("do not touch");
		expect(fs.statSync(tokenFile).isFile()).toBe(true);
		const [quarantinedPath] = quarantinedTokenPaths();
		expect(fs.lstatSync(quarantinedPath).isSymbolicLink()).toBe(true);
	});

	test("keeps auth state retryable when durable storage fails", async () => {
		const state = "pending-state";
		stateStore.set(state, Date.now());
		const blockedHome = path.join(testSupersetHomeDir, "blocked-home");
		fs.writeFileSync(blockedHome, "not a directory");
		process.env.SUPERSET_HOME_DIR = blockedHome;
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});

		try {
			const failedResult = await handleAuthCallback({
				token: "token",
				expiresAt: "2099-01-01",
				state,
			});

			expect(failedResult.success).toBe(false);
			expect(stateStore.has(state)).toBe(true);
		} finally {
			errorSpy.mockRestore();
			process.env.SUPERSET_HOME_DIR = testSupersetHomeDir;
		}

		fs.unlinkSync(blockedHome);
		const retriedResult = await handleAuthCallback({
			token: "token",
			expiresAt: "2099-01-01",
			state,
		});

		expect(retriedResult).toEqual({ success: true });
		expect(stateStore.has(state)).toBe(false);
	});

	test("accepts a concurrently duplicated OAuth callback only once", async () => {
		const state = "duplicated-state";
		stateStore.set(state, Date.now());

		const results = await Promise.all([
			handleAuthCallback({ token: "first", expiresAt: "2099-01-01", state }),
			handleAuthCallback({ token: "second", expiresAt: "2099-01-01", state }),
		]);

		expect(results.filter((result) => result.success)).toHaveLength(1);
		expect(stateStore.has(state)).toBe(false);
	});

	test("sign-out quarantines invalid storage before reporting success", async () => {
		fs.writeFileSync(tokenFile, "corrupt credentials");
		const tokenCleared = mock(() => {});
		authEvents.once("token-cleared", tokenCleared);
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		try {
			await clearToken();
		} finally {
			warnSpy.mockRestore();
		}

		expect(fs.existsSync(tokenFile)).toBe(false);
		expect(fs.readFileSync(quarantinedTokenPaths()[0], "utf8")).toBe(
			"corrupt credentials",
		);
		expect(tokenCleared).toHaveBeenCalledTimes(1);
	});
});

describe("parseAuthDeepLink", () => {
	test("flags incomplete auth callbacks as malformed, not non-auth", () => {
		expect(
			parseAuthDeepLink(`${PROTOCOL_SCHEME}://auth/callback?token=secret`),
		).toEqual({ type: "malformed" });
	});

	test("classifies non-auth links and complete callbacks", () => {
		expect(parseAuthDeepLink(`${PROTOCOL_SCHEME}://tasks/my-slug`)).toEqual({
			type: "not-auth",
		});
		expect(
			parseAuthDeepLink(
				`${PROTOCOL_SCHEME}://auth/callback?token=t&expiresAt=2099-01-01&state=s`,
			),
		).toEqual({
			type: "valid",
			params: { token: "t", expiresAt: "2099-01-01", state: "s" },
		});
	});
});
