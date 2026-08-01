import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import { join } from "node:path";
import {
	SUPERSET_HOME_DIR,
	SUPERSET_SENSITIVE_FILE_MODE,
} from "main/lib/app-environment";
import { PROTOCOL_SCHEME } from "shared/constants";
import { decrypt, encrypt } from "./crypto-storage";

interface StoredAuth {
	token: string;
	expiresAt: string;
}

const TOKEN_FILE_NAME = "auth-token.enc";

function getTokenFile(): string {
	return join(
		process.env.SUPERSET_HOME_DIR || SUPERSET_HOME_DIR,
		TOKEN_FILE_NAME,
	);
}

async function removeEmptyTokenDirectory(tokenFile: string): Promise<boolean> {
	try {
		const stats = await fs.lstat(tokenFile);
		if (!stats.isDirectory()) return false;

		const entries = await fs.readdir(tokenFile);
		if (entries.length > 0) {
			throw new Error(
				`Auth token storage path is a non-empty directory: ${tokenFile}`,
			);
		}

		await fs.rmdir(tokenFile);
		console.warn("[auth] Repaired empty directory at auth token storage path");
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

export const stateStore = new Map<string, number>();

/**
 * Event emitter for auth-related events.
 * Used by tRPC subscription to notify renderer of token changes.
 *
 * Events:
 * - "token-saved": { token, expiresAt } - New token saved (OAuth callback)
 * - "token-cleared": (no data) - Token deleted (sign-out)
 */
export const authEvents = new EventEmitter();

/**
 * Load token from encrypted disk storage.
 */
export async function loadToken(): Promise<{
	token: string | null;
	expiresAt: string | null;
}> {
	try {
		const data = decrypt(await fs.readFile(getTokenFile()));
		const parsed: StoredAuth = JSON.parse(data);
		return { token: parsed.token, expiresAt: parsed.expiresAt };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EISDIR") {
			console.warn(
				"[auth] Auth token storage path is a directory; the next sign-in will repair it",
			);
		}
		return { token: null, expiresAt: null };
	}
}

/**
 * Persist token to encrypted disk storage and notify subscribers.
 */
export async function saveToken({
	token,
	expiresAt,
}: {
	token: string;
	expiresAt: string;
}): Promise<void> {
	const storedAuth: StoredAuth = { token, expiresAt };
	const tokenFile = getTokenFile();
	await removeEmptyTokenDirectory(tokenFile);
	await fs.writeFile(tokenFile, encrypt(JSON.stringify(storedAuth)), {
		mode: SUPERSET_SENSITIVE_FILE_MODE,
	});
	await fs.chmod(tokenFile, SUPERSET_SENSITIVE_FILE_MODE);
	authEvents.emit("token-saved", { token, expiresAt });
}

export async function clearToken(): Promise<void> {
	const tokenFile = getTokenFile();
	const removedDirectory = await removeEmptyTokenDirectory(tokenFile);
	if (!removedDirectory) {
		try {
			await fs.unlink(tokenFile);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	authEvents.emit("token-cleared");
}

/**
 * Handle OAuth callback from deep link.
 * Validates CSRF state and saves token.
 */
export async function handleAuthCallback(params: {
	token: string;
	expiresAt: string;
	state: string;
}): Promise<{ success: boolean; error?: string }> {
	if (!stateStore.has(params.state)) {
		return { success: false, error: "Invalid or expired auth session" };
	}

	try {
		await saveToken({ token: params.token, expiresAt: params.expiresAt });
		stateStore.delete(params.state);
	} catch (error) {
		console.error("[auth] Failed to persist desktop auth token", error);
		return {
			success: false,
			error: `Superset could not save your sign-in. Check the item at ${getTokenFile()} and try again.`,
		};
	}

	return { success: true };
}

/**
 * Parse and validate auth deep link URL.
 */
export function parseAuthDeepLink(
	url: string,
): { token: string; expiresAt: string; state: string } | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return null;
		if (parsed.host !== "auth" || parsed.pathname !== "/callback") return null;

		const token = parsed.searchParams.get("token");
		const expiresAt = parsed.searchParams.get("expiresAt");
		const state = parsed.searchParams.get("state");
		if (!token || !expiresAt || !state) return null;
		return { token, expiresAt, state };
	} catch {
		return null;
	}
}
