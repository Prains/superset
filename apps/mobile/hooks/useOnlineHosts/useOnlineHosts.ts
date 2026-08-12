import type { SelectV2Host } from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { getHostAuthToken, getRelayUrl } from "@/lib/host/client";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

const PROBE_INTERVAL_MS = 20_000;
const PROBE_TIMEOUT_MS = 4_000;

/**
 * The relay's `_whoowns` endpoint answers 200 when it currently holds the
 * host's tunnel — ground truth for reachability, independent of the
 * `v2_hosts.is_online` presence row (which relays write best-effort and which
 * can wedge false, e.g. when a host migrates relays and the old relay's late
 * offline write lands after the new relay's online write).
 */
async function probeHostTunnel(routingKey: string): Promise<boolean> {
	const token = await getHostAuthToken();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
	try {
		const response = await fetch(
			`${getRelayUrl()}/hosts/${routingKey}/_whoowns?token=${encodeURIComponent(token)}`,
			{ signal: controller.signal, cache: "no-store" },
		);
		return response.status === 200;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * The org's hosts with `isOnline` corrected by a live tunnel probe: a host
 * whose presence row says offline but whose relay tunnel answers is online.
 * Drop-in replacement for reading `collections.v2Hosts` directly — render
 * state should trust the tunnel over the row.
 */
export function useOnlineHosts(): SelectV2Host[] {
	const collections = useCollections();
	const { data: hosts } = useLiveQuery(
		(q) => q.from({ v2Hosts: collections.v2Hosts }),
		[collections],
	);

	// Only probe hosts the row claims are offline — rows saying online are
	// already rendered as online, and a wedged-true row heals on host queries
	// failing (the workspace fetch layer surfaces those errors itself).
	const offlineHosts = useMemo(
		() => (hosts ?? []).filter((host) => !host.isOnline),
		[hosts],
	);

	const probes = useQueries({
		queries: offlineHosts.map((host) => {
			const routingKey = buildHostRoutingKey(
				host.organizationId,
				host.machineId,
			);
			return {
				queryKey: ["host-tunnel-probe", routingKey],
				queryFn: () => probeHostTunnel(routingKey),
				refetchInterval: PROBE_INTERVAL_MS,
				staleTime: PROBE_INTERVAL_MS,
				retry: false,
				networkMode: "always" as const,
			};
		}),
	});

	return useMemo(() => {
		const reachable = new Set<string>();
		offlineHosts.forEach((host, index) => {
			if (probes[index]?.data === true) reachable.add(host.machineId);
		});
		return (hosts ?? []).map((host) =>
			!host.isOnline && reachable.has(host.machineId)
				? { ...host, isOnline: true }
				: host,
		);
	}, [hosts, offlineHosts, probes]);
}
