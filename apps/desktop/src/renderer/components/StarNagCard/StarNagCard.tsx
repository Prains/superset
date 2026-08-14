import { FEATURE_FLAGS } from "@superset/shared/constants";
import { SidebarCard } from "@superset/ui/sidebar-card";
import { AnimatePresence, motion } from "framer-motion";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect } from "react";
import { useGithubStarAction } from "renderer/hooks/useGithubStarAction";
import { track } from "renderer/lib/analytics";
import { useStarNagStore } from "renderer/stores/star-nag";

interface StarNagCardProps {
	isCollapsed?: boolean;
}

/**
 * Sidebar card offering to star superset-sh/superset once the user has
 * created enough workspaces to have proven they're getting real use out of
 * the app. Modeled directly on HiringBanner — same SidebarCard shell, same
 * feature-flag kill switch, same shown/clicked/dismissed telemetry shape.
 */
export function StarNagCard({ isCollapsed }: StarNagCardProps) {
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.STAR_NAG_CARD);
	const shouldShow = useStarNagStore((s) => s.shouldShowThresholdCard());
	const dismiss = useStarNagStore((s) => s.dismiss);
	const { state, activate, isBusy } = useGithubStarAction();

	const isVisible = !isCollapsed && isEnabled && shouldShow;

	useEffect(() => {
		if (!isVisible) return;
		track("star_nag_shown", { surface: "card" });
	}, [isVisible]);

	function handleAction() {
		track(state === "unknown" ? "star_nag_opened_web" : "star_nag_starred", {
			surface: "card",
		});
		activate();
	}

	function handleDismiss() {
		track("star_nag_dismissed", { surface: "card" });
		dismiss();
	}

	if (isCollapsed || !isEnabled) return null;

	return (
		<AnimatePresence>
			{shouldShow && (
				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 8 }}
					transition={{ duration: 0.2 }}
					className="px-3 pb-2"
				>
					<SidebarCard
						title="Enjoying Superset?"
						description="Superset is open source. If it's helped you today, a GitHub star helps other developers find it."
						actionLabel={
							isBusy
								? "Starring…"
								: state === "unknown"
									? "Open GitHub"
									: "Star on GitHub"
						}
						onAction={handleAction}
						onDismiss={handleDismiss}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
