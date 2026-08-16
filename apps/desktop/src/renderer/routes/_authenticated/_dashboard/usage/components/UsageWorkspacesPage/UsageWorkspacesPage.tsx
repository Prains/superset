import { Input } from "@superset/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuArrowLeft } from "react-icons/lu";
import { useHostUsageHistory } from "../../hooks/useHostUsageHistory";
import type { HistoryMetric } from "../UsageHistorySection/constants";
import { RANGE_OPTIONS } from "../UsageHistorySection/constants";
import {
	formatTokens,
	formatUsd,
} from "../UsageHistorySection/utils/formatUsage";
import type { ProjectRow } from "../WorkspaceUsageRow";
import { WorkspaceUsageRow } from "../WorkspaceUsageRow";

type KindFilter = "all" | ProjectRow["kind"];

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "workspace", label: "Workspaces" },
	{ value: "project", label: "Repos" },
	{ value: "other", label: "Other" },
];

/** Every attributed workspace/repo in the range, searchable and filterable. */
export function UsageWorkspacesPage({ hostUrl }: { hostUrl: string | null }) {
	const [days, setDays] = useState<number>(30);
	const [metric, setMetric] = useState<HistoryMetric>("usd");
	const [kind, setKind] = useState<KindFilter>("all");
	const [query, setQuery] = useState("");
	const historyQuery = useHostUsageHistory(hostUrl, days);
	const history = historyQuery.data ?? null;

	const rows = useMemo(() => {
		if (!history) return [];
		const needle = query.trim().toLowerCase();
		return history.projects
			.filter((row) => kind === "all" || row.kind === kind)
			.filter((row) => !needle || row.project.toLowerCase().includes(needle))
			.sort((a, b) => b[metric] - a[metric]);
	}, [history, kind, query, metric]);

	const maxValue = rows[0] ? rows[0][metric] : 0;
	const filteredUsd = rows.reduce((sum, row) => sum + row.usd, 0);
	const filteredTokens = rows.reduce((sum, row) => sum + row.tokens, 0);

	return (
		<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-3 px-6 py-4">
			<div className="flex flex-wrap items-center gap-2">
				<Link
					to="/usage"
					className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<LuArrowLeft className="size-3" />
					Usage
				</Link>
				<span className="text-muted-foreground/60">/</span>
				<h1 className="text-base font-semibold tracking-tight">Workspaces</h1>
				<div className="ml-auto flex items-center gap-1.5">
					<Tabs
						value={metric}
						onValueChange={(value) => setMetric(value as HistoryMetric)}
					>
						<TabsList className="h-6">
							<TabsTrigger value="usd" className="h-4 px-1.5 text-[10px]">
								Cost
							</TabsTrigger>
							<TabsTrigger value="tokens" className="h-4 px-1.5 text-[10px]">
								Tokens
							</TabsTrigger>
						</TabsList>
					</Tabs>
					<Tabs
						value={String(days)}
						onValueChange={(value) => setDays(Number(value))}
					>
						<TabsList className="h-6">
							{RANGE_OPTIONS.map((option) => (
								<TabsTrigger
									key={option}
									value={String(option)}
									className="h-4 px-1.5 text-[10px]"
								>
									{option}d
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Filter workspaces…"
					className="h-6 w-56 px-2 text-[11px]"
				/>
				<Tabs
					value={kind}
					onValueChange={(value) => setKind(value as KindFilter)}
				>
					<TabsList className="h-6">
						{KIND_FILTERS.map((option) => (
							<TabsTrigger
								key={option.value}
								value={option.value}
								className="h-4 px-1.5 text-[10px]"
							>
								{option.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
					{rows.length} shown · {formatUsd(filteredUsd)} ·{" "}
					{formatTokens(filteredTokens)} tokens
				</span>
			</div>

			{!history ? (
				<div className="py-8 text-center text-xs text-muted-foreground">
					Loading usage history…
				</div>
			) : rows.length === 0 ? (
				<div className="py-8 text-center text-xs text-muted-foreground">
					No workspaces match.
				</div>
			) : (
				<div className="flex flex-col gap-1.5">
					<div className="flex items-baseline justify-between border-b py-1 text-[11px] text-muted-foreground">
						<span className="font-medium">Workspace</span>
						<span className="font-medium">
							{metric === "usd" ? "Cost" : "Tokens"}
						</span>
					</div>
					{rows.map((row) => (
						<WorkspaceUsageRow
							key={row.project}
							row={row}
							maxValue={maxValue}
							metric={metric}
							drillable={row.project in history.projectDetails}
						/>
					))}
				</div>
			)}
		</div>
	);
}
