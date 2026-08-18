import {
	WorkspaceClientProvider,
	workspaceTrpc,
} from "@superset/workspace-client";
import { useEffect } from "react";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";

/** Live-monitoring cadence: fast enough that a session closed in its own
 *  workspace turns into a dead tile while you're still looking at the board,
 *  slow enough to stay cheap across every host at once. */
const PROBE_POLL_MS = 12_000;

export interface HostSession {
	terminalId: string;
	workspaceId: string;
	title: string | null;
}

interface HostTerminalsProbeProps {
	hostUrl: string;
	/** Called once the query for this host settles: the session list on
	 *  success, or `null` on error. Never called for "still loading" — a
	 *  caller that never hears from a mounted probe knows it's still
	 *  pending, and distinguishes that from a probe that came back empty
	 *  or one that failed outright. */
	onResult: (hostUrl: string, sessions: HostSession[] | null) => void;
}

/** Renders nothing: it exists to own a client for one host and report that
 *  host's live sessions. Mounted by Board itself (not just the add-card
 *  dialog) so both the picker and reconciliation read the same fan-out.
 *  Settings' V2SessionsSection mounts a provider the same way for the same
 *  reason — workspaceTrpc needs a host URL. */
export function HostTerminalsProbe({
	hostUrl,
	onResult,
}: HostTerminalsProbeProps) {
	return (
		<WorkspaceClientProvider
			cacheKey="free-solo-board"
			key={hostUrl}
			hostUrl={hostUrl}
			headers={() => getHostServiceHeaders(hostUrl)}
			wsToken={() => getHostServiceWsToken(hostUrl)}
		>
			<HostTerminalsProbeInner hostUrl={hostUrl} onResult={onResult} />
		</WorkspaceClientProvider>
	);
}

function HostTerminalsProbeInner({
	hostUrl,
	onResult,
}: HostTerminalsProbeProps) {
	const { data, isError } = workspaceTrpc.terminal.list.useQuery(undefined, {
		refetchOnWindowFocus: true,
		// This client is keyed "free-solo-board" while each card's terminal
		// runs on a client keyed by its workspace id, so a pane's
		// `terminal.list.invalidate()` never reaches this query — polling is
		// the only way it hears about a session opened or closed elsewhere.
		// Without it a closed session only surfaces on a blur/refocus, and a
		// terminal id swapped in by agent auto-resume gets tested against a
		// list from before the swap. The host side is written for consumers
		// that poll (see listLiveTerminalSessions: "the dropdowns' polls
		// re-query").
		refetchInterval: PROBE_POLL_MS,
	});

	useEffect(() => {
		if (data) {
			onResult(
				hostUrl,
				data.sessions.map((session) => ({
					terminalId: session.terminalId,
					workspaceId: session.workspaceId,
					title: session.title,
				})),
			);
		} else if (isError) {
			onResult(hostUrl, null);
		}
	}, [data, isError, hostUrl, onResult]);

	return null;
}
