import { toast } from "@superset/ui/sonner";
import { X } from "lucide-react";
import { useEffect } from "react";
import { AnimatedStarButton } from "renderer/components/AnimatedStarButton";
import { useGithubStarAction } from "renderer/hooks/useGithubStarAction";
import { track } from "renderer/lib/analytics";
import { useStarNagStore } from "renderer/stores/star-nag";

function StarNagToastContent({ toastId }: { toastId: string | number }) {
	const { state, activate, isBusy } = useGithubStarAction();
	const dismiss = useStarNagStore((s) => s.dismiss);

	useEffect(() => {
		if (state !== "starred") return;
		const timer = setTimeout(() => toast.dismiss(toastId), 2_000);
		return () => clearTimeout(timer);
	}, [state, toastId]);

	function handleAction() {
		track(state === "unknown" ? "star_nag_opened_web" : "star_nag_starred", {
			surface: "toast",
		});
		activate();
	}

	function handleClose() {
		track("star_nag_dismissed", { surface: "toast" });
		dismiss();
		toast.dismiss(toastId);
	}

	return (
		<div className="w-[356px] rounded-lg border border-border bg-popover p-4 shadow-lg select-text">
			<div className="flex items-start justify-between gap-2">
				<p className="text-sm font-semibold text-popover-foreground">
					You're all set!
				</p>
				<button
					type="button"
					onClick={handleClose}
					aria-label="Dismiss"
					className="text-muted-foreground transition-colors hover:text-foreground"
				>
					<X className="size-3.5" />
				</button>
			</div>
			<p className="mt-1 text-xs text-muted-foreground">
				If you're enjoying Superset so far, a GitHub star helps other developers
				discover it.
			</p>
			<AnimatedStarButton
				state={state}
				busy={isBusy}
				onActivate={handleAction}
				className="mt-3 w-full justify-center"
			/>
		</div>
	);
}

/** Fires once, right after onboarding completes — a no-op if the user has
 * already starred or is within an active cooldown from a prior dismissal. */
export function showStarNagOnboardingToast() {
	if (!useStarNagStore.getState().isEligible()) return;
	track("star_nag_shown", { surface: "toast" });
	toast.custom((id) => <StarNagToastContent toastId={id} />, {
		duration: Number.POSITIVE_INFINITY,
	});
}
