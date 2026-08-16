import type { UsageHistory } from "../../../../hooks/useHostUsageHistory";
import { formatTokens, formatUsd } from "../../utils/formatUsage";

const MAX_ROWS = 7;

/**
 * Top workspaces/projects by cost — the attribution no menu-bar tracker
 * has. Transcript cwds are joined against the host's own workspace worktree
 * and project repo paths.
 */
export function UsageProjectBars({ history }: { history: UsageHistory }) {
	const rows = history.projects.slice(0, MAX_ROWS);
	if (rows.length === 0) return null;
	const maxUsd = rows[0]?.usd ?? 0;

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-baseline justify-between border-b py-1 text-[11px] text-muted-foreground">
				<span className="font-medium">Workspace</span>
				<span className="font-medium">Cost</span>
			</div>
			{rows.map((row) => (
				<div key={row.project} className="flex flex-col gap-0.5">
					<div className="flex items-baseline justify-between gap-3 text-[11px]">
						<span className="flex min-w-0 items-baseline gap-1.5 truncate">
							{row.project}
							{row.kind === "project" && (
								<span className="text-[9px] uppercase text-muted-foreground">
									repo
								</span>
							)}
						</span>
						<span className="flex shrink-0 items-baseline gap-2 tabular-nums">
							<span className="text-muted-foreground">
								{formatTokens(row.tokens)}
							</span>
							<span>{formatUsd(row.usd)}</span>
						</span>
					</div>
					<div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-primary/60"
							style={{
								width: `${maxUsd > 0 ? Math.max(1, (100 * row.usd) / maxUsd) : 0}%`,
							}}
						/>
					</div>
				</div>
			))}
		</div>
	);
}
