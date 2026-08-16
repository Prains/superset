import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { useHostUsageHistory } from "../../hooks/useHostUsageHistory";
import { SectionPanel } from "../SectionPanel";
import { UsageAreaChart } from "./components/UsageAreaChart";
import { UsageMetricTiles } from "./components/UsageMetricTiles";
import { UsageModelTable } from "./components/UsageModelTable";
import { UsageProjectBars } from "./components/UsageProjectBars";
import type { HistoryMetric } from "./constants";
import {
	PROVIDER_CHART_CONFIG,
	PROVIDER_ORDER,
	RANGE_OPTIONS,
} from "./constants";
import { formatDayLabel, formatTokens, formatUsd } from "./utils/formatUsage";

export function UsageHistorySection({ hostUrl }: { hostUrl: string | null }) {
	const [days, setDays] = useState<number>(30);
	const [metric, setMetric] = useState<HistoryMetric>("usd");
	const historyQuery = useHostUsageHistory(hostUrl, days);
	const history = historyQuery.data ?? null;

	const firstDay = history?.buckets[0]?.day;
	const lastDay = history?.buckets[history.buckets.length - 1]?.day;
	const caption =
		firstDay && lastDay && history
			? `${formatDayLabel(firstDay)} – ${formatDayLabel(lastDay)} · estimated from local session logs at API list rates (updated ${history.pricingTableUpdated})`
			: "Estimated from this host's local session logs at API list rates.";

	return (
		<SectionPanel
			title="Token usage"
			caption={caption}
			actions={
				<>
					<Tabs
						value={metric}
						onValueChange={(value) => setMetric(value as HistoryMetric)}
					>
						<TabsList className="h-7">
							<TabsTrigger value="usd" className="h-5 px-2 text-[11px]">
								Cost
							</TabsTrigger>
							<TabsTrigger value="tokens" className="h-5 px-2 text-[11px]">
								Tokens
							</TabsTrigger>
						</TabsList>
					</Tabs>
					<Tabs
						value={String(days)}
						onValueChange={(value) => setDays(Number(value))}
					>
						<TabsList className="h-7">
							{RANGE_OPTIONS.map((option) => (
								<TabsTrigger
									key={option}
									value={String(option)}
									className="h-5 px-2 text-[11px]"
								>
									{option}d
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</>
			}
		>
			{!history ? (
				<div className="py-10 text-center text-sm text-muted-foreground">
					{historyQuery.isError
						? "Couldn't read usage history from this host."
						: "Scanning transcript logs…"}
				</div>
			) : (
				<div className="flex flex-col gap-4">
					<div
						className={cn(
							"grid gap-6 md:grid-cols-[16rem_1fr]",
							historyQuery.isFetching && "opacity-70",
						)}
					>
						<div className="flex flex-col gap-3">
							<div>
								<div className="text-4xl font-semibold tabular-nums">
									{metric === "usd"
										? `${formatUsd(history.totals.usd)}*`
										: formatTokens(history.totals.tokens)}
								</div>
								<div className="mt-1 text-xs text-muted-foreground">
									{metric === "usd"
										? "* if billed at full API rate"
										: "input, cache and output tokens"}
								</div>
								{metric === "usd" && (
									<div className="mt-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
										Cost to you: $0 — covered by your subscriptions
									</div>
								)}
							</div>
							<div className="flex flex-col gap-2.5">
								{PROVIDER_ORDER.map((provider) => {
									const totalsFor = history.buckets.reduce(
										(acc, bucket) => {
											const slot = bucket.providers[provider];
											acc.usd += slot?.usd ?? 0;
											acc.tokens += slot?.tokens ?? 0;
											return acc;
										},
										{ usd: 0, tokens: 0 },
									);
									const denominator =
										metric === "usd"
											? history.totals.usd
											: history.totals.tokens;
									const share =
										denominator > 0
											? (metric === "usd" ? totalsFor.usd : totalsFor.tokens) /
												denominator
											: 0;
									return (
										<div key={provider} className="flex flex-col gap-1">
											<div className="flex items-baseline justify-between gap-2 text-xs">
												<span className="flex items-center gap-1.5">
													<span
														className="size-2 rounded-[2px]"
														style={{
															background: PROVIDER_CHART_CONFIG[provider].color,
														}}
													/>
													{PROVIDER_CHART_CONFIG[provider].label}
												</span>
												<span className="tabular-nums">
													{metric === "usd"
														? formatUsd(totalsFor.usd)
														: formatTokens(totalsFor.tokens)}
												</span>
											</div>
											<div className="h-1 w-full overflow-hidden rounded-full bg-muted">
												<div
													className="h-full rounded-full"
													style={{
														width: `${Math.max(share > 0 ? 1 : 0, 100 * share)}%`,
														background: PROVIDER_CHART_CONFIG[provider].color,
													}}
												/>
											</div>
											<span className="text-[11px] text-muted-foreground tabular-nums">
												{Math.round(100 * share)}% of{" "}
												{metric === "usd" ? "cost" : "tokens"} ·{" "}
												{formatTokens(totalsFor.tokens)} tokens
											</span>
										</div>
									);
								})}
							</div>
						</div>
						<UsageAreaChart history={history} metric={metric} />
					</div>

					<UsageMetricTiles history={history} />

					<div className="grid gap-4 md:grid-cols-2">
						<div className="flex min-w-0 flex-col gap-2">
							<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								By model
							</h3>
							<UsageModelTable history={history} />
						</div>
						<div className="flex min-w-0 flex-col gap-2">
							<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								By project
							</h3>
							<UsageProjectBars history={history} />
						</div>
					</div>
				</div>
			)}
		</SectionPanel>
	);
}
