import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import {
	type OrgPullRequest,
	PULL_REQUESTS_QUERY_KEY,
} from "@/screens/(authenticated)/hooks/usePullRequests";
import type { MergeMethod } from "../../constants";

// The PR list is served from the cloud DB, which learns about the merge from
// GitHub's pull_request.closed webhook. Refetch once now (in case it already
// landed) and once after the webhook has had time to arrive, so the screen
// stops offering a merge that has happened.
const WEBHOOK_SETTLE_MS = 4_000;

/**
 * Merges the workspace's PR through the host service (it holds the GitHub
 * credentials), then brings the screen's PR state back in line with GitHub.
 * Rejections are re-thrown with GitHub's wording for the caller to show.
 */
export function useMergePullRequest({
	hostUrl,
	pullRequest,
}: {
	hostUrl: string | null;
	pullRequest: OrgPullRequest | null;
}) {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async (mergeMethod: MergeMethod) => {
			if (!hostUrl || !pullRequest) throw new Error("Host is not reachable");
			return getHostServiceClientByUrl(hostUrl).github.mergePR.mutate({
				owner: pullRequest.repository.owner,
				repo: pullRequest.repository.name,
				pullNumber: pullRequest.prNumber,
				mergeMethod,
			});
		},
		onSettled: () => {
			const invalidate = () =>
				void queryClient.invalidateQueries({
					queryKey: PULL_REQUESTS_QUERY_KEY,
				});
			invalidate();
			setTimeout(invalidate, WEBHOOK_SETTLE_MS);
		},
	});

	return {
		mergePullRequest: mutation.mutateAsync,
		isMerging: mutation.isPending,
	};
}
