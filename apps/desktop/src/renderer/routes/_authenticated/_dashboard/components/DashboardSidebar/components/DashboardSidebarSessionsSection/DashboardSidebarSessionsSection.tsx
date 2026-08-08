import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPlus } from "react-icons/lu";
import { useOpenNewSessionModal } from "renderer/stores/new-workspace-modal";
import type { DashboardSidebarSessionsScope } from "../../hooks/useDashboardSidebarData/buildDashboardSidebarProjects";
import { DashboardSidebarNestedSection } from "../DashboardSidebarNestedSection";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";

interface DashboardSidebarSessionsSectionProps {
	sessionsScope: DashboardSidebarSessionsScope;
	isCollapsed?: boolean;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
}

function collectScopeWorkspaces(scope: DashboardSidebarSessionsScope): Array<{
	workspace: DashboardSidebarSessionsScope["looseWorkspaces"][number];
	isInSection: boolean;
}> {
	const rows = scope.looseWorkspaces.map((workspace) => ({
		workspace,
		isInSection: false,
	}));
	const walk = (sections: DashboardSidebarSessionsScope["rootSections"]) => {
		for (const section of sections) {
			rows.push(
				...section.workspaces.map((workspace) => ({
					workspace,
					isInSection: true,
				})),
			);
			walk(section.childSections);
		}
	};
	walk(scope.rootSections);
	return rows;
}

/**
 * Top-level "Sessions" section for project-less workspaces, rendered after
 * the project groups: loose sessions first, then the null-scope group tree.
 * Hidden entirely while no sessions exist — the create path lives in the
 * picker's "No project" option, so an empty section has nothing to teach.
 * Collapsed rail renders a plain icon stack, matching the Pinned section.
 */
export function DashboardSidebarSessionsSection({
	sessionsScope,
	isCollapsed = false,
	onWorkspaceHover,
}: DashboardSidebarSessionsSectionProps) {
	const openNewSessionModal = useOpenNewSessionModal();
	const { looseWorkspaces, rootSections } = sessionsScope;

	if (looseWorkspaces.length === 0 && rootSections.length === 0) return null;

	if (isCollapsed) {
		return (
			<div className="flex flex-col gap-0.5 py-1">
				<div className="mx-3 mb-1 border-t border-border" />
				{collectScopeWorkspaces(sessionsScope).map(
					({ workspace, isInSection }) => (
						<DashboardSidebarWorkspaceItem
							key={workspace.id}
							workspace={workspace}
							isCollapsed
							isInSection={isInSection}
							onHoverCardOpen={() => onWorkspaceHover(workspace.id)}
						/>
					),
				)}
			</div>
		);
	}

	return (
		<div className="mt-1 pb-3 first:mt-0">
			{/* Micro-label styled to match the PROJECTS/Pinned headers. */}
			<div className="group/sessions-header flex min-h-8 items-center py-1.5 pl-4 pr-2 text-[10px] font-semibold uppercase tracking-[0.075em] text-muted-foreground">
				<span className="min-w-0 truncate">Sessions</span>
				<div className="ml-auto flex items-center opacity-0 transition-opacity group-hover/sessions-header:opacity-100 focus-within:opacity-100">
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
			{looseWorkspaces.map((workspace) => (
				<DashboardSidebarWorkspaceItem
					key={workspace.id}
					workspace={workspace}
					onHoverCardOpen={() => onWorkspaceHover(workspace.id)}
				/>
			))}
			{rootSections.map((section) => (
				<DashboardSidebarNestedSection
					key={section.id}
					section={section}
					depth={0}
					onWorkspaceHover={onWorkspaceHover}
				/>
			))}
		</div>
	);
}
