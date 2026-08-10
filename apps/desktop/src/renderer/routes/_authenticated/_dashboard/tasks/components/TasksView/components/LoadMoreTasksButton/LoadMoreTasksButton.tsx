import { Button } from "@superset/ui/button";

interface LoadMoreTasksButtonProps {
	onLoadMore: () => void;
	isLoading: boolean;
}

export function LoadMoreTasksButton({
	onLoadMore,
	isLoading,
}: LoadMoreTasksButtonProps) {
	return (
		<div className="flex justify-center px-4 py-3">
			<Button
				variant="outline"
				size="sm"
				onClick={onLoadMore}
				disabled={isLoading}
			>
				{isLoading ? "Loading…" : "Load more"}
			</Button>
		</div>
	);
}
