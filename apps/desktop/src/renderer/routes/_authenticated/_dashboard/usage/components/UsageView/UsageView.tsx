import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { SupersetIcon } from "renderer/components/SupersetIcon";
import type {
	UsageAccount,
	UsageQuotaWindow,
} from "../../hooks/useHostUsageQuota";
import { useHostUsageQuota } from "../../hooks/useHostUsageQuota";
import { SectionPanel } from "../SectionPanel";
import { UsageHistorySection } from "../UsageHistorySection";
import { formatResetLabel } from "./utils/formatResetIn";

const PROVIDER_LABELS: Record<UsageAccount["provider"], string> = {
	claude: "Claude Code",
	codex: "Codex",
};

function meterColor(usedPercent: number): string {
	if (usedPercent >= 90) return "bg-red-500";
	if (usedPercent >= 70) return "bg-amber-500";
	return "bg-primary";
}

function QuotaWindowRow({ window }: { window: UsageQuotaWindow }) {
	const percent = Math.min(window.usedPercent, 100);
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-baseline justify-between gap-3">
				<span className="min-w-0 truncate text-xs">{window.label}</span>
				<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
					{window.usedPercent}% used
				</span>
			</div>
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					className={cn("h-full rounded-full", meterColor(window.usedPercent))}
					style={{ width: `${Math.max(percent, 1)}%` }}
				/>
			</div>
			{window.resetsAt && (
				<span className="text-[11px] text-muted-foreground">
					{formatResetLabel(window.resetsAt)}
				</span>
			)}
		</div>
	);
}

function creditsLine(account: UsageAccount): string | null {
	if (account.creditsBalance !== null) {
		return `Credits: $${account.creditsBalance.toFixed(2)}`;
	}
	if (account.extraUsage) {
		const used = (account.extraUsage.usedCents / 100).toFixed(2);
		const limit = (account.extraUsage.limitCents / 100).toFixed(2);
		return `Extra usage: $${used} of $${limit}`;
	}
	return null;
}

function AccountCard({ account }: { account: UsageAccount }) {
	const credits = creditsLine(account);
	return (
		<div className="rounded-lg border bg-card p-3">
			<div className="flex items-baseline gap-2">
				<span className="truncate text-sm font-medium">
					{account.email ?? account.sourceLabel}
				</span>
				{account.plan && (
					<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						{account.plan}
					</span>
				)}
				{account.email && (
					<span className="ml-auto shrink-0 text-xs text-muted-foreground">
						{account.sourceLabel}
					</span>
				)}
			</div>
			{account.status === "ok" ? (
				<div className="mt-3 flex flex-col gap-3">
					{account.windows.map((window) => (
						<QuotaWindowRow key={window.id} window={window} />
					))}
					{credits && (
						<div className="text-xs text-muted-foreground">{credits}</div>
					)}
				</div>
			) : (
				<div className="mt-2 text-xs text-muted-foreground">
					{account.statusDetail ??
						(account.status === "token_expired"
							? "Token expired."
							: "Usage unavailable.")}
				</div>
			)}
		</div>
	);
}

function ProviderSection({
	provider,
	accounts,
}: {
	provider: UsageAccount["provider"];
	accounts: UsageAccount[];
}) {
	const isDark = useIsDarkTheme();
	const icon = getPresetIcon(provider, isDark);
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				{icon && <img src={icon} alt="" className="size-4" />}
				<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{PROVIDER_LABELS[provider]}
				</span>
			</div>
			{accounts.map((account) => (
				<AccountCard key={account.accountKey} account={account} />
			))}
		</div>
	);
}

export function UsageView({ hostUrl }: { hostUrl: string | null }) {
	const quotaQuery = useHostUsageQuota(hostUrl);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const accounts = quotaQuery.data ?? [];
	const providers = [...new Set(accounts.map((account) => account.provider))];
	const updatedAgoMinutes = Math.floor(
		(Date.now() - quotaQuery.dataUpdatedAt) / 60_000,
	);
	const isBusy = quotaQuery.isFetching || isRefreshing;

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-6">
			<div className="flex items-center gap-2.5">
				<SupersetIcon className="h-5 w-auto text-foreground" />
				<h1 className="text-lg font-semibold tracking-tight">Usage</h1>
			</div>

			<SectionPanel
				title="Plan limits"
				caption="Official quota from the provider logins on this host — refreshes every minute."
				actions={
					<>
						{quotaQuery.dataUpdatedAt > 0 && (
							<span className="text-[11px] text-muted-foreground">
								{updatedAgoMinutes < 1
									? "Updated just now"
									: `Updated ${updatedAgoMinutes}m ago`}
							</span>
						)}
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							disabled={isBusy || !hostUrl}
							onClick={() => {
								setIsRefreshing(true);
								void quotaQuery.refresh().finally(() => setIsRefreshing(false));
							}}
						>
							<LuRefreshCw
								className={cn("size-3.5", isBusy && "animate-spin")}
							/>
						</Button>
					</>
				}
			>
				{quotaQuery.isPending ? (
					<div className="py-8 text-center text-sm text-muted-foreground">
						Reading subscription usage…
					</div>
				) : accounts.length === 0 ? (
					<div className="py-8 text-center text-sm text-muted-foreground">
						No AI subscription logins found on this host.
						<div className="mt-1 text-xs">
							Sign in to Claude Code or Codex on this machine and usage will
							appear here.
						</div>
					</div>
				) : (
					<div className="grid gap-4 md:grid-cols-2">
						{providers.map((provider) => (
							<ProviderSection
								key={provider}
								provider={provider}
								accounts={accounts.filter(
									(account) => account.provider === provider,
								)}
							/>
						))}
					</div>
				)}
			</SectionPanel>

			<UsageHistorySection hostUrl={hostUrl} />
		</div>
	);
}
