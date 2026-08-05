import { createApiClient } from "./api-client";

const RETRY_BASE_MS = 500;
const MAX_ATTEMPTS = 3;

export interface PresenceStorage {
	get<T>(key: string): Promise<T | undefined>;
	put(key: string, value: unknown): Promise<void>;
}

// Monotonic per-host version, persisted across hibernation, so a late offline
// write from a dying socket can never clobber a newer online write (the
// gray-dot race demonstrated in prod on 2026-08-04). Any attempt superseded
// by a newer one aborts between retries.
export async function writePresence({
	storage,
	apiUrl,
	hostId,
	token,
	isOnline,
}: {
	storage: PresenceStorage;
	apiUrl: string;
	hostId: string;
	token: string;
	isOnline: boolean;
}): Promise<void> {
	const version = ((await storage.get<number>("onlineVersion")) ?? 0) + 1;
	await storage.put("onlineVersion", version);
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		if ((await storage.get<number>("onlineVersion")) !== version) return;
		try {
			await createApiClient(token, apiUrl).host.setOnline.mutate({
				hostId,
				isOnline,
			});
			return;
		} catch (err) {
			if (attempt === MAX_ATTEMPTS - 1) {
				console.error(
					`[relay2] setOnline(${isOnline}) failed for ${hostId}`,
					err,
				);
				return;
			}
			await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** attempt));
		}
	}
}
