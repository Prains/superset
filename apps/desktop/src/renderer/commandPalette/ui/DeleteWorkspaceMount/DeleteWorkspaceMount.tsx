import { useCallback } from "react";
import { DashboardSidebarDeleteDialog } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarDeleteDialog";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";

/**
 * The single mount for the v2 delete dialog, shared by every entry point
 * (sidebar rows, board cards, command palette, close-workspace hotkey,
 * missing-worktree screen). The destroy pipeline archives the row first, so
 * the row — and anything mounted under it — unmounts the instant the destroy
 * starts; this mount lives at the dashboard layout level and survives that,
 * keeping the teardown-failure force-retry pane reachable. Closing the
 * dialog only flips `open` (the target stays latched) so the in-flight
 * destroy can re-open it on failure; `key` gives each workspace a fresh
 * dialog instance so no error/preview state leaks between targets.
 */
export function DeleteWorkspaceMount() {
	const target = useDeleteWorkspaceIntent((s) => s.target);
	const open = useDeleteWorkspaceIntent((s) => s.open);
	const setOpen = useDeleteWorkspaceIntent((s) => s.setOpen);
	const close = useDeleteWorkspaceIntent((s) => s.close);
	const { removeWorkspaceFromSidebar } = useDashboardSidebarState();

	const handleDeleted = useCallback(() => {
		if (target) removeWorkspaceFromSidebar(target.workspaceId);
		close();
	}, [target, removeWorkspaceFromSidebar, close]);

	if (!target) return null;
	return (
		<DashboardSidebarDeleteDialog
			key={target.workspaceId}
			workspaceId={target.workspaceId}
			workspaceName={target.workspaceName}
			open={open}
			onOpenChange={setOpen}
			onDeleted={handleDeleted}
		/>
	);
}
