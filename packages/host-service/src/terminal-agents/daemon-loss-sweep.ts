import type { HostDb } from "../db";
import {
	getTerminalAgentBindingSessionId,
	markTerminalAgentBindingEnded,
} from "./persistence";

const DAEMON_LOSS_SWEEP_ATTEMPTS = 5;
const DAEMON_LOSS_SWEEP_DELAY_MS = 2_000;

export interface DaemonLossSweepCandidate {
	terminalId: string;
	db: HostDb;
}

/**
 * A daemon-client disconnect does not always mean the ptys died: an upgrade
 * hands sessions to a successor daemon, and a socket blip leaves the same
 * daemon owning them for re-adoption. Marking bindings ended on those would
 * hide live agents from reads and offer resume for running sessions.
 *
 * So the sweep verifies first: wait for a daemon to answer and mark only the
 * bindings whose session it no longer owns. If no daemon answers after the
 * retries, the old daemon — and the ptys parented to it — is gone, so mark
 * them all. Total wait stays well inside the death-gasp upgrade window.
 */
export async function sweepAgentBindingsAfterDaemonLoss(args: {
	candidates: DaemonLossSweepCandidate[];
	/** Ids of sessions a live daemon still owns; null = no daemon reachable. */
	listAliveSessionIds: () => Promise<Set<string> | null>;
	attempts?: number;
	delayMs?: number;
}): Promise<void> {
	if (args.candidates.length === 0) return;
	const attempts = args.attempts ?? DAEMON_LOSS_SWEEP_ATTEMPTS;
	const delayMs = args.delayMs ?? DAEMON_LOSS_SWEEP_DELAY_MS;

	// Capture which agent session each binding pointed at when the daemon was
	// lost. A terminal respawned mid-sweep can start a NEW session; its fresh
	// binding must not be marked ended by this delayed pass.
	const expectedSessionIds = new Map<string, string | undefined>();
	for (const candidate of args.candidates) {
		try {
			expectedSessionIds.set(
				candidate.terminalId,
				getTerminalAgentBindingSessionId(candidate.db, candidate.terminalId),
			);
		} catch {
			// No baseline — we can't prove a later binding is still the one that
			// died, so this candidate is left untouched rather than risk ending
			// a replacement binding that also has no session id yet.
		}
	}

	let alive: Set<string> | null = null;
	let lastProbeError: unknown;
	for (let attempt = 0; attempt < attempts; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, delayMs));
		try {
			alive = await args.listAliveSessionIds();
		} catch (error) {
			lastProbeError = error;
			alive = null;
		}
		if (alive !== null) break;
	}
	if (alive === null) {
		console.warn(
			`[terminal-agents] no daemon answered after ${attempts} probes; marking ${args.candidates.length} agent binding(s) ended`,
			lastProbeError,
		);
	}

	for (const candidate of args.candidates) {
		if (alive?.has(candidate.terminalId)) continue;
		if (!expectedSessionIds.has(candidate.terminalId)) continue;
		try {
			const current = getTerminalAgentBindingSessionId(
				candidate.db,
				candidate.terminalId,
			);
			if (current !== expectedSessionIds.get(candidate.terminalId)) continue;
			markTerminalAgentBindingEnded(
				candidate.db,
				candidate.terminalId,
				"terminal-exited",
			);
		} catch (error) {
			console.warn(
				`[terminal-agents] failed to mark agent binding ended for ${candidate.terminalId}`,
				error,
			);
		}
	}
}
