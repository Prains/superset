import { cn } from "@superset/ui/utils";

interface PaginationDotsProps {
	current: number;
	total: number;
	labels?: readonly string[];
}

export function PaginationDots({
	current,
	labels,
	total,
}: PaginationDotsProps) {
	const dots = Array.from({ length: total }, (_, i) => `dot-${i}`);
	return (
		<div className="flex items-center gap-3">
			{dots.map((id, i) => (
				<div
					key={id}
					className={cn(
						"flex items-center gap-1.5 text-xs transition-colors",
						i === current ? "text-foreground" : "text-muted-foreground",
					)}
				>
					<span
						aria-hidden
						className={cn(
							"size-1.5 rounded-full transition-colors",
							i === current ? "bg-foreground" : "bg-muted-foreground/30",
						)}
					/>
					{labels?.[i] && <span>{labels[i]}</span>}
				</div>
			))}
		</div>
	);
}
