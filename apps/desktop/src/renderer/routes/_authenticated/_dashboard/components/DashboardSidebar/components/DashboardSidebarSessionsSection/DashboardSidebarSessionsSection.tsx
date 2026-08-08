import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPlus } from "react-icons/lu";
import { useOpenNewSessionModal } from "renderer/stores/new-workspace-modal";
import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";

interface DashboardSidebarSessionsSectionProps {
	sessionWorkspaces: DashboardSidebarWorkspace[];
	isCollapsed?: boolean;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
}

/**
 * Top-level "Sessions" section for project-less workspaces, rendered after
 * the project groups. Hidden entirely while no sessions exist — the create
 * path lives in the picker's "No project" option, so an empty section has
 * nothing to teach. Collapsed rail renders a plain icon stack, matching the
 * Pinned section.
 */
export function DashboardSidebarSessionsSection({
	sessionWorkspaces,
	isCollapsed = false,
	onWorkspaceHover,
}: DashboardSidebarSessionsSectionProps) {
	const openNewSessionModal = useOpenNewSessionModal();

	if (sessionWorkspaces.length === 0) return null;

	if (isCollapsed) {
		return (
			<div className="flex flex-col gap-0.5 py-1">
				<div className="mx-3 mb-1 border-t border-border" />
				{sessionWorkspaces.map((workspace) => (
					<DashboardSidebarWorkspaceItem
						key={workspace.id}
						workspace={workspace}
						isCollapsed
						onHoverCardOpen={() => onWorkspaceHover(workspace.id)}
					/>
				))}
			</div>
		);
	}

	return (
		<div className="mt-1 pb-3 first:mt-0">
			{/* Micro-label styled to match the PROJECTS/Pinned headers. */}
			<div className="group/sessions-header flex min-h-8 items-center py-1.5 pl-4 pr-2 text-[10px] font-semibold uppercase tracking-[0.075em] text-muted-foreground">
				<span className="min-w-0 truncate">Sessions</span>
				<div className="ml-auto flex items-center opacity-0 transition-opacity group-hover/sessions-header:opacity-100">
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label="New session"
								className="flex size-5 items-center justify-center rounded hover:bg-accent hover:text-accent-foreground"
								onClick={openNewSessionModal}
							>
								<LuPlus className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">New session</TooltipContent>
					</Tooltip>
				</div>
			</div>
			{sessionWorkspaces.map((workspace) => (
				<DashboardSidebarWorkspaceItem
					key={workspace.id}
					workspace={workspace}
					onHoverCardOpen={() => onWorkspaceHover(workspace.id)}
				/>
			))}
		</div>
	);
}
