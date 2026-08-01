import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const testSupersetHomeDir = fs.mkdtempSync(
	path.join(os.tmpdir(), "auth-functions-test-"),
);
process.env.SUPERSET_HOME_DIR = testSupersetHomeDir;

// Keep this unit test independent from suite-global host-info mocks. The
// persistence behavior under test only needs a reversible storage boundary.
mock.module("./crypto-storage", () => ({
	encrypt: (plaintext: string) => Buffer.from(plaintext),
	decrypt: (data: Buffer) => data.toString("utf8"),
}));

const {
	authEvents,
	clearToken,
	loadToken,
	saveOrganizationIds,
	saveToken,
	TOKEN_FILE,
} = await import("./auth-functions");

beforeEach(() => {
	fs.rmSync(TOKEN_FILE, { recursive: true, force: true });
});

afterAll(() => {
	fs.rmSync(testSupersetHomeDir, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
});

describe("cached organization membership", () => {
	test("stores a normalized membership set alongside the encrypted token", async () => {
		await saveToken({ token: "token", expiresAt: "2099-01-01" });
		const membershipSaved = mock(() => {});
		authEvents.once("organization-ids-saved", membershipSaved);

		await saveOrganizationIds({
			token: "token",
			organizationIds: ["org-2", "org-1", "org-2"],
		});

		expect(await loadToken()).toEqual({
			token: "token",
			expiresAt: "2099-01-01",
			organizationIds: ["org-1", "org-2"],
		});
		expect(membershipSaved).toHaveBeenCalledWith({
			token: "token",
			organizationIds: ["org-1", "org-2"],
		});
	});

	test("does not emit when the confirmed membership is unchanged", async () => {
		await saveToken({ token: "token", expiresAt: "2099-01-01" });
		await saveOrganizationIds({
			token: "token",
			organizationIds: ["org-1", "org-2"],
		});
		const membershipSaved = mock(() => {});
		authEvents.once("organization-ids-saved", membershipSaved);

		await saveOrganizationIds({
			token: "token",
			organizationIds: ["org-2", "org-1"],
		});

		expect(membershipSaved).not.toHaveBeenCalled();
		authEvents.off("organization-ids-saved", membershipSaved);
	});

	test("clears cached membership when a different token is saved", async () => {
		await saveToken({ token: "old-token", expiresAt: "2099-01-01" });
		await saveOrganizationIds({
			token: "old-token",
			organizationIds: ["old-org"],
		});

		await saveToken({ token: "new-token", expiresAt: "2099-02-01" });

		expect(await loadToken()).toEqual({
			token: "new-token",
			expiresAt: "2099-02-01",
			organizationIds: null,
		});
	});

	test("ignores membership from a stale account session", async () => {
		await saveToken({ token: "new-token", expiresAt: "2099-02-01" });

		await saveOrganizationIds({
			token: "old-token",
			organizationIds: ["old-org"],
		});

		expect(await loadToken()).toEqual({
			token: "new-token",
			expiresAt: "2099-02-01",
			organizationIds: null,
		});
	});

	test("does not let stale membership recreate auth after sign-out", async () => {
		await saveToken({ token: "old-token", expiresAt: "2099-01-01" });
		await clearToken();

		await saveOrganizationIds({
			token: "old-token",
			organizationIds: ["old-org"],
		});

		expect(await loadToken()).toEqual({
			token: null,
			expiresAt: null,
			organizationIds: null,
		});
	});

	test("does not report sign-out when stored credentials cannot be removed", async () => {
		fs.mkdirSync(TOKEN_FILE);
		const tokenCleared = mock(() => {});
		authEvents.once("token-cleared", tokenCleared);

		await expect(clearToken()).rejects.toThrow();
		expect(tokenCleared).not.toHaveBeenCalled();
		authEvents.off("token-cleared", tokenCleared);
	});
});
