import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import type { BoardCard as BoardCardModel } from "renderer/stores/free-solo-board";

interface BoardCardTitleProps {
	card: BoardCardModel;
}

/** Two cards from two projects have to be tellable apart at a glance, so the
 *  title carries the project as well as the workspace. */
export function BoardCardTitle({ card }: BoardCardTitleProps) {
	const { workspaces } = useHostWorkspaces();
	const { projects } = useHostProjects();
	const workspace = workspaces.find((item) => item.id === card.workspaceId);
	// Host projects are keyed by `projectKey`, which is what a workspace's
	// `projectId` points at (see useAccessibleV2Workspaces). A workspace with
	// no project is a scratch session.
	const projectName = workspace?.projectId
		? projects.find((project) => project.projectKey === workspace.projectId)
				?.name
		: "Session";

	return (
		<div className="flex min-w-0 items-center gap-1.5 text-xs">
			<span className="shrink-0 text-muted-foreground">{projectName}</span>
			<span className="truncate font-medium">{workspace?.name}</span>
		</div>
	);
}
