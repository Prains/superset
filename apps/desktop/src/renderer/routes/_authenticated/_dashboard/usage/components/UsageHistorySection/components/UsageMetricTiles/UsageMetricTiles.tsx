import type { UsageHistory } from "../../../../hooks/useHostUsageHistory";
import { formatTokens, formatUsd } from "../../utils/formatUsage";

function Tile({
	label,
	value,
	detail,
}: {
	label: string;
	value: string;
	detail: string;
}) {
	return (
		<div className="flex flex-col gap-0.5 bg-background p-3">
			<span className="text-[11px] text-muted-foreground">{label}</span>
			<span className="text-lg font-semibold tabular-nums">{value}</span>
			<span className="text-[11px] text-muted-foreground">{detail}</span>
		</div>
	);
}

/** T3-style hairline metric strip: label / value / detail per tile. */
export function UsageMetricTiles({ history }: { history: UsageHistory }) {
	const { totals } = history;
	const observedInput =
		totals.uncachedInput + totals.cachedInput + totals.cacheWrite;
	const cachedShare =
		observedInput > 0
			? Math.round((100 * totals.cachedInput) / observedInput)
			: 0;
	const activeDays = history.buckets.filter((b) => b.tokens > 0).length;
	const perActiveDay =
		activeDays > 0 ? formatTokens(totals.tokens / activeDays) : "0";
	const savingsMultiple =
		totals.usd > 0 ? (totals.cacheSavingsUsd / totals.usd).toFixed(1) : "0";

	return (
		<div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-5">
			<Tile
				label="Processed tokens"
				value={formatTokens(totals.tokens)}
				detail={`${perActiveDay} per active day`}
			/>
			<Tile
				label="Cached input"
				value={formatTokens(totals.cachedInput)}
				detail={`${cachedShare}% of observed input`}
			/>
			<Tile
				label="Uncached input"
				value={formatTokens(totals.uncachedInput)}
				detail={`${formatTokens(totals.cacheWrite)} cache writes`}
			/>
			<Tile
				label="Output"
				value={formatTokens(totals.output)}
				detail={`includes ${formatTokens(totals.reasoningOutput)} reasoning`}
			/>
			<Tile
				label="Cache savings"
				value={formatUsd(totals.cacheSavingsUsd)}
				detail={`${savingsMultiple}x the raw token cost`}
			/>
		</div>
	);
}
