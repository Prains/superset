/**
 * Consecutive connection-failure tracking for the terminal transport.
 *
 * partysocket's `retryCount` resets to 0 after 5s of socket uptime
 * (minUptime). A wedged pty-daemon fails in ~15s cycles — the WS upgrade
 * SUCCEEDS, the host blocks in its 15s daemon-open timeout, then closes with
 * an attach-retryable error — so every cycle counts as a "stable" connection
 * and retryCount never accumulates. Gating the failure diagnosis on
 * retryCount alone means it never surfaces for exactly the outage this
 * counter exists to explain. Track attach-retryable failures ourselves and
 * reset only on a real `attached`.
 */
export interface AttachRetryState {
	consecutiveFailures: number;
	/** Server-reported reason from the latest retryable attach failure. */
	lastMessage: string | null;
}

/**
 * How many consecutive failed attempts (failed dials via partysocket's
 * retryCount, or attach-retryable rejections via this tracker) before the
 * header shows *why* the terminal is down. The socket keeps retrying forever
 * regardless; this only gates the user-facing diagnosis.
 */
export const DIAGNOSE_AFTER_ATTEMPTS = 10;

export function createAttachRetryState(): AttachRetryState {
	return { consecutiveFailures: 0, lastMessage: null };
}

export function recordAttachRetryableFailure(
	state: AttachRetryState,
	message: string,
): void {
	state.consecutiveFailures += 1;
	state.lastMessage = message;
}

export function resetAttachRetryState(state: AttachRetryState): void {
	state.consecutiveFailures = 0;
	state.lastMessage = null;
}

/** Whichever counter actually saw the outage drives the threshold. */
export function effectiveFailureCount(
	state: AttachRetryState,
	socketRetryCount: number,
): number {
	return Math.max(state.consecutiveFailures, socketRetryCount);
}

export function shouldSurfaceDiagnosis(
	state: AttachRetryState,
	socketRetryCount: number,
): boolean {
	return (
		effectiveFailureCount(state, socketRetryCount) >= DIAGNOSE_AFTER_ATTEMPTS
	);
}
