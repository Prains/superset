import { cn } from "@superset/ui/utils";
import { ExternalLink, Star } from "lucide-react";
import { useEffect } from "react";
import { useGithubStarAction } from "renderer/hooks/useGithubStarAction";
import { track } from "renderer/lib/analytics";

interface GitHubStarPillProps {
	className?: string;
}

/**
 * Small, always-optional "Star Superset on GitHub" pill for the empty
 * "no pane open" screens (v1 EmptyTabView and v2 WorkspaceEmptyState).
 * Hides once starred — there's nothing further to ask for.
 */
export function GitHubStarPill({ className }: GitHubStarPillProps) {
	const { state, activate, isBusy } = useGithubStarAction();

	useEffect(() => {
		if (state === "not_starred" || state === "unknown") {
			track("star_nag_shown", { surface: "empty_state" });
		}
	}, [state]);

	if (state === "loading" || state === "starred") return null;

	const handleClick = () => {
		track(state === "unknown" ? "star_nag_opened_web" : "star_nag_starred", {
			surface: "empty_state",
		});
		activate();
	};

	return (
		<div className={cn("flex items-center justify-center", className)}>
			<button
				type="button"
				onClick={handleClick}
				disabled={isBusy}
				className="inline-flex items-center gap-2 rounded-full border border-amber-500/60 px-4 py-1.5 text-[13px] font-medium text-amber-700 transition-colors hover:bg-amber-400/10 disabled:pointer-events-none disabled:opacity-50 dark:border-amber-400/30 dark:text-amber-300/90 dark:hover:bg-amber-400/[0.08]"
			>
				{state === "unknown" ? (
					<ExternalLink className="size-3.5" />
				) : (
					<Star className="size-3.5" />
				)}
				{state === "unknown" ? "Open GitHub" : "Star on GitHub"}
			</button>
		</div>
	);
}
