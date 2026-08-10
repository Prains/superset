"use client";

import type { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { cn } from "@superset/ui/utils";
import type { JSX } from "react";

export type SuggestionListboxProps<TOption extends MenuOption> = {
	options: TOption[];
	selectedIndex: number | null;
	onHighlight: (index: number) => void;
	onSelect: (option: TOption) => void;
	renderRow: (option: TOption) => JSX.Element;
};

export function SuggestionListbox<TOption extends MenuOption>({
	options,
	selectedIndex,
	onHighlight,
	onSelect,
	renderRow,
}: SuggestionListboxProps<TOption>) {
	if (options.length === 0) return null;
	return (
		<div
			role="listbox"
			className="relative z-50 max-h-72 w-full overflow-y-auto rounded-2xl bg-popover/95 p-1.5 shadow-xl ring-1 ring-border backdrop-blur-sm"
		>
			{options.map((option, index) => (
				// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the editor
				// biome-ignore lint/a11y/useFocusableInteractive: focus stays in the editor; listbox is virtual
				<div
					key={option.key}
					role="option"
					aria-selected={index === selectedIndex}
					className={cn(
						"flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-[5px] text-[15px] leading-[21px]",
						index === selectedIndex
							? "bg-accent text-accent-foreground"
							: "text-foreground",
					)}
					onMouseEnter={() => onHighlight(index)}
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => onSelect(option)}
				>
					{renderRow(option)}
				</div>
			))}
		</div>
	);
}
