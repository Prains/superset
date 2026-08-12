"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

export type ToolbarSelectOption = {
	id: string;
	label: string;
	description?: string;
};

export type ToolbarSelectProps = {
	options: ToolbarSelectOption[];
	value: string;
	onSelect: (id: string) => void;
	icon?: ReactNode;
	className?: string;
};

// Small labeled dropdown for composer toolbar settings (effort, access, …).
export function ToolbarSelect({
	options,
	value,
	onSelect,
	icon,
	className,
}: ToolbarSelectProps) {
	const [open, setOpen] = useState(false);
	const selected = options.find((option) => option.id === value);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				className={cn(
					"flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
					className,
				)}
			>
				{icon}
				{selected?.label}
				<ChevronDownIcon className="size-3.5" />
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="top"
				sideOffset={8}
				className="w-52 rounded-2xl border-0 bg-popover/95 p-1.5 shadow-xl ring-1 ring-border backdrop-blur-sm"
			>
				{options.map((option) => (
					<button
						key={option.id}
						type="button"
						className={cn(
							"flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-[5px] text-left text-[15px] leading-[21px] text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
						)}
						onClick={() => {
							onSelect(option.id);
							setOpen(false);
						}}
					>
						<span className="min-w-0 truncate font-medium">{option.label}</span>
						{option.description && (
							<span className="min-w-0 truncate text-muted-foreground">
								{option.description}
							</span>
						)}
						{option.id === value && (
							<CheckIcon className="ml-auto size-4 shrink-0" />
						)}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}
