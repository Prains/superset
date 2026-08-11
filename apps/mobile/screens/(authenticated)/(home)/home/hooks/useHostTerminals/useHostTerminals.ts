import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";

export interface TerminalsHost {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
}

export type TerminalAttention = "working" | "permission";

export interface TerminalRowData {
	terminalId: string;
	workspaceId: string;
	title: string;
	ts: number;
	/** Agent bound to the terminal via lifecycle hooks; null = plain shell. */
	agentId: string | null;
	attention: TerminalAttention | null;
}

const TERMINALS_REFETCH_INTERVAL_MS = 5_000;

export function getHostTerminalsQueryKey(machineId: string | null) {
	return ["host-terminals", "list", machineId] as const;
}

/**
 * Mirror of desktop's deriveTerminalAgentStatus: only a Start event means
 * the agent is working; anything else (Attached, Stop, ...) is idle.
 */
function attentionFromEvent(lastEventType: string): TerminalAttention | null {
	switch (lastEventType) {
		case "PermissionRequest":
			return "permission";
		case "Start":
			return "working";
		default:
			return null;
	}
}

export interface UseHostTerminalsResult {
	terminalsByWorkspace: Map<string, TerminalRowData[]>;
	/** Per-workspace attention rollup (permission outranks working). */
	attentionByWorkspace: Map<string, TerminalAttention>;
	/**
	 * True once the host answered or failed (or is offline). Gates empty
	 * states only — existing rows always render (cache-first rule).
	 */
	isReady: boolean;
}

/**
 * Live terminals served by one host over the relay — the host-wide
 * `terminal.list` joined with `terminalAgents.list` by terminalId. Terminals
 * are the rows (they're the attachable unit and outlive their agent);
 * bindings supply what terminals can't: agent identity and attention.
 */
export function useHostTerminals(
	host: TerminalsHost | null,
): UseHostTerminalsResult {
	const hostUrl = host?.isOnline
		? buildRelayHostUrl(host.organizationId, host.machineId)
		: null;

	const query = useQuery({
		queryKey: getHostTerminalsQueryKey(host?.machineId ?? null),
		enabled: hostUrl !== null,
		refetchInterval: TERMINALS_REFETCH_INTERVAL_MS,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		retry: 1,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl) return { sessions: [], bindings: [] };
			const client = getHostServiceClientByUrl(hostUrl);
			const [listed, bindings] = await Promise.all([
				client.terminal.list.query({}),
				client.terminalAgents.list.query(),
			]);
			return { sessions: listed.sessions, bindings };
		},
	});

	return useMemo(() => {
		const terminalsByWorkspace = new Map<string, TerminalRowData[]>();
		const attentionByWorkspace = new Map<string, TerminalAttention>();
		const online = host?.isOnline ?? false;
		const bindingsByTerminal = new Map(
			(online ? (query.data?.bindings ?? []) : []).map((binding) => [
				binding.terminalId,
				binding,
			]),
		);

		for (const session of online ? (query.data?.sessions ?? []) : []) {
			if (session.exited) continue;
			const binding = bindingsByTerminal.get(session.terminalId);
			const attention = binding
				? attentionFromEvent(binding.lastEventType)
				: null;
			const row: TerminalRowData = {
				terminalId: session.terminalId,
				workspaceId: session.workspaceId,
				title: session.title ?? (binding ? binding.agentId : "Terminal"),
				ts: binding?.lastEventAt ?? session.createdAt,
				agentId: binding?.agentId ?? null,
				attention,
			};
			const group = terminalsByWorkspace.get(session.workspaceId);
			if (group) group.push(row);
			else terminalsByWorkspace.set(session.workspaceId, [row]);

			// Stale statuses are worse than none: attention only from live data.
			if (attention) {
				const existing = attentionByWorkspace.get(session.workspaceId);
				if (attention === "permission" || !existing) {
					attentionByWorkspace.set(session.workspaceId, attention);
				}
			}
		}
		for (const group of terminalsByWorkspace.values()) {
			group.sort((a, b) => b.ts - a.ts);
		}
		return {
			terminalsByWorkspace,
			attentionByWorkspace,
			isReady: hostUrl === null || query.isSuccess || query.isError,
		};
	}, [query.data, query.isSuccess, query.isError, host?.isOnline, hostUrl]);
}
