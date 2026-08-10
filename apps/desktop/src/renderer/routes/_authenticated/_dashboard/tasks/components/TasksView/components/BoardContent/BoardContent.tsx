import { HiCheckCircle } from "react-icons/hi2";
import type { TaskWithStatus } from "../../hooks/useTasksData";
import { useTasksData } from "../../hooks/useTasksData";
import { LoadMoreTasksButton } from "../LoadMoreTasksButton";
import { TasksBoardView } from "../TasksBoardView";
import type { TabValue } from "../TasksTopBar";

interface BoardContentProps {
	filterTab: TabValue;
	searchQuery: string;
	assigneeFilter: string | null;
	linearProjectFilter: string | null;
	onTaskClick: (task: TaskWithStatus) => void;
}

export function BoardContent({
	filterTab,
	searchQuery,
	assigneeFilter,
	linearProjectFilter,
	onTaskClick,
}: BoardContentProps) {
	const {
		data,
		allStatuses,
		fetchNextTasksPage,
		hasNextTasksPage,
		isFetchingNextTasksPage,
	} = useTasksData({
		filterTab,
		searchQuery,
		assigneeFilter,
		linearProjectFilter,
	});

	const loadMore = hasNextTasksPage ? (
		<LoadMoreTasksButton
			onLoadMore={fetchNextTasksPage}
			isLoading={isFetchingNextTasksPage}
		/>
	) : null;

	if (data.length === 0) {
		return (
			<>
				<div className="flex-1 flex items-center justify-center">
					<div className="flex flex-col items-center gap-2 text-muted-foreground">
						<HiCheckCircle className="h-8 w-8" />
						<span className="text-sm">No tasks found</span>
					</div>
				</div>
				{loadMore}
			</>
		);
	}

	return (
		<>
			<TasksBoardView
				data={data}
				allStatuses={allStatuses}
				onTaskClick={onTaskClick}
			/>
			{loadMore}
		</>
	);
}
