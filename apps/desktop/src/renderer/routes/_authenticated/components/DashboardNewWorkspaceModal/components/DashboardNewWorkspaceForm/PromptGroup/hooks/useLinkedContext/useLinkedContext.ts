import { useCallback } from "react";
import { deriveBranchName } from "renderer/routes/_authenticated/utils/deriveBranchName";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import type {
	DashboardNewWorkspaceDraft,
	LinkedIssue,
	LinkedPR,
} from "../../../../../DashboardNewWorkspaceDraftContext";

/**
 * Bundle of handlers that mutate `linkedIssues` / `linkedPR` on the draft.
 * Pure delegation — no state of its own. Co-located with PromptGroup
 * because that's the only consumer.
 *
 * `linkedIssues` is needed to dedupe adds and to filter on remove;
 * setLinkedPR / removeLinkedPR don't need to read the current PR, so the
 * hook doesn't ask for it.
 */
export function useLinkedContext(
	linkedIssues: LinkedIssue[],
	updateDraft: (patch: Partial<DashboardNewWorkspaceDraft>) => void,
) {
	const addLinkedIssue = useCallback(
		(
			slug: string,
			title: string,
			taskId: string | undefined,
			url?: string,
			branch?: string,
		) => {
			if (linkedIssues.some((issue) => issue.slug === slug)) return;
			const patch: Partial<DashboardNewWorkspaceDraft> = {
				linkedIssues: [
					...linkedIssues,
					{ slug, title, source: "internal", taskId, url, branch },
				],
			};
			// Seed the workspace/branch fields from the issue so the branch
			// matches the provider's format (Linear autolinks it back to the
			// issue). Never overwrite something the user already typed.
			const draft = useNewWorkspaceDraftStore.getState();
			if (!draft.branchNameEdited && !draft.branchName.trim()) {
				patch.branchName = deriveBranchName({ slug, title, branch });
				patch.branchNameEdited = true;
			}
			if (!draft.workspaceNameEdited && !draft.workspaceName.trim()) {
				patch.workspaceName = title;
				patch.workspaceNameEdited = true;
			}
			updateDraft(patch);
		},
		[linkedIssues, updateDraft],
	);

	const addLinkedGitHubIssue = useCallback(
		(issueNumber: number, title: string, url: string, state: string) => {
			if (linkedIssues.some((i) => i.url === url)) return;
			updateDraft({
				linkedIssues: [
					...linkedIssues,
					{
						slug: `#${issueNumber}`,
						title,
						source: "github",
						url,
						number: issueNumber,
						state: state.toLowerCase() === "closed" ? "closed" : "open",
					},
				],
			});
		},
		[linkedIssues, updateDraft],
	);

	const removeLinkedIssue = useCallback(
		(slug: string) => {
			const removed = linkedIssues.find((i) => i.slug === slug);
			const patch: Partial<DashboardNewWorkspaceDraft> = {
				linkedIssues: linkedIssues.filter((i) => i.slug !== slug),
			};
			// Clear the seeded names, but only when they still match what the
			// issue seeded — a user edit sticks.
			if (removed?.source === "internal") {
				const draft = useNewWorkspaceDraftStore.getState();
				const seededBranch = deriveBranchName({
					slug: removed.slug,
					title: removed.title,
					branch: removed.branch,
				});
				if (draft.branchName === seededBranch) {
					patch.branchName = "";
					patch.branchNameEdited = false;
				}
				if (draft.workspaceName === removed.title) {
					patch.workspaceName = "";
					patch.workspaceNameEdited = false;
				}
			}
			updateDraft(patch);
		},
		[linkedIssues, updateDraft],
	);

	const setLinkedPR = useCallback(
		(pr: LinkedPR) => updateDraft({ linkedPR: pr }),
		[updateDraft],
	);

	const removeLinkedPR = useCallback(
		() => updateDraft({ linkedPR: null }),
		[updateDraft],
	);

	return {
		addLinkedIssue,
		addLinkedGitHubIssue,
		removeLinkedIssue,
		setLinkedPR,
		removeLinkedPR,
	};
}
