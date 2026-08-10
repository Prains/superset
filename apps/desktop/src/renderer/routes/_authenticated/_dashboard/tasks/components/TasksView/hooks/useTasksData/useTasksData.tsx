import type { SelectTask, SelectTaskStatus } from "@superset/db/schema";
import type { RouterOutputs } from "@superset/trpc";
import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { TabValue } from "../../components/TasksTopBar";
import { matchesTaskStatusFilter } from "../../utils/matchesTaskStatusFilter";
import { compareTasks } from "../../utils/sorting";
import { useHybridSearch } from "../useHybridSearch";

/**
 * Shared by every tasks read site so they hit one React Query cache entry.
 */
export const TASK_LIST_INPUT = { limit: 500 };
export const TASK_LIST_REFETCH_INTERVAL = 15_000;

export type TaskAssignee = NonNullable<
	RouterOutputs["task"]["list"][number]["assignee"]
>;

export type TaskWithStatus = SelectTask & {
	status: SelectTaskStatus;
	assignee: TaskAssignee | null;
};

interface UseTasksDataParams {
	filterTab: TabValue;
	searchQuery: string;
	assigneeFilter: string | null;
	linearProjectFilter: string | null;
}

export function useTasksJoinedWithStatuses(): {
	tasks: TaskWithStatus[];
	statuses: SelectTaskStatus[];
} {
	const { data: taskRows } = cloudTrpc.task.list.useQuery(TASK_LIST_INPUT, {
		refetchInterval: TASK_LIST_REFETCH_INTERVAL,
	});
	const { data: statusRows } = cloudTrpc.task.statuses.list.useQuery(
		undefined,
		{ refetchInterval: TASK_LIST_REFETCH_INTERVAL },
	);

	const statuses = useMemo(() => statusRows ?? [], [statusRows]);

	const tasks = useMemo(() => {
		if (!taskRows || statuses.length === 0) return [];
		const statusById = new Map(statuses.map((status) => [status.id, status]));
		return taskRows
			.flatMap((row) => {
				const status = statusById.get(row.task.statusId);
				if (!status) return [];
				return [{ ...row.task, status, assignee: row.assignee }];
			})
			.sort(compareTasks);
	}, [taskRows, statuses]);

	return { tasks, statuses };
}

export function useTasksData({
	filterTab,
	searchQuery,
	assigneeFilter,
	linearProjectFilter,
}: UseTasksDataParams): {
	data: TaskWithStatus[];
	allStatuses: SelectTaskStatus[];
} {
	const { tasks: sortedData, statuses: allStatuses } =
		useTasksJoinedWithStatuses();

	const { search } = useHybridSearch(sortedData);

	const searchedData = useMemo(() => {
		if (!searchQuery.trim()) {
			return sortedData;
		}
		const results = search(searchQuery);
		return results.map((r) => r.item);
	}, [sortedData, searchQuery, search]);

	const filteredData = useMemo(() => {
		let result = searchedData;

		if (linearProjectFilter) {
			result = result.filter(
				(task) => task.externalProjectId === linearProjectFilter,
			);
		}

		if (filterTab !== "all") {
			result = result.filter((task) =>
				matchesTaskStatusFilter(task.status.type, filterTab),
			);
		}

		if (assigneeFilter) {
			result = result.filter((task) => {
				if (assigneeFilter === "unassigned") {
					return task.assigneeId === null && task.assigneeExternalId === null;
				}
				if (assigneeFilter.startsWith("ext:")) {
					return task.assigneeExternalId === assigneeFilter.slice(4);
				}
				return task.assigneeId === assigneeFilter;
			});
		}

		return result;
	}, [searchedData, filterTab, assigneeFilter, linearProjectFilter]);

	return {
		data: filteredData,
		allStatuses,
	};
}
