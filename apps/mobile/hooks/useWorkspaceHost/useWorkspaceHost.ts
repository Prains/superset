import type { SelectV2Host } from "@superset/db/schema";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	getHostWorkspacesQueryKey,
	type HostWorkspaceRow,
} from "@/hooks/useHostWorkspaces";
import { useOnlineHosts } from "@/hooks/useOnlineHosts";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";

export interface WorkspaceHostResult {
	workspace: HostWorkspaceRow | null;
	host: SelectV2Host | null;
	/** True while no host has answered yet. */
	isResolving: boolean;
}

/**
 * Locate a workspace's row (and owning host) by asking each online host.
 * Query keys match useHostWorkspaces, so navigating from the list resolves
 * straight from cache.
 */
export function useWorkspaceHost(
	workspaceId: string | null,
): WorkspaceHostResult {
	const hosts = useOnlineHosts();

	const targets = useMemo(
		() =>
			hosts
				.filter((host) => host.isOnline)
				.map((host) => ({
					host,
					hostUrl: buildRelayHostUrl(host.organizationId, host.machineId),
				})),
		[hosts],
	);

	const queries = useQueries({
		queries: targets.map(({ host, hostUrl }) => ({
			queryKey: getHostWorkspacesQueryKey(host.machineId, hostUrl),
			enabled: workspaceId !== null,
			staleTime: 30_000,
			retry: 1,
			networkMode: "always" as const,
			queryFn: async (): Promise<HostWorkspaceRow[]> =>
				getHostServiceClientByUrl(hostUrl).workspace.list.query(),
		})),
	});

	return useMemo(() => {
		let workspace: HostWorkspaceRow | null = null;
		let host: SelectV2Host | null = null;
		targets.forEach(({ host: target }, index) => {
			if (workspace) return;
			const match = queries[index]?.data?.find((row) => row.id === workspaceId);
			if (match) {
				workspace = match;
				host = target;
			}
		});
		const isResolving = !workspace && queries.some((query) => query.isLoading);
		return { workspace, host, isResolving };
	}, [targets, queries, workspaceId]);
}
