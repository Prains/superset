import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import {
	LuCircleCheck,
	LuCircleDashed,
	LuCircleX,
	LuGitBranch,
	LuLaptop,
	LuMonitor,
} from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type {
	AccessibleV2Workspace,
	V2WorkspacePrSummary,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";
import { V2WorkspaceProjectIcon } from "../../../V2WorkspaceProjectIcon";

interface V2WorkspacesBoardCardProps {
	workspace: AccessibleV2Workspace;
}

export function V2WorkspacesBoardCard({
	workspace,
}: V2WorkspacesBoardCardProps) {
	const navigate = useNavigate();
	const { gateFeature } = usePaywall();
	const isArchived = workspace.archivedAt != null;

	const handleOpen = useCallback(() => {
		// Archived tombstones have no worktree or terminals left to open.
		if (isArchived) return;
		const open = () => navigateToV2Workspace(workspace.id, navigate);
		if (workspace.hostType === "local-device") {
			open();
			return;
		}
		gateFeature(GATED_FEATURES.REMOTE_WORKSPACES, open);
	}, [gateFeature, isArchived, navigate, workspace.hostType, workspace.id]);

	const HostIcon = workspace.hostType === "local-device" ? LuLaptop : LuMonitor;
	const timeLabel = getRelativeTime(
		workspace.archivedAt ?? workspace.createdAt.getTime(),
		{ format: "compact" },
	);

	return (
		<button
			type="button"
			onClick={handleOpen}
			disabled={isArchived}
			className={cn(
				"w-full rounded-md border border-border/60 bg-card px-3 py-2.5 text-left transition-colors",
				isArchived
					? "cursor-default opacity-60"
					: "cursor-pointer hover:bg-accent/30",
			)}
		>
			<div className="mb-1 flex items-center justify-between gap-2">
				<span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
					<V2WorkspaceProjectIcon
						projectName={workspace.projectName ?? "Session"}
						iconUrl={workspace.projectIconUrl}
						size="sm"
					/>
					<span className="min-w-0 truncate">
						{workspace.projectName ?? "Session"}
					</span>
				</span>
				<span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
					<HostIcon className="size-3" />
					{workspace.hostName}
				</span>
			</div>

			<p className="mb-1.5 line-clamp-2 text-sm leading-snug">
				{workspace.name || workspace.branch}
			</p>

			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<LuGitBranch className="size-3 shrink-0" />
				<code className="min-w-0 flex-1 truncate font-mono text-[11px]">
					{workspace.branch}
				</code>
			</div>

			<div className="mt-1.5 flex items-center gap-1.5">
				{workspace.pr ? (
					<span className="flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
						<PRIcon state={workspace.pr.state} className="size-3" />#
						{workspace.pr.prNumber}
						<ChecksDot status={workspace.pr.checksStatus} />
					</span>
				) : null}
				{isArchived ? (
					<Badge
						variant="outline"
						className="h-4 px-1.5 py-0 text-[10px] leading-none text-muted-foreground"
					>
						{workspace.archiveReason === "merged" ? "Merged" : "Deleted"}
					</Badge>
				) : null}
				<span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
					{timeLabel}
				</span>
			</div>
		</button>
	);
}

function ChecksDot({
	status,
}: {
	status: V2WorkspacePrSummary["checksStatus"];
}) {
	if (status === "none") return null;
	if (status === "pending") {
		return <LuCircleDashed className="size-3 text-amber-500" />;
	}
	if (status === "success") {
		return <LuCircleCheck className="size-3 text-emerald-500" />;
	}
	return <LuCircleX className="size-3 text-red-500" />;
}
