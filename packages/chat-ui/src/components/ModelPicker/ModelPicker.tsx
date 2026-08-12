"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import {
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	SearchIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

export type ModelPickerModel = {
	id: string;
	name: string;
	legacy?: boolean;
};

export type ModelPickerHarness = {
	id: string;
	name: string;
	iconUrl: string;
	models: ModelPickerModel[];
	// Reason the harness can't serve models right now (signed out, missing
	// CLI); shown in place of its model list and excluded from search.
	unavailable?: string;
};

export type ModelPickerValue = {
	harnessId: string;
	modelId: string;
};

export type ModelPickerProps = {
	harnesses: ModelPickerHarness[];
	value: ModelPickerValue;
	onSelect: (value: ModelPickerValue) => void;
	className?: string;
};

type ModelRow = {
	harness: ModelPickerHarness;
	model: ModelPickerModel;
};

export function ModelPicker({
	harnesses,
	value,
	onSelect,
	className,
}: ModelPickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [tabId, setTabId] = useState(value.harnessId);
	const [legacyExpanded, setLegacyExpanded] = useState(false);
	const [highlightIndex, setHighlightIndex] = useState(0);

	const selectedHarness = harnesses.find(
		(harness) => harness.id === value.harnessId,
	);
	const selectedModel = selectedHarness?.models.find(
		(model) => model.id === value.modelId,
	);
	const activeTab =
		harnesses.find((harness) => harness.id === tabId) ?? harnesses[0];

	const trimmed = query.trim().toLowerCase();
	// Searching escapes the active tab and matches across every harness.
	const rows = useMemo<ModelRow[]>(() => {
		if (trimmed.length > 0) {
			return harnesses
				.filter((harness) => !harness.unavailable)
				.flatMap((harness) =>
					harness.models
						.filter(
							(model) =>
								model.name.toLowerCase().includes(trimmed) ||
								harness.name.toLowerCase().includes(trimmed),
						)
						.map((model) => ({ harness, model })),
				);
		}
		if (!activeTab || activeTab.unavailable) return [];
		return activeTab.models
			.filter((model) => !model.legacy || legacyExpanded)
			.map((model) => ({ harness: activeTab, model }));
	}, [harnesses, activeTab, trimmed, legacyExpanded]);

	const legacyCount =
		trimmed.length === 0 && !activeTab?.unavailable
			? (activeTab?.models.filter((model) => model.legacy).length ?? 0)
			: 0;

	const reset = () => {
		setQuery("");
		setLegacyExpanded(false);
		setHighlightIndex(0);
	};

	const selectRow = (row: ModelRow) => {
		onSelect({ harnessId: row.harness.id, modelId: row.model.id });
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) {
					setTabId(value.harnessId);
					reset();
				}
			}}
		>
			<PopoverTrigger
				className={cn(
					"flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
					className,
				)}
			>
				{selectedHarness && (
					<img
						src={selectedHarness.iconUrl}
						alt=""
						className="size-4 rounded-[4px]"
					/>
				)}
				{selectedModel?.name ?? "Model"}
				<ChevronDownIcon className="size-3.5" />
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="top"
				sideOffset={8}
				className="w-72 rounded-2xl border-0 bg-popover/95 p-1.5 shadow-xl ring-1 ring-border backdrop-blur-sm"
			>
				<div className="flex gap-1 p-1">
					{harnesses.map((harness) => (
						<button
							key={harness.id}
							type="button"
							title={harness.unavailable}
							className={cn(
								"flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
								harness.id === activeTab?.id && trimmed.length === 0
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
							onClick={() => {
								setTabId(harness.id);
								reset();
							}}
						>
							<img
								src={harness.iconUrl}
								alt=""
								className="size-4 rounded-[4px]"
							/>
							{harness.name}
						</button>
					))}
				</div>
				<div className="flex items-center gap-2 border-border/60 border-b px-3 py-2">
					<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
					<input
						ref={(element) => element?.focus()}
						value={query}
						placeholder="Search models…"
						className="w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
						onChange={(event) => {
							setQuery(event.target.value);
							setHighlightIndex(0);
						}}
						onKeyDown={(event) => {
							if (event.key === "ArrowDown" || event.key === "ArrowUp") {
								event.preventDefault();
								const delta = event.key === "ArrowDown" ? 1 : -1;
								setHighlightIndex((previous) => {
									const count = rows.length;
									return count === 0 ? 0 : (previous + delta + count) % count;
								});
							}
							if (event.key === "Enter") {
								event.preventDefault();
								const row = rows[highlightIndex];
								if (row) selectRow(row);
							}
						}}
					/>
				</div>
				<div className="scroll-fade max-h-72 overflow-y-auto pt-1">
					{trimmed.length === 0 && activeTab?.unavailable ? (
						<div className="px-3 py-4">
							<p className="text-[15px] text-foreground">
								{activeTab.name} is unavailable
							</p>
							<p className="pt-0.5 text-[15px] text-muted-foreground">
								{activeTab.unavailable}
							</p>
						</div>
					) : rows.length === 0 ? (
						<p className="px-3 py-2 text-[15px] text-muted-foreground/60">
							No models found
						</p>
					) : null}
					{rows.map((row, index) => {
						const isSelected =
							row.harness.id === value.harnessId &&
							row.model.id === value.modelId;
						return (
							// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the search input
							// biome-ignore lint/a11y/useFocusableInteractive: focus stays in the search input; listbox is virtual
							<div
								key={`${row.harness.id}:${row.model.id}`}
								role="option"
								aria-selected={isSelected}
								className={cn(
									"flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-[5px] text-[15px] leading-[21px]",
									index === highlightIndex
										? "bg-accent text-accent-foreground"
										: "text-foreground",
								)}
								onMouseEnter={() => setHighlightIndex(index)}
								onClick={() => selectRow(row)}
							>
								<span className="min-w-0 truncate font-medium">
									{row.model.name}
								</span>
								{trimmed.length > 0 && (
									<span className="ml-auto flex shrink-0 items-center gap-1.5 text-muted-foreground">
										<img
											src={row.harness.iconUrl}
											alt=""
											className="size-3.5 rounded-[3px]"
										/>
										{row.harness.name}
									</span>
								)}
								{isSelected && (
									<CheckIcon
										className={cn(
											"size-4 shrink-0",
											trimmed.length === 0 && "ml-auto",
										)}
									/>
								)}
							</div>
						);
					})}
					{legacyCount > 0 && !legacyExpanded && (
						// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the search input
						// biome-ignore lint/a11y/useFocusableInteractive: focus stays in the search input; listbox is virtual
						<div
							role="option"
							aria-selected={false}
							className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-[5px] text-[15px] leading-[21px] text-muted-foreground"
							onClick={() => setLegacyExpanded(true)}
						>
							<span className="min-w-0 truncate">Legacy models</span>
							<span className="ml-auto flex shrink-0 items-center gap-0.5">
								{legacyCount}
								<ChevronRightIcon className="size-4" />
							</span>
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
