import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import type { BoardCard as BoardCardModel } from "renderer/stores/free-solo-board";

interface BoardCardTitleProps {
	card: BoardCardModel;
	/** From the host's own session list, threaded down by Board. This
	 *  component renders outside WorkspaceProvider (it's the card frame's
	 *  title, not its content), so the workspace tab's title source isn't in
	 *  scope — and Board already holds the fan-out that carries it. Undefined
	 *  while the host hasn't answered, or for a session it doesn't name. */
	sessionTitle?: string | null;
}

/** Two cards from two projects have to be tellable apart at a glance, and two
 *  from the *same* workspace only differ by their session — so the title
 *  carries project, workspace, and session title. */
export function BoardCardTitle({ card, sessionTitle }: BoardCardTitleProps) {
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
			{/* Both of these truncate, so flex shrinks whichever is longer
			    hardest rather than starving the session title outright. */}
			<span className="truncate font-medium">{workspace?.name}</span>
			{sessionTitle && (
				<span className="truncate text-muted-foreground">{sessionTitle}</span>
			)}
		</div>
	);
}
