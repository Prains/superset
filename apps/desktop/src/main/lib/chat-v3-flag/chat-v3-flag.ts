import { FEATURE_FLAGS } from "@superset/shared/constants";
import { getPosthogClient, getUserId } from "main/lib/analytics";

/**
 * Whether the spawned host-service should enable its chat-v3 routes.
 *
 * Reads the `chat-v3` PostHog flag for the current user, mirroring
 * `main/lib/relay-url` — evaluated per spawn rather than at app boot, so a
 * flag flip lands on the next host-service (re)start instead of needing a
 * cached value. `SUPERSET_CHAT_V3=1` in this process forces it on and is the
 * dev/manual override for when PostHog is unreachable or the user isn't
 * identified yet.
 */
export async function isChatV3Enabled(): Promise<boolean> {
	if (process.env.SUPERSET_CHAT_V3 === "1") return true;

	const client = getPosthogClient();
	const userId = getUserId();
	if (!client || !userId) return false;

	try {
		return (
			(await client.isFeatureEnabled(FEATURE_FLAGS.CHAT_V3, userId)) === true
		);
	} catch (err) {
		console.warn("[chat-v3] PostHog flag check failed:", err);
		return false;
	}
}
