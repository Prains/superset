import type { RouterOutputs } from "@superset/trpc";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/trpc/client";

export type OrgHost = RouterOutputs["v2Host"]["list"][number];

const HOSTS_REFETCH_INTERVAL_MS = 30_000;
const NO_HOSTS: OrgHost[] = [];

export const ORG_HOSTS_QUERY_KEY = ["cloud", "v2Host", "list"];

/** Hosts in the active organization, polled so online/offline stays current. */
export function useOrgHosts(): OrgHost[] {
	const query = useQuery({
		queryKey: ORG_HOSTS_QUERY_KEY,
		queryFn: () => apiClient.v2Host.list.query(),
		refetchInterval: HOSTS_REFETCH_INTERVAL_MS,
		staleTime: 30_000,
	});

	return query.data ?? NO_HOSTS;
}
