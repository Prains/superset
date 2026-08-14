import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import {
	AnimatedStarButton,
	STAR_SUCCESS_ANIMATION_MS,
} from "renderer/components/AnimatedStarButton";
import type { GithubStarActionState } from "renderer/hooks/useGithubStarAction";
import { useGithubStarAction } from "renderer/hooks/useGithubStarAction";
import { track } from "renderer/lib/analytics";

interface GitHubStarPillProps {
	className?: string;
}

/**
 * Small, always-optional "Star Superset on GitHub" pill for the empty
 * "no pane open" screens (v1 EmptyTabView and v2 WorkspaceEmptyState).
 * Renders from live `state`, not the nag-suppression `isMuted` flag — unlike
 * the sidebar card/toast, this is a low-key status indicator, not an
 * interruptive campaign, so it's allowed to be fully truthful: it hides the
 * instant `state` is "starred" and reappears the instant a later unstar is
 * confirmed, without waiting on the mute grace window. It briefly stays
 * mounted past that point so the confetti/label animation on a fresh star
 * has time to play.
 */
export function GitHubStarPill({ className }: GitHubStarPillProps) {
	const { state, activate, isBusy } = useGithubStarAction();
	const prevStateRef = useRef<GithubStarActionState | null>(null);

	const [staysVisibleForAnimation, setStaysVisibleForAnimation] =
		useState(false);
	useEffect(() => {
		const prev = prevStateRef.current;
		prevStateRef.current = state;
		const justStarred =
			(prev === "not_starred" || prev === "unknown") && state === "starred";
		if (justStarred) {
			setStaysVisibleForAnimation(true);
			const timer = setTimeout(
				() => setStaysVisibleForAnimation(false),
				STAR_SUCCESS_ANIMATION_MS,
			);
			return () => clearTimeout(timer);
		}
	}, [state]);

	// Fire at most once per showing — reset once starred so a later unstar
	// that re-shows the pill tracks a fresh "shown" impression instead of
	// staying silent forever after the first one.
	const trackedShownRef = useRef(false);
	useEffect(() => {
		if (state === "starred") {
			trackedShownRef.current = false;
			return;
		}
		if (trackedShownRef.current) return;
		if (state !== "not_starred" && state !== "unknown") return;
		trackedShownRef.current = true;
		track("star_nag_shown", { surface: "empty_state" });
	}, [state]);

	if (state === "loading") return null;
	if (state === "starred" && !staysVisibleForAnimation) return null;

	const handleClick = () => {
		track(state === "unknown" ? "star_nag_opened_web" : "star_nag_starred", {
			surface: "empty_state",
		});
		activate();
	};

	return (
		<div className={cn("flex items-center justify-center", className)}>
			<AnimatedStarButton
				state={state}
				busy={isBusy}
				onActivate={handleClick}
			/>
		</div>
	);
}
