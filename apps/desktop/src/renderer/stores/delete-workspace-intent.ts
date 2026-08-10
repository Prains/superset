import { create } from "zustand";

export interface DeleteWorkspaceTarget {
	workspaceId: string;
	workspaceName: string;
}

/**
 * Drives the single globally-mounted v2 delete dialog (DeleteWorkspaceMount).
 * The destroy pipeline archives the row FIRST, so any dialog mounted under a
 * workspace row unmounts the moment the destroy starts — every delete entry
 * point requests through this store instead. `open` is tracked separately
 * from `target` so the dialog stays mounted (latched) through an in-flight
 * destroy and can re-open itself on a teardown failure.
 */
interface DeleteWorkspaceIntentState {
	target: DeleteWorkspaceTarget | null;
	open: boolean;
	request: (target: DeleteWorkspaceTarget) => void;
	setOpen: (open: boolean) => void;
	close: () => void;
}

export const useDeleteWorkspaceIntent = create<DeleteWorkspaceIntentState>(
	(set) => ({
		target: null,
		open: false,
		request: (target) => set({ target, open: true }),
		setOpen: (open) => set({ open }),
		close: () => set({ target: null, open: false }),
	}),
);
