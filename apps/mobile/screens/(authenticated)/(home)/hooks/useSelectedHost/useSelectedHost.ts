import type { SelectV2Host } from "@superset/db/schema";
import { useMemo } from "react";
import { useOnlineHosts } from "@/hooks/useOnlineHosts";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";

/**
 * The list view is always scoped to one host: the explicit filter pick if
 * that host still exists, else the first online host, else the first host.
 */
export function useSelectedHost(): SelectV2Host | null {
	const hostFilter = useWorkspacesFilterStore((store) => store.hostFilter);
	const hosts = useOnlineHosts();

	return useMemo(() => {
		const sorted = [...(hosts ?? [])].sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		return (
			sorted.find((host) => host.machineId === hostFilter) ??
			sorted.find((host) => host.isOnline) ??
			sorted[0] ??
			null
		);
	}, [hosts, hostFilter]);
}
