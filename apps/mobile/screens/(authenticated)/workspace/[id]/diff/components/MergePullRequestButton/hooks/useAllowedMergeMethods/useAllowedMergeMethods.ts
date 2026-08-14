import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { MERGE_METHODS, type MergeMethod } from "../../constants";

const REPO_SETTINGS_STALE_MS = 10 * 60_000;

/**
 * The merge methods the repo actually allows, in MERGE_METHODS order. Repo
 * settings rarely change, and a repo we can't read is not a reason to hide the
 * action — an unreadable repo falls back to offering all three and lets GitHub
 * reject the disallowed one.
 */
export function useAllowedMergeMethods({
	hostUrl,
	owner,
	repo,
}: {
	hostUrl: string | null;
	owner: string | null;
	repo: string | null;
}): MergeMethod[] {
	const query = useQuery({
		queryKey: ["github-repo-settings", hostUrl, owner, repo],
		enabled: hostUrl !== null && owner !== null && repo !== null,
		staleTime: REPO_SETTINGS_STALE_MS,
		retry: 1,
		networkMode: "always" as const,
		queryFn: () => {
			if (!hostUrl || !owner || !repo) throw new Error("Repo is not resolved");
			return getHostServiceClientByUrl(hostUrl).github.getRepo.query({
				owner,
				repo,
			});
		},
	});

	return useMemo(() => {
		const settings = query.data;
		if (!settings) return MERGE_METHODS;
		const allowed = MERGE_METHODS.filter((method) =>
			method === "squash"
				? settings.allow_squash_merge !== false
				: method === "merge"
					? settings.allow_merge_commit !== false
					: settings.allow_rebase_merge !== false,
		);
		return allowed.length > 0 ? allowed : MERGE_METHODS;
	}, [query.data]);
}
