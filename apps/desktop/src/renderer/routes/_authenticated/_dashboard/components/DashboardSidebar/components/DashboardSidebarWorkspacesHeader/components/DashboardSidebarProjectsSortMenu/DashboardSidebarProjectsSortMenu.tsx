import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiOutlineArrowsUpDown } from "react-icons/hi2";
import type { SidebarProjectSortMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

const SORT_MODE_LABELS: Record<SidebarProjectSortMode, string> = {
	manual: "Manual",
	created: "Date created",
	updated: "Last updated",
};

interface DashboardSidebarProjectsSortMenuProps {
	sortMode: SidebarProjectSortMode;
	onSortModeChange: (mode: SidebarProjectSortMode) => void;
}

export function DashboardSidebarProjectsSortMenu({
	sortMode,
	onSortModeChange,
}: DashboardSidebarProjectsSortMenuProps) {
	return (
		<DropdownMenu>
			<Tooltip delayDuration={700}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label="Sort projects"
							onClick={(event) => event.stopPropagation()}
							onKeyDown={(event) => event.stopPropagation()}
							className={cn(
								"flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-fill-hover hover:text-foreground",
								sortMode === "manual"
									? "text-muted-foreground"
									: "text-foreground",
							)}
						>
							<HiOutlineArrowsUpDown className="size-3.5" />
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					Sort projects ({SORT_MODE_LABELS[sortMode]})
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<DropdownMenuRadioGroup
					value={sortMode}
					onValueChange={(value) =>
						onSortModeChange(value as SidebarProjectSortMode)
					}
				>
					<DropdownMenuRadioItem value="manual">
						{SORT_MODE_LABELS.manual}
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="created">
						{SORT_MODE_LABELS.created}
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="updated">
						{SORT_MODE_LABELS.updated}
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
