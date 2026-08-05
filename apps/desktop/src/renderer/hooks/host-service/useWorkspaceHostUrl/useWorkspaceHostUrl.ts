import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export type WorkspaceHostTarget =
	| { status: "loading" }
	| { status: "not-found" }
	| { status: "local-starting"; hostId: string }
	| { status: "ready"; kind: "local" | "remote"; hostId: string; url: string };

/**
 * Resolves a workspace ID to its owning host-service target.
 *
 * The status union lets callers distinguish "still loading the collection"
 * from "local host hasn't booted yet" from "workspace doesn't exist on this
 * client" — three states the previous `string | null` API collapsed into one.
 */
export function useWorkspaceHostTarget(
	workspaceId: string | null,
): WorkspaceHostTarget {
	const { machineId, activeHostUrl } = useLocalHostService();
	const relayUrl = useRelayUrl();

	const { workspaces, isReady } = useHostWorkspaces();
	const match = workspaceId
		? (workspaces.find((w) => w.id === workspaceId) ?? null)
		: null;

	return useMemo(() => {
		if (!workspaceId || (!isReady && !match)) return { status: "loading" };
		if (!match) return { status: "not-found" };
		// FORCE_RELAY_ROUTING sends this machine's own workspaces over the
		// relay so relay changes can be tested without a second machine.
		const forceRelay = env.FORCE_RELAY_ROUTING === "1";
		if (machineId && match.hostId === machineId && !forceRelay) {
			if (activeHostUrl) {
				return {
					status: "ready",
					kind: "local",
					hostId: match.hostId,
					url: activeHostUrl,
				};
			}
			return { status: "local-starting", hostId: match.hostId };
		}
		const routingKey = buildHostRoutingKey(match.organizationId, match.hostId);
		return {
			status: "ready",
			kind: "remote",
			hostId: match.hostId,
			url: `${relayUrl}/hosts/${routingKey}`,
		};
	}, [workspaceId, isReady, match, machineId, activeHostUrl, relayUrl]);
}

/**
 * Backwards-compatible URL-only form for existing callers. Returns null
 * for any non-`ready` status (loading, local-starting, not-found).
 */
export function useWorkspaceHostUrl(workspaceId: string | null): string | null {
	const target = useWorkspaceHostTarget(workspaceId);
	return target.status === "ready" ? target.url : null;
}
