import { ChatServiceProvider } from "@superset/chat/client";
import { toast } from "@superset/ui/sonner";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { createChatServiceIpcClient } from "renderer/components/Chat/utils/chat-service-client";
import { track } from "renderer/lib/analytics";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { OnboardingNavigation } from "./components/OnboardingNavigation";

export const Route = createFileRoute("/_authenticated/onboarding")({
	component: OnboardingFlowLayout,
	validateSearch: (search: Record<string, unknown>): { rerun?: boolean } => ({
		rerun: search.rerun === true ? true : undefined,
	}),
});

const STEPS = [
	{
		path: "/onboarding",
		match: (p: string) => p === "/onboarding",
		label: "Agents",
		title: "Connect your coding agents",
		subtitle:
			"Add Claude Code or Codex now so your first workspace is ready to run.",
		continueLabel: "Continue to project",
		skipLabel: "Set up later",
	},
	{
		path: "/onboarding/project",
		match: (p: string) => p === "/onboarding/project",
		label: "Project",
		title: "Choose your first project",
		subtitle:
			"Open local code or clone a repository. Superset will create the workspace from there.",
		continueLabel: "Continue",
		skipLabel: "Skip project setup",
	},
] as const;

function OnboardingFlowLayout() {
	const {
		data: session,
		isPending,
		refetch: refetchSession,
	} = authClient.useSession();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const chatClient = useMemo(() => createChatServiceIpcClient(), []);
	const location = useLocation();
	const navigate = useNavigate();
	const [skipping, setSkipping] = useState(false);
	const { rerun } = Route.useSearch();

	if (isPending) return null;
	// Already-onboarded users are redirected out — unless they explicitly
	// relaunched the flow from Settings (?rerun=true).
	if (session?.user?.onboardedAt && !rerun) {
		return <Navigate to="/" replace />;
	}

	const currentStepIdx = STEPS.findIndex((s) => s.match(location.pathname));
	const isOnMainStep = currentStepIdx >= 0;
	const isFirstStep = currentStepIdx === 0;
	const currentStep = isOnMainStep ? STEPS[currentStepIdx] : null;

	const handleBack = () => {
		if (currentStepIdx <= 0) return;
		const target = STEPS[currentStepIdx - 1];
		if (!target) return;
		navigate({ to: target.path });
	};

	// Step 1 advances to the project step; the project step finishes onboarding
	// itself the moment a project is added, so it has no footer Continue.
	const handleContinue = isFirstStep
		? () => navigate({ to: "/onboarding/project" })
		: null;

	// Skip is always available, including on the required gh-cli step — setup is
	// non-blocking. It marks the user onboarded so the _authenticated gate stops
	// redirecting here; unfinished steps can be completed later from Settings.
	const handleSkip = async () => {
		setSkipping(true);
		track("onboarding_finished", { outcome: "skipped" });
		try {
			await apiTrpcClient.user.completeOnboarding.mutate();
			// Reactive refetch so the layout guards' useSession() sees onboardedAt
			// before we navigate — otherwise the _authenticated guard bounces us back.
			await refetchSession({ query: { disableCookieCache: true } });
		} catch (error) {
			console.error("[onboarding] skip failed", error);
			toast.error("Could not skip setup. Please try again.");
			setSkipping(false);
			return;
		}
		await navigate({ to: "/v2-workspaces", replace: true });
	};

	return (
		<ChatServiceProvider client={chatClient} queryClient={electronQueryClient}>
			<div className="flex h-full w-full flex-col bg-background">
				<div
					className="drag h-12 w-full shrink-0"
					style={{ paddingLeft: isMac ? "88px" : "16px" }}
				/>
				<div className="flex-1 overflow-auto">
					{currentStep ? (
						<div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-8 px-8 pt-10 pb-8">
							<div className="space-y-3">
								<p className="text-xs font-medium text-muted-foreground">
									Step {currentStepIdx + 1} of {STEPS.length}
								</p>
								<h1 className="text-[26px] leading-tight font-semibold text-foreground">
									{currentStep.title}
								</h1>
								<p className="max-w-xl text-sm leading-6 text-muted-foreground">
									{currentStep.subtitle}
								</p>
							</div>
							<Outlet />
						</div>
					) : (
						<Outlet />
					)}
				</div>
				{isOnMainStep && (
					<OnboardingNavigation
						currentStep={currentStepIdx}
						totalSteps={STEPS.length}
						onBack={isFirstStep ? null : handleBack}
						onContinue={handleContinue}
						onSkip={handleSkip}
						skipDisabled={skipping}
						continueLabel={currentStep?.continueLabel ?? "Continue"}
						skipLabel={currentStep?.skipLabel ?? "Skip for now"}
						stepLabels={STEPS.map((step) => step.label)}
					/>
				)}
			</div>
		</ChatServiceProvider>
	);
}
