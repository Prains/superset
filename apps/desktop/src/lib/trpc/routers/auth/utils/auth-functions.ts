import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import { join } from "node:path";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { PROTOCOL_SCHEME } from "shared/constants";
import { decrypt, encrypt } from "./crypto-storage";

interface StoredAuth {
	token: string;
	expiresAt: string;
	organizationIds?: string[];
}

export const TOKEN_FILE = join(SUPERSET_HOME_DIR, "auth-token.enc");
export const stateStore = new Map<string, number>();
let authWriteQueue: Promise<void> = Promise.resolve();

function serializeAuthWrite(operation: () => Promise<void>): Promise<void> {
	const nextWrite = authWriteQueue.then(operation, operation);
	authWriteQueue = nextWrite.catch(() => {});
	return nextWrite;
}

/**
 * Event emitter for auth-related events.
 * Used by tRPC subscription to notify renderer of token changes.
 *
 * Events:
 * - "token-saved": { token, expiresAt } - New token saved (OAuth callback)
 * - "organization-ids-saved": { token, organizationIds } - Membership cached
 * - "token-cleared": (no data) - Token deleted (sign-out)
 */
export const authEvents = new EventEmitter();

/**
 * Load token from encrypted disk storage.
 */
export async function loadToken(): Promise<{
	token: string | null;
	expiresAt: string | null;
	organizationIds: string[] | null;
}> {
	try {
		const data = decrypt(await fs.readFile(TOKEN_FILE));
		const parsed: StoredAuth = JSON.parse(data);
		return {
			token: parsed.token,
			expiresAt: parsed.expiresAt,
			organizationIds: Array.isArray(parsed.organizationIds)
				? parsed.organizationIds.filter(
						(value): value is string =>
							typeof value === "string" && value.length > 0,
					)
				: null,
		};
	} catch {
		return { token: null, expiresAt: null, organizationIds: null };
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
	await serializeAuthWrite(async () => {
		const storedAuth: StoredAuth = { token, expiresAt };
		await fs.writeFile(TOKEN_FILE, encrypt(JSON.stringify(storedAuth)));
		authEvents.emit("token-saved", { token, expiresAt });
	});
}

export async function clearToken(): Promise<void> {
	await serializeAuthWrite(async () => {
		await fs.unlink(TOKEN_FILE).catch(() => {});
		authEvents.emit("token-cleared");
	});
}

/** Cache the last membership confirmed by the authenticated session. */
export async function saveOrganizationIds({
	token,
	organizationIds,
}: {
	token: string;
	organizationIds: string[];
}): Promise<void> {
	await serializeAuthWrite(async () => {
		const storedAuth = await loadToken();
		if (
			storedAuth.token !== token ||
			!storedAuth.token ||
			!storedAuth.expiresAt
		) {
			return;
		}

		const normalizedIds = [...new Set(organizationIds)].sort();
		if (
			storedAuth.organizationIds &&
			storedAuth.organizationIds.length === normalizedIds.length &&
			storedAuth.organizationIds.every(
				(id, index) => id === normalizedIds[index],
			)
		) {
			return;
		}

		await fs.writeFile(
			TOKEN_FILE,
			encrypt(
				JSON.stringify({
					token: storedAuth.token,
					expiresAt: storedAuth.expiresAt,
					organizationIds: normalizedIds,
				} satisfies StoredAuth),
			),
		);
		authEvents.emit("organization-ids-saved", {
			token: storedAuth.token,
			organizationIds: normalizedIds,
		});
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
	if (!stateStore.has(params.state)) {
		return { success: false, error: "Invalid or expired auth session" };
	}
	stateStore.delete(params.state);

	await saveToken({ token: params.token, expiresAt: params.expiresAt });

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
