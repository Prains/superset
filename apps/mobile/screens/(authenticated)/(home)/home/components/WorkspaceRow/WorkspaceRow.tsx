import type { SelectGithubPullRequest } from "@superset/db/schema";
import { useRouter } from "expo-router";
import {
	GitMerge,
	GitPullRequest,
	GitPullRequestClosed,
	GitPullRequestDraft,
	Plus,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type {
	HostWorkspaceItem,
	HostWorkspacesCacheOps,
} from "@/hooks/useHostWorkspaces";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { AgentMark } from "@/screens/(authenticated)/(home)/new-session/agent";
import type { TerminalRowData } from "../../hooks/useHostTerminals";
import type { DiffStats } from "../../hooks/useVisibleDiffStats";
import { useChatTargetStore } from "../../stores/chatTargetStore";
import { type PrBadgeState, prStateFor } from "../../utils/prStateFor";
import { WorkspaceRowMenu } from "./components/WorkspaceRowMenu";

// PR state replaces the host icon in the icon slot — same treatment as
// desktop's DashboardSidebarWorkspaceIcon.
const PR_ICON_CONFIG: Record<
	PrBadgeState,
	{ icon: typeof GitMerge; iconClassName: string }
> = {
	closed: { icon: GitPullRequestClosed, iconClassName: "text-destructive" },
	draft: { icon: GitPullRequestDraft, iconClassName: "text-muted-foreground" },
	merged: { icon: GitMerge, iconClassName: "text-purple-500" },
	open: { icon: GitPullRequest, iconClassName: "text-emerald-500" },
};

const MAX_SESSION_MARKS = 3;

export function WorkspaceRow({
	workspace,
	pullRequest,
	diffStats,
	cache,
	attention,
	sessions,
}: {
	workspace: HostWorkspaceItem;
	pullRequest?: SelectGithubPullRequest;
	diffStats: DiffStats | null;
	cache: HostWorkspacesCacheOps;
	attention?: "permission" | "working" | null;
	sessions: TerminalRowData[];
}) {
	const router = useRouter();
	const theme = useTheme();
	const prIcon = pullRequest ? PR_ICON_CONFIG[prStateFor(pullRequest)] : null;
	const setTarget = useChatTargetStore((state) => state.setTarget);
	const targeted = useChatTargetStore(
		(state) => state.target?.workspaceId === workspace.id,
	);
	const canChat = workspace.hostReachable && workspace.worktreeExists !== false;

	return (
		<WorkspaceRowMenu workspace={workspace} cache={cache}>
			{/* Highlight-only feedback, like a UITableView cell — a press scale
			    here fights the system context-menu lift, which owns the entire
			    hold animation. */}
			<Pressable
				className={cn(
					"flex-row items-center gap-3 rounded-xl px-4 py-2.5",
					targeted ? "bg-foreground/5" : "bg-background active:bg-foreground/5",
				)}
				onPress={() =>
					router.push(`/(authenticated)/workspace/${workspace.id}`)
				}
			>
				{prIcon && pullRequest ? (
					<Button
						accessibilityLabel={`Pull request #${pullRequest.prNumber}`}
						variant="ghost"
						size="icon"
						className="size-6"
						hitSlop={8}
						onPress={() =>
							router.push(`/(authenticated)/workspace/${workspace.id}/diff`)
						}
					>
						<Icon
							as={prIcon.icon}
							className={`size-5 ${prIcon.iconClassName}`}
							strokeWidth={1.75}
						/>
					</Button>
				) : (
					<View className="size-6 items-center justify-center">
						<View
							className={cn(
								"size-2.5 rounded-full",
								attention === "permission"
									? "bg-red-500"
									: attention === "working"
										? "bg-amber-500"
										: "bg-muted-foreground/40",
							)}
						/>
					</View>
				)}
				<View className="flex-1">
					<Text className="font-semibold text-base" numberOfLines={1}>
						{workspace.name}
					</Text>
					<View className="flex-row items-center gap-2">
						<Text
							className="text-muted-foreground shrink text-xs"
							numberOfLines={1}
						>
							{workspace.branch}
						</Text>
						{diffStats &&
						(diffStats.additions > 0 || diffStats.deletions > 0) ? (
							<>
								<Text className="text-muted-foreground text-xs">·</Text>
								<Text className="text-muted-foreground font-mono text-xs">
									+{diffStats.additions} −{diffStats.deletions}
								</Text>
							</>
						) : null}
					</View>
				</View>
				{sessions.length > 0 ? (
					// Overlapping avatar-style stack — stays ~fixed-width as sessions
					// grow instead of eating the row.
					<View className="flex-row items-center">
						{sessions.slice(0, MAX_SESSION_MARKS).map((session, index) => (
							<View
								key={session.terminalId}
								className={cn(
									"bg-secondary border-background size-6 items-center justify-center rounded-full border-2",
									index > 0 && "-ml-2.5",
								)}
							>
								<AgentMark
									agentId={session.agentId ?? ""}
									size={12}
									color={theme.mutedForeground}
								/>
							</View>
						))}
						{sessions.length > MAX_SESSION_MARKS ? (
							<Text className="text-muted-foreground pl-1 text-[11px]">
								+{sessions.length - MAX_SESSION_MARKS}
							</Text>
						) : null}
					</View>
				) : null}
				<Button
					accessibilityLabel={`New agent in ${workspace.name}`}
					variant="ghost"
					size="icon"
					disabled={!canChat}
					onPress={() =>
						setTarget({
							workspaceId: workspace.id,
							workspaceName: workspace.name,
							branch: workspace.branch,
							hostId: workspace.hostId,
						})
					}
				>
					<Icon as={Plus} className="text-muted-foreground size-5" />
				</Button>
			</Pressable>
		</WorkspaceRowMenu>
	);
}
