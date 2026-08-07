import { chatServiceTrpc } from "@superset/chat/client";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { HiArrowUpRight } from "react-icons/hi2";
import { LuBookOpen, LuCheck, LuCircle } from "react-icons/lu";
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

function OnboardingDashboardPage() {
	const [connectProvider, setConnectProvider] = useState<Provider | null>(null);
	const [ghAuthOpen, setGhAuthOpen] = useState(false);

	const {
		data: ghStatus,
		refetch: refetchGh,
		isFetching: isFetchingGh,
	} = electronTrpc.system.detectGhCli.useQuery();
	const {
		data: anthropicStatus,
		refetch: refetchAnthropic,
		isFetching: isFetchingAnthropic,
	} = chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const {
		data: openAIStatus,
		refetch: refetchOpenAI,
		isFetching: isFetchingOpenAI,
	} = chatServiceTrpc.auth.getOpenAIStatus.useQuery();

	const ghInstalled = ghStatus?.installed === true;
	const ghReady = ghInstalled && ghStatus?.authenticated === true;
	const claudeConnected =
		!!anthropicStatus?.authenticated && !anthropicStatus.issue;
	const codexConnected = !!openAIStatus?.authenticated && !openAIStatus.issue;
	const agentConnected = claudeConnected || codexConnected;

	const openGitHubInstall = () => {
		window.open("https://cli.github.com/", "_blank", "noopener,noreferrer");
	};

	return (
		<>
			<div className="space-y-4">
				<div
					className={cn(
						"flex items-start gap-3 rounded-lg border p-4",
						agentConnected
							? "border-emerald-500/20 bg-emerald-500/5"
							: "border-border bg-card/40",
					)}
				>
					<div
						className={cn(
							"mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border",
							agentConnected
								? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
								: "border-border bg-background text-muted-foreground",
						)}
					>
						{agentConnected ? (
							<LuCheck className="size-4" />
						) : (
							<LuCircle className="size-4" />
						)}
					</div>
					<div className="min-w-0 space-y-1">
						<p className="text-sm font-medium text-foreground">
							{agentConnected
								? "An agent is ready"
								: "Connect at least one agent for the smoothest start"}
						</p>
						<p className="text-xs leading-5 text-muted-foreground">
							You can also continue and add providers later from Settings.
						</p>
					</div>
				</div>

				<div className="overflow-hidden rounded-lg border border-border bg-card/50">
					<OnboardingRow
						icon={<ClaudeLogo className="size-4.5 text-white" />}
						chipClassName="bg-[#D97757]"
						name="Claude Code"
						description="Run Anthropic's coding agent in Superset workspaces."
						status={rowStatus(isFetchingAnthropic, claudeConnected)}
						tagLabel="Agent"
						actionLabel="Connect"
						onAction={() => setConnectProvider("anthropic")}
						onRecheck={() => void refetchAnthropic()}
					/>
					<OnboardingRow
						icon={<SiOpenai className="size-4.5" />}
						chipClassName="bg-foreground text-background"
						name="Codex"
						description="Run OpenAI's coding agent in Superset workspaces."
						status={rowStatus(isFetchingOpenAI, codexConnected)}
						tagLabel="Agent"
						actionLabel="Connect"
						onAction={() => setConnectProvider("openai")}
						onRecheck={() => void refetchOpenAI()}
					/>
					<OnboardingRow
						icon={<SiGithub className="size-4.5" />}
						chipClassName="bg-foreground text-background"
						name="GitHub CLI"
						description="Clone repositories, push branches, and open pull requests."
						status={rowStatus(isFetchingGh, ghReady)}
						tagLabel="Recommended"
						actionLabel={ghInstalled ? "Sign in" : "Install"}
						actionIcon={
							ghInstalled ? undefined : <HiArrowUpRight className="size-3.5" />
						}
						onAction={
							ghInstalled ? () => setGhAuthOpen(true) : openGitHubInstall
						}
						onRecheck={() => void refetchGh()}
					/>
				</div>

				<div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-background/40 p-4">
					<div className="flex min-w-0 items-center gap-3">
						<div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
							<LuBookOpen className="size-4" />
						</div>
						<div className="min-w-0">
							<p className="text-sm font-medium text-foreground">
								Using another provider?
							</p>
							<p className="text-xs text-muted-foreground">
								Bedrock, Vertex, and custom providers are available in docs.
							</p>
						</div>
					</div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() =>
							window.open(
								"https://docs.superset.sh/providers",
								"_blank",
								"noopener,noreferrer",
							)
						}
					>
						Open docs
						<HiArrowUpRight className="size-3.5" />
					</Button>
				</div>
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

function rowStatus(isFetching: boolean, connected: boolean): RowStatus {
	if (isFetching) return "loading";
	return connected ? "connected" : "disconnected";
}

interface OnboardingRowProps {
	icon: ReactNode;
	chipClassName?: string;
	name: string;
	description: string;
	status: RowStatus;
	tagLabel?: string;
	actionLabel: string;
	actionIcon?: ReactNode;
	onAction: () => void;
	onRecheck?: () => void;
}

function OnboardingRow({
	icon,
	chipClassName,
	name,
	description,
	status,
	tagLabel,
	actionLabel,
	actionIcon,
	onAction,
	onRecheck,
}: OnboardingRowProps) {
	return (
		<div className="flex items-center gap-4 border-border border-b px-4 py-4 last:border-b-0">
			<div
				className={cn(
					"flex size-9 shrink-0 items-center justify-center rounded-md",
					chipClassName ?? "bg-muted text-foreground",
				)}
			>
				{icon}
			</div>
			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex items-center gap-2">
					<p className="truncate text-sm font-medium text-foreground">{name}</p>
					{tagLabel && (
						<Badge variant="outline" className="text-[10px]">
							{tagLabel}
						</Badge>
					)}
				</div>
				<p className="text-xs leading-5 text-muted-foreground">{description}</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{status === "loading" ? (
					<span className="flex items-center gap-1.5 px-3 text-xs text-muted-foreground">
						<Spinner className="size-3.5" />
						Checking
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
						Ready
					</Button>
				) : (
					<Button type="button" size="sm" onClick={onAction}>
						{actionLabel}
						{actionIcon}
					</Button>
				)}
			</div>
		</div>
	);
}
