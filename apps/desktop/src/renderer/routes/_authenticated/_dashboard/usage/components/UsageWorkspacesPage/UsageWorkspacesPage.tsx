import { Input } from "@superset/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuArrowLeft, LuX } from "react-icons/lu";
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
type ViewMode = "workspaces" | "projects";

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "workspace", label: "Workspaces" },
	{ value: "project", label: "Repos" },
	{ value: "other", label: "Other" },
];

interface ProjectGroup {
	name: string;
	usd: number;
	tokens: number;
	workspaceCount: number;
	/** True when the group is a real project (vs a standalone fallback row). */
	grouped: boolean;
}

/**
 * Every attributed workspace/repo in the range — searchable, filterable,
 * and pivotable to a per-project rollup. Clicking a project narrows the
 * workspace list to that project.
 */
export function UsageWorkspacesPage({ hostUrl }: { hostUrl: string | null }) {
	const [days, setDays] = useState<number>(30);
	const [metric, setMetric] = useState<HistoryMetric>("usd");
	const [view, setView] = useState<ViewMode>("workspaces");
	const [kind, setKind] = useState<KindFilter>("all");
	const [projectFilter, setProjectFilter] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const historyQuery = useHostUsageHistory(hostUrl, days);
	const history = historyQuery.data ?? null;

	const needle = query.trim().toLowerCase();

	const workspaceRows = useMemo(() => {
		if (!history) return [];
		return history.projects
			.filter((row) => kind === "all" || row.kind === kind)
			.filter((row) => !projectFilter || row.group === projectFilter)
			.filter((row) => !needle || row.project.toLowerCase().includes(needle))
			.sort((a, b) => b[metric] - a[metric]);
	}, [history, kind, projectFilter, needle, metric]);

	const projectGroups = useMemo(() => {
		if (!history) return [];
		const groups = new Map<string, ProjectGroup>();
		for (const row of history.projects) {
			const name = row.group ?? row.project;
			let group = groups.get(name);
			if (!group) {
				group = {
					name,
					usd: 0,
					tokens: 0,
					workspaceCount: 0,
					grouped: row.group !== null,
				};
				groups.set(name, group);
			}
			group.usd += row.usd;
			group.tokens += row.tokens;
			group.workspaceCount += 1;
			group.grouped ||= row.group !== null;
		}
		return [...groups.values()]
			.filter((group) => !needle || group.name.toLowerCase().includes(needle))
			.sort((a, b) => b[metric] - a[metric]);
	}, [history, needle, metric]);

	const shownRows: Array<{ usd: number; tokens: number }> =
		view === "workspaces" ? workspaceRows : projectGroups;
	const shownUsd = shownRows.reduce((sum, row) => sum + row.usd, 0);
	const shownTokens = shownRows.reduce((sum, row) => sum + row.tokens, 0);
	const shownCount = shownRows.length;
	const workspaceMax = workspaceRows[0] ? workspaceRows[0][metric] : 0;
	const projectMax = projectGroups[0] ? projectGroups[0][metric] : 0;

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
				<h1 className="text-base font-semibold tracking-tight">
					{view === "projects" ? "Projects" : "Workspaces"}
				</h1>
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
				<Tabs
					value={view}
					onValueChange={(value) => {
						setView(value as ViewMode);
						if (value === "projects") setProjectFilter(null);
					}}
				>
					<TabsList className="h-6">
						<TabsTrigger value="workspaces" className="h-4 px-1.5 text-[10px]">
							Workspaces
						</TabsTrigger>
						<TabsTrigger value="projects" className="h-4 px-1.5 text-[10px]">
							Projects
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<Input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={
						view === "projects" ? "Filter projects…" : "Filter workspaces…"
					}
					className="h-6 w-56 px-2 text-[11px]"
				/>
				{view === "workspaces" && (
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
				)}
				{projectFilter && view === "workspaces" && (
					<button
						type="button"
						onClick={() => setProjectFilter(null)}
						className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
					>
						Project: {projectFilter}
						<LuX className="size-2.5" />
					</button>
				)}
				<span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
					{shownCount} shown · {formatUsd(shownUsd)} ·{" "}
					{formatTokens(shownTokens)} tokens
				</span>
			</div>

			{!history ? (
				<div className="py-8 text-center text-xs text-muted-foreground">
					Loading usage history…
				</div>
			) : shownCount === 0 ? (
				<div className="py-8 text-center text-xs text-muted-foreground">
					No {view} match.
				</div>
			) : view === "projects" ? (
				<div className="flex flex-col gap-1.5">
					<div className="flex items-baseline justify-between border-b py-1 text-[11px] text-muted-foreground">
						<span className="font-medium">Project</span>
						<span className="font-medium">
							{metric === "usd" ? "Cost" : "Tokens"}
						</span>
					</div>
					{projectGroups.map((group) => (
						<button
							key={group.name}
							type="button"
							onClick={() => {
								setProjectFilter(group.grouped ? group.name : null);
								if (!group.grouped) setQuery(group.name);
								setView("workspaces");
							}}
							className="flex flex-col gap-0.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/60"
						>
							<div className="flex items-baseline justify-between gap-3 text-[11px]">
								<span className="flex min-w-0 items-baseline gap-1.5 truncate">
									{group.name}
									{group.workspaceCount > 1 && (
										<span className="text-[9px] text-muted-foreground">
											{group.workspaceCount} workspaces
										</span>
									)}
								</span>
								<span className="flex shrink-0 items-baseline gap-2 tabular-nums">
									<span className="text-muted-foreground">
										{formatTokens(group.tokens)}
									</span>
									<span>{formatUsd(group.usd)}</span>
								</span>
							</div>
							<div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
								<div
									className="h-full rounded-full bg-primary/60"
									style={{
										width: `${projectMax > 0 ? Math.max(1, (100 * (metric === "usd" ? group.usd : group.tokens)) / projectMax) : 0}%`,
									}}
								/>
							</div>
						</button>
					))}
				</div>
			) : (
				<div className="flex flex-col gap-1.5">
					<div className="flex items-baseline justify-between border-b py-1 text-[11px] text-muted-foreground">
						<span className="font-medium">Workspace</span>
						<span className="font-medium">
							{metric === "usd" ? "Cost" : "Tokens"}
						</span>
					</div>
					{workspaceRows.map((row) => (
						<WorkspaceUsageRow
							key={row.project}
							row={row}
							maxValue={workspaceMax}
							metric={metric}
							drillable={row.project in history.projectDetails}
						/>
					))}
				</div>
			)}
		</div>
	);
}
