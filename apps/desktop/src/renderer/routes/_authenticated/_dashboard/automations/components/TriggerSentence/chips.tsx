import type {
	TextFilter,
	TriggerActor,
	TriggerScope,
} from "@superset/shared/automation-triggers";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useState } from "react";
import { LuChevronDown } from "react-icons/lu";

/**
 * The chips a trigger sentence is built from.
 *
 * Filled rather than outlined, and always visible rather than appearing on
 * hover: a trigger reads as a sentence with editable words in it, and an
 * invisible control gives no hint that the word is a choice.
 */

/**
 * 24px tall, 13px text, tighter on the right where the chevron sits.
 *
 * A plain button rather than the shared Button: its size variants set height,
 * padding and font size, and a chip needs all three smaller than any variant
 * offers. Fighting that through class merging is how the first attempt ended up
 * 32px tall with the wrong padding.
 */
export const CHIP =
	"inline-flex h-6 w-auto min-w-0 shrink-0 items-center gap-1 rounded-[6px] bg-foreground/[0.06] py-0 pr-1.5 pl-2 text-[13px] leading-none transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/** Unset reads as dimmer text, not as an error — nothing is wrong yet. */
export const CHIP_EMPTY = "text-muted-foreground";

/**
 * Marks the chips a save is blocked on.
 *
 * There is no Save button — the set saves itself once it is valid — so this is
 * the only thing that says which word is holding it back. A sentence can have
 * three chips where only one is empty, and the banner names the problem without
 * pointing at it.
 */
export const CHIP_INVALID =
	"ring-1 ring-amber-500/50 text-amber-600 dark:text-amber-400";

export function ChipButton({
	label,
	icon,
	empty,
	disabled,
	className,
}: {
	label: string;
	icon?: ReactNode;
	empty?: boolean;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			className={cn(CHIP, empty && CHIP_EMPTY, className)}
		>
			{icon}
			<span className="truncate">{label}</span>
			<LuChevronDown className="size-3 shrink-0 opacity-50" />
		</button>
	);
}

/**
 * One choice from a short, known list.
 *
 * A dropdown rather than a Select: Select's trigger carries its own height,
 * padding and font size that a chip has to fight, and the sentence already
 * speaks in dropdowns everywhere else.
 */
