import { describe, expect, test } from "bun:test";
import {
	createAttachRetryState,
	DIAGNOSE_AFTER_ATTEMPTS,
	effectiveFailureCount,
	recordAttachRetryableFailure,
	resetAttachRetryState,
	shouldSurfaceDiagnosis,
} from "./attach-retry-diagnosis";

describe("attach-retry diagnosis tracking", () => {
	test("N consecutive attach-retryable failures surface the diagnosis even though partysocket retryCount stays reset", () => {
		const state = createAttachRetryState();
		// Wedged-daemon cycle: each failed attempt had a >5s "stable" WS
		// (upgrade OK, then the host's daemon-open timeout), so partysocket's
		// minUptime logic pins retryCount at 0/1 forever.
		const socketRetryCount = 1;
		for (let i = 0; i < DIAGNOSE_AFTER_ATTEMPTS - 1; i++) {
			recordAttachRetryableFailure(state, "daemon open x: timed out");
			expect(shouldSurfaceDiagnosis(state, socketRetryCount)).toBe(false);
		}
		recordAttachRetryableFailure(state, "daemon open x: timed out");
		expect(shouldSurfaceDiagnosis(state, socketRetryCount)).toBe(true);
		expect(state.lastMessage).toBe("daemon open x: timed out");
	});

	test("a real attach resets the streak and the stored reason", () => {
		const state = createAttachRetryState();
		for (let i = 0; i < DIAGNOSE_AFTER_ATTEMPTS + 3; i++) {
			recordAttachRetryableFailure(state, "stalled");
		}
		expect(shouldSurfaceDiagnosis(state, 0)).toBe(true);
		resetAttachRetryState(state);
		expect(shouldSurfaceDiagnosis(state, 0)).toBe(false);
		expect(state.lastMessage).toBeNull();
	});

	test("dial-level failures still count via partysocket retryCount", () => {
		const state = createAttachRetryState();
		expect(effectiveFailureCount(state, 12)).toBe(12);
		expect(shouldSurfaceDiagnosis(state, DIAGNOSE_AFTER_ATTEMPTS)).toBe(true);
	});
});
