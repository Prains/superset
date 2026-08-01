import { chatServiceTrpc } from "@superset/chat/client";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { FaAws } from "react-icons/fa";
import { HiArrowUpRight } from "react-icons/hi2";
import { LuCheck, LuRefreshCw } from "react-icons/lu";
import { SiGithub, SiOpenai } from "react-icons/si";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { GhAuthDialog } from "./components/GhAuthDialog";
import {
	type Provider,
	ProviderConnectModal,
} from "./components/ProviderConnectModal";
import { ClaudeLogo } from "./providers/components/ClaudeLogo";

export const Route = createFileRoute("/_authenticated/onboarding/")({
	component: OnboardingDashboardPage,
});

const PREREQ_POLL_MS = 4000;

function OnboardingDashboardPage() {
	const [connectProvider, setConnectProvider] = useState<Provider | null>(null);
	const [ghAuthOpen, setGhAuthOpen] = useState(false);

	// Poll while mounted so external changes (installing gh in a browser,
	// signing in from a terminal) are picked up without a focus change.
	const statusPolling = { refetchInterval: PREREQ_POLL_MS } as const;

	const {
		data: ghStatus,
		refetch: refetchGh,
		isPending: isPendingGh,
		isFetching: isFetchingGh,
	} = electronTrpc.system.detectGhCli.useQuery(undefined, statusPolling);
	const {
		data: anthropicStatus,
		refetch: refetchAnthropic,
		isPending: isPendingAnthropic,
		isFetching: isFetchingAnthropic,
	} = chatServiceTrpc.auth.getAnthropicStatus.useQuery(
		undefined,
		statusPolling,
	);
	const {
		data: openAIStatus,
		refetch: refetchOpenAI,
		isPending: isPendingOpenAI,
		isFetching: isFetchingOpenAI,
	} = chatServiceTrpc.auth.getOpenAIStatus.useQuery(undefined, statusPolling);

	const ghInstalled = ghStatus?.installed === true;
	const ghReady = ghInstalled && ghStatus?.authenticated === true;
	const claudeConnected =
		!!anthropicStatus?.authenticated && !anthropicStatus.issue;
	const codexConnected = !!openAIStatus?.authenticated && !openAIStatus.issue;

	const ghStatusLabel = ghReady
		? ghStatus?.version
			? `Connected · v${ghStatus.version}`
			: "Connected"
		: ghInstalled
			? "Not signed in"
			: "Not installed";

	const openGitHubInstall = () => {
		window.open("https://cli.github.com/", "_blank", "noopener,noreferrer");
	};

	return (
		<>
			<div className="divide-y divide-border">
				<OnboardingRow
					icon={<SiGithub className="size-4.5" />}
					chipClassName="bg-foreground text-background"
					name="GitHub CLI"
					description="Clone, push, and create PRs."
					status={rowStatus(isPendingGh, ghReady)}
					statusLabel={ghStatusLabel}
					required
					actionLabel={ghInstalled ? "Sign in" : "Install"}
					actionIcon={
						ghInstalled ? undefined : <HiArrowUpRight className="size-3.5" />
					}
					onAction={ghInstalled ? () => setGhAuthOpen(true) : openGitHubInstall}
					onRecheck={() => void refetchGh()}
					isRechecking={isFetchingGh}
				/>
				<OnboardingRow
					icon={<ClaudeLogo className="size-4.5 text-white" />}
					chipClassName="bg-[#D97757]"
					name="Claude Code"
					description="Anthropic's coding agent."
					status={rowStatus(isPendingAnthropic, claudeConnected)}
					statusLabel={claudeConnected ? "Connected" : "Not signed in"}
					actionLabel="Sign in"
					onAction={() => setConnectProvider("anthropic")}
					onRecheck={() => void refetchAnthropic()}
					isRechecking={isFetchingAnthropic}
				/>
				<OnboardingRow
					icon={<SiOpenai className="size-4.5" />}
					chipClassName="bg-foreground text-background"
					name="Codex"
					description="OpenAI's coding agent."
					status={rowStatus(isPendingOpenAI, codexConnected)}
					statusLabel={codexConnected ? "Connected" : "Not signed in"}
					actionLabel="Sign in"
					onAction={() => setConnectProvider("openai")}
					onRecheck={() => void refetchOpenAI()}
					isRechecking={isFetchingOpenAI}
				/>
				<OnboardingRow
					icon={<FaAws className="size-4.5" />}
					chipClassName="bg-foreground text-background"
					name="More providers"
					description="Bedrock, Vertex, and more."
					status="disconnected"
					actionLabel="Provider docs"
					actionIcon={<HiArrowUpRight className="size-3.5" />}
					onAction={() =>
						window.open(
							"https://docs.superset.sh/providers",
							"_blank",
							"noopener,noreferrer",
						)
					}
				/>
			</div>

			<ProviderConnectModal
				provider={connectProvider}
				onOpenChange={(open) => {
					if (!open) setConnectProvider(null);
				}}
			/>

			<GhAuthDialog
				open={ghAuthOpen}
				onOpenChange={setGhAuthOpen}
				onExit={() => void refetchGh()}
			/>
		</>
	);
}

type RowStatus = "loading" | "connected" | "disconnected";

// Loading only covers the initial fetch — polling refetches must not flash
// the whole row back to "Checking…" every interval.
function rowStatus(isPending: boolean, connected: boolean): RowStatus {
	if (isPending) return "loading";
	return connected ? "connected" : "disconnected";
}

interface OnboardingRowProps {
	icon: ReactNode;
	chipClassName?: string;
	name: string;
	description: string;
	status: RowStatus;
	statusLabel?: string;
	required?: boolean;
	actionLabel: string;
	actionIcon?: ReactNode;
	onAction: () => void;
	onRecheck?: () => void;
	isRechecking?: boolean;
}

function OnboardingRow({
	icon,
	chipClassName,
	name,
	description,
	status,
	statusLabel,
	required,
	actionLabel,
	actionIcon,
	onAction,
	onRecheck,
	isRechecking,
}: OnboardingRowProps) {
	return (
		<div className="flex items-center gap-4 py-7 first:pt-0 last:pb-0">
			<div
				className={cn(
					"flex size-9 shrink-0 items-center justify-center rounded-md",
					chipClassName ?? "bg-muted text-foreground",
				)}
			>
				{icon}
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium text-foreground">{name}</p>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{status === "loading" ? (
					<span className="flex items-center gap-1.5 px-3 text-sm text-muted-foreground">
						<Spinner className="size-3.5" />
						Checking…
					</span>
				) : status === "connected" ? (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={onRecheck}
						disabled={!onRecheck}
						className="text-emerald-500 hover:text-emerald-500"
					>
						<LuCheck className="size-3.5" strokeWidth={2.5} />
						{statusLabel ?? "Connected"}
					</Button>
				) : (
					<>
						{statusLabel && (
							<span className="text-sm text-muted-foreground">
								{statusLabel}
							</span>
						)}
						{required && <Badge variant="outline">Required</Badge>}
						{onRecheck && (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={onRecheck}
								disabled={isRechecking}
								aria-label={`Recheck ${name}`}
							>
								<LuRefreshCw
									className={cn("size-3.5", isRechecking && "animate-spin")}
								/>
							</Button>
						)}
						<Button type="button" size="sm" onClick={onAction}>
							{actionLabel}
							{actionIcon}
						</Button>
					</>
				)}
			</div>
		</div>
	);
}