export function SelectChip({
	value,
	onChange,
	options,
	disabled,
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	options: readonly { value: string; label: string }[];
	disabled?: boolean;
	className?: string;
}) {
	const current = options.find((o) => o.value === value);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<span>
					<ChipButton
						label={current?.label ?? value}
						disabled={disabled}
						className={className}
					/>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				<DropdownMenuRadioGroup value={value} onValueChange={onChange}>
					{options.map((option) => (
						<DropdownMenuRadioItem key={option.value} value={option.value}>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * A free-text filter over a message body.
 *
 * The field lives in a popover rather than inline in the row: an input wide
 * enough to type in is several chips wide, and it breaks the line the sentence
 * is trying to read as. The chip shows the pattern once there is one.
 *
 * No regex toggle — `isRegex` is pinned false in the schema, since the pattern
 * is evaluated on the webhook path and a backtracking pattern never returns.
 */
export function TextFilterChip({
	value,
	onChange,
	emptyLabel,
	placeholder,
	disabled,
}: {
	value: TextFilter | null;
	onChange: (next: TextFilter | null) => void;
	emptyLabel: string;
	placeholder: string;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
			<PopoverTrigger asChild>
				<span>
					<ChipButton
						label={value?.pattern || emptyLabel}
						empty={!value?.pattern}
						disabled={disabled}
						className="max-w-52"
					/>
				</span>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-2">
				<Input
					autoFocus
					value={value?.pattern ?? ""}
					placeholder={placeholder}
					disabled={disabled}
					onChange={(event) =>
						onChange(
							event.target.value
								? { pattern: event.target.value, isRegex: false }
								: null,
						)
					}
					onKeyDown={(event) => {
						if (event.key === "Enter") setOpen(false);
					}}
					className="h-8 text-[13px]"
				/>
			</PopoverContent>
		</Popover>
	);
}

export type ScopeOption = { id: string; label: string };

function scopeLabel(
	scope: TriggerScope,
	options: ScopeOption[],
	emptyLabel: string,
	anyLabel: string,
): string {
	if (scope === null) return emptyLabel;
	if (scope.mode === "any") return anyLabel;
	if (scope.ids.length === 0) return emptyLabel;
	if (scope.ids.length === 1) {
		const match = options.find((o) => o.id === scope.ids[0]);
		return match?.label ?? scope.ids[0] ?? emptyLabel;
	}
	return `${scope.ids.length} selected`;
}

/**
 * Multi-select over a known set, plus an explicit "any".
 *
 * "Any" is its own entry rather than the empty state, because an empty
 * selection matches nothing — that asymmetry is what stops a half-built trigger
 * firing on everything, so choosing "any" has to be deliberate.
 */
export function ScopeChip({
	scope,
	onChange,
	options,
	emptyLabel,
	anyLabel,
	disabled,
	className,
}: {
	scope: TriggerScope;
	onChange: (next: TriggerScope) => void;
	options: ScopeOption[];
	emptyLabel: string;
	anyLabel: string;
	disabled?: boolean;
	className?: string;
}) {
	const selected = scope !== null && scope.mode === "list" ? scope.ids : [];
	const isAny = scope !== null && scope.mode === "any";
	const empty = scope === null || (scope.mode === "list" && !scope.ids.length);

	const toggle = (id: string) => {
		const next = selected.includes(id)
			? selected.filter((s) => s !== id)
			: [...selected, id];
		onChange(next.length ? { mode: "list", ids: next } : null);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<span>
					<ChipButton
						label={scopeLabel(scope, options, emptyLabel, anyLabel)}
						empty={empty}
						disabled={disabled}
						className={className}
					/>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				<DropdownMenuCheckboxItem
					checked={isAny}
					onCheckedChange={() => onChange(isAny ? null : { mode: "any" })}
				>
					{anyLabel}
				</DropdownMenuCheckboxItem>
				{options.map((option) => (
					<DropdownMenuCheckboxItem
						key={option.id}
						checked={selected.includes(option.id)}
						onCheckedChange={() => toggle(option.id)}
					>
						{option.label}
					</DropdownMenuCheckboxItem>
				))}
				{options.length === 0 && (
					<DropdownMenuItem disabled>Nothing to choose yet</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function actorLabel(actor: TriggerActor, people: ScopeOption[]): string {
	if (actor === "anyone") return "Anyone";
	if (actor === "me") return "Me";
	if (actor.ids.length === 0) return "Select people";
	if (actor.ids.length === 1) {
		const match = people.find((p) => p.id === actor.ids[0]);
		return match?.label ?? actor.ids[0] ?? "Select people";
	}
	return `${actor.ids.length} people`;
}

export function ActorChip({
	actor,
	onChange,
	people,
	disabled,
	className,
}: {
	actor: TriggerActor;
	onChange: (next: TriggerActor) => void;
	people: ScopeOption[];
	disabled?: boolean;
	className?: string;
}) {
	const ids = typeof actor === "string" ? [] : actor.ids;
	const empty = typeof actor !== "string" && ids.length === 0;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<span>
					<ChipButton
						label={actorLabel(actor, people)}
						empty={empty}
						disabled={disabled}
						className={className}
					/>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				<DropdownMenuCheckboxItem
					checked={actor === "anyone"}
					onCheckedChange={() => onChange("anyone")}
				>
					Anyone
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={actor === "me"}
					onCheckedChange={() => onChange("me")}
				>
					Me
				</DropdownMenuCheckboxItem>
				{people.map((person) => (
					<DropdownMenuCheckboxItem
						key={person.id}
						checked={ids.includes(person.id)}
						onCheckedChange={() => {
							const next = ids.includes(person.id)
								? ids.filter((p) => p !== person.id)
								: [...ids, person.id];
							onChange(next.length ? { ids: next } : "anyone");
						}}
					>
						{person.label}
					</DropdownMenuCheckboxItem>
				))}
				{people.length === 0 && (
					<DropdownMenuItem disabled>No linked accounts yet</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
