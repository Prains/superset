import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/** Placeholder starting point, not a researched number — see apps/desktop/plans/20260814-1500-github-star-nag.md. */
export const STAR_NAG_INITIAL_THRESHOLD = 5;
const STAR_NAG_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

interface StarNagState {
	/** Muted — starred from any surface (or detected already-starred). Cleared if the repo is later confirmed unstarred, see useGithubStarAction. */
	completed: boolean;
	/** When `completed` last became true; `null` if never completed (or completed under the pre-timestamp schema — treated as long-ago). */
	completedAt: number | null;
	/** New (never previously seen) workspaces created since the last reset. */
	workspacesCreatedSinceBaseline: number;
	/** Doubles every time the threshold card is dismissed without starring. */
	nextThreshold: number;
	/** Cooldown expiry after a dismissal; `null` means no active cooldown. */
	deferredUntil: number | null;
	recordWorkspaceCreated: () => void;
	/** Not permanently muted and not within an active cooldown. Shared by every trigger source (threshold card, onboarding toast). */
	isEligible: () => boolean;
	shouldShowThresholdCard: () => boolean;
	/** User saw the threshold card and said "later" (or dismissed it) without starring. */
	dismiss: () => void;
	/** A trigger the user never actually engaged with timed out on its own (e.g. the onboarding toast's auto-dismiss) — starts the same cooldown as `dismiss()` but, since there was no real "no thanks", doesn't also double the threshold. */
	snoozeThresholdCard: () => void;
	markCompleted: () => void;
	/** Repo confirmed unstarred after previously being completed — unmutes every surface. */
	markUnstarred: () => void;
}

/**
 * A v1 workspace create/import/open result counts toward the star-nag
 * threshold when it produced a genuinely new workspace (`wasExisting` is
 * false). Centralized so every v1 creation path — create, createFromPr,
 * openMainRepoWorkspace — stays in sync; previously only the plain create
 * path called this, silently excluding PR- and main-repo-branch-driven
 * creates from the threshold.
 */
export function recordV1WorkspaceCreatedIfNew(wasExisting: boolean): void {
	if (!wasExisting) useStarNagStore.getState().recordWorkspaceCreated();
}

function isEligible(state: Pick<StarNagState, "completed" | "deferredUntil">) {
	if (state.completed) return false;
	if (state.deferredUntil && state.deferredUntil > Date.now()) return false;
	return true;
}

export const useStarNagStore = create<StarNagState>()(
	devtools(
		persist(
			(set, get) => ({
				completed: false,
				completedAt: null,
				workspacesCreatedSinceBaseline: 0,
				nextThreshold: STAR_NAG_INITIAL_THRESHOLD,
				deferredUntil: null,
				recordWorkspaceCreated: () =>
					set((s) => ({
						workspacesCreatedSinceBaseline:
							s.workspacesCreatedSinceBaseline + 1,
					})),
				isEligible: () => isEligible(get()),
				shouldShowThresholdCard: () => {
					const s = get();
					return (
						isEligible(s) && s.workspacesCreatedSinceBaseline >= s.nextThreshold
					);
				},
				dismiss: () =>
					set((s) => ({
						nextThreshold: s.nextThreshold * 2,
						workspacesCreatedSinceBaseline: 0,
						deferredUntil: Date.now() + STAR_NAG_COOLDOWN_MS,
					})),
				snoozeThresholdCard: () =>
					set({ deferredUntil: Date.now() + STAR_NAG_COOLDOWN_MS }),
				markCompleted: () =>
					set({
						completed: true,
						completedAt: Date.now(),
						deferredUntil: null,
					}),
				markUnstarred: () => set({ completed: false, completedAt: null }),
			}),
			// Fixed-size singleton, not entity-keyed — no bound/deletion path needed
			// per apps/desktop/AGENTS.md. If the star nag is ever removed (it's
			// flag-killable by design), move "star-nag-v1" into DEAD_KEYS
			// (renderer/lib/persisted-keys/persisted-keys.ts) in the same PR.
			{ name: "star-nag-v1" },
		),
		{ name: "StarNagStore" },
	),
);
