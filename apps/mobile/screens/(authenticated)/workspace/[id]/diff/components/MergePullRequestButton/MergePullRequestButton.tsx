import { GitMerge } from "lucide-react-native";
import { ActionSheetIOS, Alert, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { buildRelayHostUrl } from "@/lib/host-service/client";
import { prStateFor } from "@/screens/(authenticated)/(home)/home/utils/prStateFor";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import type { OrgPullRequest } from "@/screens/(authenticated)/hooks/usePullRequests";
import { MERGE_METHOD_LABEL, type MergeMethod } from "./constants";
import { useAllowedMergeMethods } from "./hooks/useAllowedMergeMethods";
import { useMergePullRequest } from "./hooks/useMergePullRequest";

/**
 * Merges the workspace's pull request from the phone. Like desktop, the action
 * shows for any open non-draft PR and leaves the verdict on failing checks or
 * missing reviews to GitHub — but the state is named in the confirmation, and
 * merging always costs a method choice plus a destructive confirm.
 */
export function MergePullRequestButton({
	workspaceId,
	pullRequest,
}: {
	workspaceId: string | null;
	pullRequest: OrgPullRequest | null;
}) {
	const { host } = useWorkspaceHost(workspaceId);
	const hostUrl =
		host?.isOnline === true
			? buildRelayHostUrl(host.organizationId, host.machineId)
			: null;

	const allowedMethods = useAllowedMergeMethods({
		hostUrl,
		owner: pullRequest?.repository.owner ?? null,
		repo: pullRequest?.repository.name ?? null,
	});
	const { mergePullRequest, isMerging } = useMergePullRequest({
		hostUrl,
		pullRequest,
	});

	if (!pullRequest || prStateFor(pullRequest) !== "open") return null;

	const caution = cautionFor(pullRequest);

	const merge = async (method: MergeMethod) => {
		try {
			await mergePullRequest(method);
			Alert.alert(
				"Merged",
				`#${pullRequest.prNumber} merged into ${pullRequest.baseBranch}.`,
			);
		} catch (cause) {
			// GitHub's own wording is the only text that says whether this was a
			// conflict, branch protection, a missing review or a moved head.
			Alert.alert(
				"Merge failed",
				cause instanceof Error ? cause.message : String(cause),
			);
		}
	};

	const confirmMerge = (method: MergeMethod) => {
		Alert.alert(
			`${MERGE_METHOD_LABEL[method]}?`,
			[
				`#${pullRequest.prNumber} ${pullRequest.title}`,
				"",
				`Merges into ${pullRequest.baseBranch}. This can't be undone.`,
				caution ? `\n${caution}.` : "",
			].join("\n"),
			[
				{ style: "cancel", text: "Cancel" },
				{
					style: "destructive",
					text: "Merge",
					onPress: () => void merge(method),
				},
			],
		);
	};

	const pickMethod = () => {
		if (allowedMethods.length === 1 && allowedMethods[0]) {
			confirmMerge(allowedMethods[0]);
			return;
		}
		ActionSheetIOS.showActionSheetWithOptions(
			{
				title: `#${pullRequest.prNumber} ${pullRequest.title}`,
				options: [
					...allowedMethods.map((method) => MERGE_METHOD_LABEL[method]),
					"Cancel",
				],
				cancelButtonIndex: allowedMethods.length,
			},
			(buttonIndex) => {
				const method = allowedMethods[buttonIndex];
				if (method) confirmMerge(method);
			},
		);
	};

	return (
		<View className="mx-4 mt-6 gap-2">
			<PressableScale
				accessibilityLabel="Merge pull request"
				className={
					hostUrl && !isMerging
						? "bg-primary flex-row items-center justify-center gap-2 rounded-xl py-3"
						: "bg-primary/40 flex-row items-center justify-center gap-2 rounded-xl py-3"
				}
				disabled={!hostUrl || isMerging}
				onPress={pickMethod}
			>
				<Icon
					as={GitMerge}
					className="text-primary-foreground size-[18px]"
					strokeWidth={2}
				/>
				<Text className="text-primary-foreground font-semibold text-[15px]">
					{isMerging ? "Merging…" : "Merge pull request"}
				</Text>
			</PressableScale>
			<Text
				className="text-muted-foreground text-center text-[12px]"
				numberOfLines={1}
			>
				#{pullRequest.prNumber} {pullRequest.title}
			</Text>
			{hostUrl ? (
				caution ? (
					<Text className="text-center text-[12px] text-amber-500">
						{caution}
					</Text>
				) : null
			) : (
				<Text className="text-muted-foreground text-center text-[12px]">
					Host is offline — merging needs its GitHub access.
				</Text>
			)}
		</View>
	);
}

/** What GitHub may well refuse over, named before the confirm rather than after. */
function cautionFor(pullRequest: OrgPullRequest): string | null {
	if (pullRequest.checksStatus === "failure") return "Checks are failing";
	if (pullRequest.checksStatus === "pending") return "Checks are still running";
	if (pullRequest.reviewDecision === "CHANGES_REQUESTED")
		return "Changes requested";
	if (pullRequest.reviewDecision === "REVIEW_REQUIRED")
		return "Review required";
	return null;
}
