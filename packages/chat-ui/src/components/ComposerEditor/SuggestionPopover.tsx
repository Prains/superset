"use client";

import { cn } from "@superset/ui/utils";
import { FileCode2Icon, SparklesIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ComposerMentionItem } from "./composerLogic";

export type SuggestionPopoverProps = {
	items: ComposerMentionItem[];
	activeIndex: number;
	onHighlight: (index: number) => void;
	onSelect: (item: ComposerMentionItem) => void;
};

const VIEWPORT_MARGIN = 8;

export function SuggestionPopover({
	items,
	activeIndex,
	onHighlight,
	onSelect,
}: SuggestionPopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);
	const [side, setSide] = useState<"above" | "below">("above");

	useLayoutEffect(() => {
		const popover = popoverRef.current;
		const anchor = popover?.offsetParent;
		if (!popover || !anchor) return;
		const anchorRect = anchor.getBoundingClientRect();
		const fitsAbove =
			anchorRect.top - popover.offsetHeight - VIEWPORT_MARGIN >= 0;
		setSide(fitsAbove ? "above" : "below");
	}, [items.length]);

	if (items.length === 0) return null;
	return (
		<div
			ref={popoverRef}
			role="listbox"
			className={cn(
				"absolute left-0 z-50 max-h-72 w-80 overflow-y-auto rounded-xl bg-popover/95 p-1 shadow-xl ring-1 ring-border backdrop-blur-sm",
				side === "above" ? "bottom-full mb-2" : "top-full mt-2",
			)}
		>
			{items.map((item, index) => (
				// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the editor
				// biome-ignore lint/a11y/useFocusableInteractive: focus stays in the editor; listbox is virtual
				<div
					key={item.id}
					role="option"
					aria-selected={index === activeIndex}
					className={cn(
						"flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm",
						index === activeIndex
							? "bg-accent text-accent-foreground"
							: "text-foreground",
					)}
					onMouseEnter={() => onHighlight(index)}
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => onSelect(item)}
				>
					{item.kind === "file" ? (
						<FileCode2Icon className="size-4 shrink-0 text-muted-foreground" />
					) : (
						<SparklesIcon className="size-4 shrink-0 text-muted-foreground" />
					)}
					<span className="min-w-0 truncate">{item.label}</span>
				</div>
			))}
		</div>
	);
}
