import type {
	TriggerActor,
	TriggerScope,
} from "@superset/shared/automation-triggers";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { LuChevronDown } from "react-icons/lu";

/**
 * The chips a trigger sentence is built from.
 *
 * Same visual language as ScheduleSentence: inline controls that read as part
 * of a sentence rather than a form, so "Draft opened in [repos] by [anyone]"
 * stays legible as one line.
 */

export const CHIP =
	"h-auto w-auto min-w-0 gap-1 rounded-md border-none bg-transparent px-1.5 py-0.5 text-sm font-medium shadow-none hover:bg-accent focus-visible:ring-1";

/** A chip whose value is unset, which blocks saving. */
export const CHIP_EMPTY = "text-muted-foreground ring-1 ring-warning/60";

export function ChipButton({
	label,
	empty,
	disabled,
	className,
}: {
	label: string;
	empty?: boolean;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			disabled={disabled}
			className={cn(CHIP, empty && CHIP_EMPTY, className)}
		>
			{label}
			<LuChevronDown className="size-3 opacity-60" />
		</Button>
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
 * "Any" is its own menu entry rather than the empty state, because an empty
 * selection matches nothing — that asymmetry is what stops a half-built trigger
 * firing on everything, so the UI has to make choosing "any" deliberate.
 */
export function ScopeChip({
	scope,
	onChange,
	options,
	emptyLabel,
	anyLabel,
	disabled,
}: {
	scope: TriggerScope;
	onChange: (next: TriggerScope) => void;
	options: ScopeOption[];
	emptyLabel: string;
	anyLabel: string;
	disabled?: boolean;
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
}: {
	actor: TriggerActor;
	onChange: (next: TriggerActor) => void;
	people: ScopeOption[];
	disabled?: boolean;
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
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
