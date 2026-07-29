import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { VscChevronRight } from "react-icons/vsc";

interface CollapsibleRowProps {
	isExpanded: boolean;
	onToggle: (expanded: boolean) => void;
	header: ReactNode;
	/**
	 * Rendered next to the trigger rather than inside it, so interactive
	 * controls aren't nested in the trigger's `<button>`.
	 */
	trailing?: ReactNode;
	children: ReactNode;
	showChevron?: boolean;
	className?: string;
	triggerClassName?: string;
	contentClassName?: string;
}

export function CollapsibleRow({
	isExpanded,
	onToggle,
	header,
	trailing,
	children,
	showChevron = true,
	className,
	triggerClassName,
	contentClassName,
}: CollapsibleRowProps) {
	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={onToggle}
			className={cn("min-w-0", className)}
		>
			<div className="group/row flex min-w-0 items-center">
				<CollapsibleTrigger
					className={cn(
						"flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left rounded-sm",
						"hover:bg-accent/50 cursor-pointer transition-colors",
						triggerClassName,
					)}
				>
					{showChevron && (
						<VscChevronRight
							className={cn(
								"size-2.5 text-muted-foreground shrink-0 transition-transform duration-150",
								isExpanded && "rotate-90",
							)}
						/>
					)}
					{header}
				</CollapsibleTrigger>
				{trailing}
			</div>
			<CollapsibleContent className={cn("min-w-0", contentClassName)}>
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
