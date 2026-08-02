import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
	SUPERSET_HOME_DIR,
	SUPERSET_HOME_DIR_MODE,
	SUPERSET_SENSITIVE_FILE_MODE,
} from "main/lib/app-environment";
import { PROTOCOL_SCHEME } from "shared/constants";
import { decrypt, encrypt } from "./crypto-storage";

interface StoredAuth {
	token: string;
	expiresAt: string;
}

const TOKEN_FILE_NAME = "auth-token.enc";
const EMPTY_STORED_AUTH = { token: null, expiresAt: null } as const;

type InspectedTokenStorage =
	| { status: "missing" }
	| { status: "valid"; storedAuth: StoredAuth }
	| { status: "invalid"; reason: string };

let authStorageQueue: Promise<void> = Promise.resolve();

function getTokenFile(): string {
	return join(
		process.env.SUPERSET_HOME_DIR || SUPERSET_HOME_DIR,
		TOKEN_FILE_NAME,
	);
}

function serializeAuthStorage<T>(operation: () => Promise<T>): Promise<T> {
	const result = authStorageQueue.then(operation, operation);
	authStorageQueue = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

function isStoredAuth(value: unknown): value is StoredAuth {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<StoredAuth>;
	return (
		typeof candidate.token === "string" &&
		candidate.token.length > 0 &&
		typeof candidate.expiresAt === "string" &&
		candidate.expiresAt.length > 0 &&
		!Number.isNaN(Date.parse(candidate.expiresAt))
	);
}

function describePathType(stats: Awaited<ReturnType<typeof fs.lstat>>): string {
	if (stats.isDirectory()) return "directory";
	if (stats.isSymbolicLink()) return "symbolic link";
	if (stats.isSocket()) return "socket";
	if (stats.isFIFO()) return "FIFO";
	if (stats.isBlockDevice()) return "block device";
	if (stats.isCharacterDevice()) return "character device";
	return "unknown filesystem entry";
}

async function inspectTokenStorage(
	tokenFile: string,
): Promise<InspectedTokenStorage> {
	let stats: Awaited<ReturnType<typeof fs.lstat>>;
	try {
		stats = await fs.lstat(tokenFile);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { status: "missing" };
		}
		throw error;
	}

	if (!stats.isFile()) {
		return {
			status: "invalid",
			reason: `path is a ${describePathType(stats)}`,
		};
	}

	const encrypted = await fs.readFile(tokenFile);
	try {
		const parsed: unknown = JSON.parse(decrypt(encrypted));
		if (!isStoredAuth(parsed)) {
			return { status: "invalid", reason: "contents failed validation" };
		}
		return { status: "valid", storedAuth: parsed };
	} catch {
		return {
			status: "invalid",
			reason: "contents could not be decrypted or parsed",
		};
	}
}

async function quarantineInvalidTokenStorage(
	tokenFile: string,
	reason: string,
): Promise<string> {
	const quarantinePath = `${tokenFile}.corrupt-${Date.now()}-${randomUUID()}`;
	await fs.rename(tokenFile, quarantinePath);
	console.warn(
		`[auth] Quarantined invalid auth token storage (${reason}) as ${basename(quarantinePath)}`,
	);
	return quarantinePath;
}

