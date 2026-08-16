import type { UsageHistory } from "../../../../hooks/useHostUsageHistory";
import { PROVIDER_CHART_CONFIG } from "../../constants";
import { formatTokens, formatUsd } from "../../utils/formatUsage";

const MAX_ROWS = 8;

export function UsageModelTable({ history }: { history: UsageHistory }) {
	const rows = history.models.slice(0, MAX_ROWS);
	const totalUsd = history.totals.usd;
	if (rows.length === 0) return null;

	return (
		<div className="overflow-hidden rounded-lg border">
			<table className="w-full text-xs">
				<thead>
					<tr className="border-b bg-muted/40 text-left text-muted-foreground">
						<th className="px-3 py-1.5 font-medium">Model</th>
						<th className="px-3 py-1.5 text-right font-medium">Cost</th>
						<th className="px-3 py-1.5 text-right font-medium">Share</th>
						<th className="px-3 py-1.5 text-right font-medium">Tokens</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr
							key={`${row.provider}|${row.model}`}
							className="border-b last:border-b-0"
						>
							<td className="flex items-center gap-2 px-3 py-1.5">
								<span
									className="size-2 shrink-0 rounded-[2px]"
									style={{
										background: PROVIDER_CHART_CONFIG[row.provider].color,
									}}
								/>
								<span className="truncate">{row.model}</span>
							</td>
							<td className="px-3 py-1.5 text-right tabular-nums">
								{row.approximate ? "~" : ""}
								{formatUsd(row.usd)}
							</td>
							<td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
								{totalUsd > 0
									? `${Math.round((100 * row.usd) / totalUsd)}%`
									: "—"}
							</td>
							<td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
								{formatTokens(row.tokens)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
