"use client";

import { cn } from "@superset/ui/utils";
import type { MentionSection } from "../../hooks/useMentionSources";
import type { ComposerMentionEntry } from "../../types";

export type MentionMenuProps = {
	sections: MentionSection[];
	selectedIndex: number | null;
	onHighlight: (index: number) => void;
	onSelect: (entry: ComposerMentionEntry) => void;
};

export function MentionMenu({
	sections,
	selectedIndex,
	onHighlight,
	onSelect,
}: MentionMenuProps) {
	if (sections.length === 0) return null;
	let flatIndex = -1;
	return (
		<div
			role="listbox"
			className="relative z-50 mb-2 max-h-96 w-full overflow-y-auto rounded-2xl bg-popover/95 p-2 shadow-xl ring-1 ring-border backdrop-blur-sm"
		>
			{sections.map((section) => (
				<div key={section.providerId}>
					<p className="px-2.5 pt-2 pb-1 text-sm text-muted-foreground">
						{section.label}
					</p>
					{section.hint != null && section.entries.length === 0 && (
						<p className="px-2.5 pb-2 text-sm text-muted-foreground/60">
							{section.hint}
						</p>
					)}
					{section.entries.map((entry) => {
						flatIndex += 1;
						const index = flatIndex;
						return (
							// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the editor
							// biome-ignore lint/a11y/useFocusableInteractive: focus stays in the editor; listbox is virtual
							<div
								key={entry.id}
								role="option"
								aria-selected={index === selectedIndex}
								className={cn(
									"flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
									index === selectedIndex
										? "bg-accent text-accent-foreground"
										: "text-foreground",
								)}
								onMouseEnter={() => onHighlight(index)}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => onSelect(entry)}
							>
								{entry.icon && (
									<span className="flex size-4.5 shrink-0 items-center justify-center text-muted-foreground">
										{entry.icon}
									</span>
								)}
								<span className="shrink-0 font-medium">{entry.label}</span>
								{entry.description && (
									<span className="min-w-0 truncate text-muted-foreground">
										{entry.description}
									</span>
								)}
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}
