import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";

export interface QuickCreateWorkspaceArgs {
	/** Project of the focused workspace — nothing is created without one. */
	projectId: string | null | undefined;
	/** Host serving the focused workspace; defaults to this machine. */
	hostId?: string | null;
}

/**
 * Creates a workspace in the focused project without opening the modal —
 * what the QUICK_CREATE_WORKSPACE hotkey promises. The v2 path mirrors an
 * empty-draft modal submit, so the host generates the name and branch.
 */
export function useQuickCreateWorkspace() {
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { submit } = useWorkspaceCreates();
	const { machineId } = useLocalHostService();
	const createV1Workspace = useCreateWorkspace();

	return useCallback(
		({ projectId, hostId }: QuickCreateWorkspaceArgs) => {
			if (!projectId) return;

			if (!isV2CloudEnabled) {
				// v1 create navigates to the new workspace on success.
				toast.promise(createV1Workspace.mutateAsync({ projectId }), {
					loading: "Creating workspace...",
					success: "Workspace created",
					error: (error: unknown) =>
						error instanceof Error
							? error.message
							: "Failed to create workspace",
				});
				return;
			}

			const targetHostId = hostId ?? machineId;
			if (!targetHostId) {
				toast.error("No active host");
				return;
			}

			const workspaceId = crypto.randomUUID();
			submit({
				hostId: targetHostId,
				snapshot: { id: workspaceId, projectId },
			});
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId },
			}).catch((error) => {
				console.error(
					"[useQuickCreateWorkspace] failed to open workspace",
					error,
				);
			});
		},
		[createV1Workspace, isV2CloudEnabled, machineId, navigate, submit],
	);
}
