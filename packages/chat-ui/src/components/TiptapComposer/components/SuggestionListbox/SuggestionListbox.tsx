"use client";

import { cn } from "@superset/ui/utils";
import { FileCode2Icon, SlashSquareIcon } from "lucide-react";
import type {
	TiptapComposerCommand,
	TiptapComposerMentionItem,
} from "../../types";

export type SuggestionListboxProps = {
	kind: "mention" | "command";
	items: Array<TiptapComposerMentionItem | TiptapComposerCommand>;
	activeIndex: number;
	onHighlight: (index: number) => void;
	onSelect: (item: TiptapComposerMentionItem | TiptapComposerCommand) => void;
};

export function SuggestionListbox({
	kind,
	items,
	activeIndex,
	onHighlight,
	onSelect,
}: SuggestionListboxProps) {
	if (items.length === 0) return null;
	return (
		<div
			role="listbox"
			className="max-h-72 w-80 overflow-y-auto rounded-xl bg-popover/95 p-1 shadow-xl ring-1 ring-border backdrop-blur-sm"
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
					{kind === "mention" ? (
						<FileCode2Icon className="size-4 shrink-0 text-muted-foreground" />
					) : (
						<SlashSquareIcon className="size-4 shrink-0 text-muted-foreground" />
					)}
					<span className="min-w-0 truncate">
						{kind === "command" ? `/${item.label}` : item.label}
					</span>
					{"description" in item && item.description && (
						<span className="ml-auto min-w-0 shrink-[2] truncate text-xs text-muted-foreground">
							{item.description}
						</span>
					)}
				</div>
			))}
		</div>
	);
}
