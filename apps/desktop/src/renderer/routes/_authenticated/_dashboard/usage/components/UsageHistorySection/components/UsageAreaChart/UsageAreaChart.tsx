import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { UsageHistory } from "../../../../hooks/useHostUsageHistory";
import type { HistoryMetric } from "../../constants";
import { PROVIDER_CHART_CONFIG, PROVIDER_ORDER } from "../../constants";
import {
	formatDayLabel,
	formatTokens,
	formatUsd,
} from "../../utils/formatUsage";

/**
 * Layered (NOT stacked) per-provider areas, each measured from zero — a
 * stacked chart permanently draws one provider above the other, which reads
 * as "that one is bigger" even on days where it is not.
 */
export function UsageAreaChart({
	history,
	metric,
}: {
	history: UsageHistory;
	metric: HistoryMetric;
}) {
	const data = useMemo(
		() =>
			history.buckets.map((bucket) => ({
				day: bucket.day,
				claude: bucket.providers.claude?.[metric] ?? 0,
				codex: bucket.providers.codex?.[metric] ?? 0,
			})),
		[history, metric],
	);

	const formatValue = metric === "usd" ? formatUsd : formatTokens;
	// Ticks at first / middle / last only — more labels than that just add
	// noise at this width.
	const ticks =
		data.length >= 3
			? [
					data[0]?.day,
					data[Math.floor(data.length / 2)]?.day,
					data[data.length - 1]?.day,
				].filter((d): d is string => !!d)
			: undefined;

	return (
		<div className="flex flex-col gap-2">
			<ChartContainer config={PROVIDER_CHART_CONFIG} className="h-56 w-full">
				<AreaChart data={data} margin={{ left: 4, right: 4, top: 4 }}>
					<CartesianGrid vertical={false} strokeOpacity={0.35} />
					<XAxis
						dataKey="day"
						ticks={ticks}
						tickFormatter={formatDayLabel}
						tickLine={false}
						axisLine={false}
						tickMargin={8}
						className="text-[10px]"
					/>
					<YAxis
						width={44}
						tickCount={4}
						tickFormatter={(value: number) => formatValue(value)}
						tickLine={false}
						axisLine={false}
						className="text-[10px]"
					/>
					<ChartTooltip
						cursor={{ strokeDasharray: "3 3" }}
						content={
							<ChartTooltipContent
								labelFormatter={(value) => formatDayLabel(String(value))}
								formatter={(value, name, item) => (
									<>
										<span
											className="size-2 shrink-0 rounded-[2px]"
											style={{ background: item.color }}
										/>
										<span className="text-muted-foreground">
											{
												PROVIDER_CHART_CONFIG[
													name as keyof typeof PROVIDER_CHART_CONFIG
												]?.label
											}
										</span>
										<span className="ml-auto font-mono tabular-nums">
											{formatValue(Number(value))}
										</span>
									</>
								)}
							/>
						}
					/>
					{PROVIDER_ORDER.map((provider) => (
						<Area
							key={provider}
							dataKey={provider}
							type="monotone"
							stroke={`var(--color-${provider})`}
							fill={`var(--color-${provider})`}
							strokeWidth={2}
							fillOpacity={0.12}
							dot={false}
							isAnimationActive={false}
						/>
					))}
				</AreaChart>
			</ChartContainer>
			<div className="flex items-center justify-center gap-4">
				{PROVIDER_ORDER.map((provider) => (
					<span
						key={provider}
						className="flex items-center gap-1.5 text-xs text-muted-foreground"
					>
						<span
							className="size-2 rounded-[2px]"
							style={{ background: PROVIDER_CHART_CONFIG[provider].color }}
						/>
						{PROVIDER_CHART_CONFIG[provider].label}
					</span>
				))}
			</div>
		</div>
	);
}