async function atomicWriteToken(
	tokenFile: string,
	contents: Buffer,
): Promise<void> {
	const parentDirectory = dirname(tokenFile);
	await fs.mkdir(parentDirectory, {
		recursive: true,
		mode: SUPERSET_HOME_DIR_MODE,
	});

	const temporaryFile = join(
		parentDirectory,
		`.${basename(tokenFile)}.${process.pid}-${randomUUID()}.tmp`,
	);
	let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
	try {
		handle = await fs.open(temporaryFile, "wx", SUPERSET_SENSITIVE_FILE_MODE);
		await handle.writeFile(contents);
		await handle.sync();
		await handle.close();
		handle = null;
		// chmod before the commit rename: the open() mode is masked by umask,
		// and a failure here must leave the previous token intact.
		await fs.chmod(temporaryFile, SUPERSET_SENSITIVE_FILE_MODE);
		await fs.rename(temporaryFile, tokenFile);
	} catch (error) {
		await handle?.close().catch(() => {});
		await fs.unlink(temporaryFile).catch(() => {});
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
	return serializeAuthStorage(async () => {
		const tokenFile = getTokenFile();
		try {
			const inspected = await inspectTokenStorage(tokenFile);
			if (inspected.status === "missing") return EMPTY_STORED_AUTH;
			if (inspected.status === "invalid") {
				await quarantineInvalidTokenStorage(tokenFile, inspected.reason);
				return EMPTY_STORED_AUTH;
			}

			await fs
				.chmod(tokenFile, SUPERSET_SENSITIVE_FILE_MODE)
				.catch((error) =>
					console.warn("[auth] Failed to repair auth token permissions", error),
				);
			return inspected.storedAuth;
		} catch (error) {
			console.error("[auth] Failed to inspect auth token storage", error);
			return EMPTY_STORED_AUTH;
		}
	});
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
	await serializeAuthStorage(async () => {
		const storedAuth: StoredAuth = { token, expiresAt };
		const tokenFile = getTokenFile();
		const inspected = await inspectTokenStorage(tokenFile);
		if (inspected.status === "invalid") {
			await quarantineInvalidTokenStorage(tokenFile, inspected.reason);
		}
		await atomicWriteToken(tokenFile, encrypt(JSON.stringify(storedAuth)));
		authEvents.emit("token-saved", { token, expiresAt });
	});
}

export async function clearToken(): Promise<void> {
	await serializeAuthStorage(async () => {
		const tokenFile = getTokenFile();
		const inspected = await inspectTokenStorage(tokenFile);
		if (inspected.status === "valid") {
			await fs.unlink(tokenFile);
		} else if (inspected.status === "invalid") {
			await quarantineInvalidTokenStorage(tokenFile, inspected.reason);
		}
		authEvents.emit("token-cleared");
	});
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
	// Reserve the state before awaiting so a concurrently delivered duplicate
	// of the same callback is rejected instead of accepted twice.
	const stateIssuedAt = stateStore.get(params.state);
	if (stateIssuedAt === undefined) {
		return { success: false, error: "Invalid or expired auth session" };
	}
	stateStore.delete(params.state);

	try {
		await saveToken({ token: params.token, expiresAt: params.expiresAt });
	} catch (error) {
		stateStore.set(params.state, stateIssuedAt);
		console.error("[auth] Failed to persist desktop auth token", error);
		return {
			success: false,
			error: `Superset could not save your sign-in to ${getTokenFile()}. Your existing data was left untouched. Check the path and try again.`,
		};
	}

	return { success: true };
}

export type ParsedAuthDeepLink =
	| { type: "not-auth" }
	| { type: "malformed" }
	| {
			type: "valid";
			params: { token: string; expiresAt: string; state: string };
	  };

/**
 * Parse and validate auth deep link URL.
 *
 * Classifies by host/path before validating fields so a malformed auth
 * callback (which may still carry a token) is never treated as a plain
 * deep link and logged or navigated with.
 */
export function parseAuthDeepLink(url: string): ParsedAuthDeepLink {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return { type: "not-auth" };
		if (parsed.host !== "auth" || parsed.pathname !== "/callback") {
			return { type: "not-auth" };
		}

		const token = parsed.searchParams.get("token");
		const expiresAt = parsed.searchParams.get("expiresAt");
		const state = parsed.searchParams.get("state");
		if (!token || !expiresAt || !state) return { type: "malformed" };
		return { type: "valid", params: { token, expiresAt, state } };
	} catch {
		return { type: "not-auth" };
	}
}
