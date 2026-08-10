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
	return (
		<div
			role="listbox"
			className="max-h-72 w-80 overflow-y-auto rounded-xl bg-popover/95 p-1 shadow-xl ring-1 ring-border backdrop-blur-sm"
		>
			{options.map((option, index) => (
				// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the editor
				// biome-ignore lint/a11y/useFocusableInteractive: focus stays in the editor; listbox is virtual
				<div
					key={option.key}
					role="option"
					aria-selected={index === selectedIndex}
					className={cn(
						"flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm",
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
