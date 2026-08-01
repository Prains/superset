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
	saveToken,
	stateStore,
} = await import("./auth-functions");

beforeEach(() => {
	fs.rmSync(tokenFile, { recursive: true, force: true });
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
	test("stores credentials only in the test Superset home", async () => {
		await saveToken({ token: "token", expiresAt: "2099-01-01" });

		expect(fs.statSync(tokenFile).isFile()).toBe(true);
		expect(await loadToken()).toEqual({
			token: "token",
			expiresAt: "2099-01-01",
		});
	});

	test("repairs an empty directory at the token path during sign-in", async () => {
		fs.mkdirSync(tokenFile);

		await saveToken({ token: "token", expiresAt: "2099-01-01" });

		expect(fs.statSync(tokenFile).isFile()).toBe(true);
		expect(await loadToken()).toEqual({
			token: "token",
			expiresAt: "2099-01-01",
		});
	});

	test("does not delete a non-empty directory at the token path", async () => {
		fs.mkdirSync(tokenFile);
		const markerFile = path.join(tokenFile, "keep-me");
		fs.writeFileSync(markerFile, "important");

		await expect(
			saveToken({ token: "token", expiresAt: "2099-01-01" }),
		).rejects.toThrow("non-empty directory");
		expect(fs.readFileSync(markerFile, "utf8")).toBe("important");
	});

	test("keeps auth state retryable when token persistence fails", async () => {
		const state = "pending-state";
		stateStore.set(state, Date.now());
		fs.mkdirSync(tokenFile);
		fs.writeFileSync(path.join(tokenFile, "keep-me"), "important");
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
		}

		fs.rmSync(tokenFile, { recursive: true });
		const retriedResult = await handleAuthCallback({
			token: "token",
			expiresAt: "2099-01-01",
			state,
		});

		expect(retriedResult).toEqual({ success: true });
		expect(stateStore.has(state)).toBe(false);
	});

	test("sign-out removes an empty invalid token directory", async () => {
		fs.mkdirSync(tokenFile);
		const tokenCleared = mock(() => {});
		authEvents.once("token-cleared", tokenCleared);

		await clearToken();

		expect(fs.existsSync(tokenFile)).toBe(false);
		expect(tokenCleared).toHaveBeenCalledTimes(1);
	});
});
