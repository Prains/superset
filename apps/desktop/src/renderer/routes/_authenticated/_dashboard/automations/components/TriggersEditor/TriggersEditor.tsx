import {
	type DraftTrigger,
	describeTriggerProblems,
	summarizeTriggerProblems,
} from "@superset/shared/automation-triggers";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Separator } from "@superset/ui/separator";
import { type ReactNode, useMemo, useState } from "react";
import { LuCirclePlus, LuTriangleAlert } from "react-icons/lu";
import { type ScopeOption, TriggerSentence } from "../TriggerSentence";
import { TriggerMenuItems } from "./TriggerMenuItems";
import { flattenTriggerMenu, matchesQuery, TRIGGER_MENU } from "./triggerMenu";

interface TriggersEditorProps {
	triggers: DraftTrigger[];
	onChange: (next: DraftTrigger[]) => void;
	repositories: ScopeOption[];
	people: ScopeOption[];
	/** Trailing "Next run ..." text, rendered on the schedule row. */
	nextRun?: ReactNode;
	readOnly?: boolean;
}

/**
 * The trigger list for an automation.
 *
 * Holds drafts, not saved rows: a trigger can sit here half-configured while
 * someone is still choosing repositories, and the problems it reports are the
 * same ones the API would reject it with — the checks come from
 * `@superset/shared` rather than being restated here.
 */
export function TriggersEditor({
	triggers,
	onChange,
	repositories,
	people,
	nextRun,
	readOnly,
}: TriggersEditorProps) {
	// Local, because a trigger is invalid the moment it is added — "Comment
	// added" with no repository chosen yet — and the API rejects the whole set.
	// Sending every keystroke upstream meant a new row was saved, refused, and
	// dropped on the next render, so it could never be filled in at all.
	const [drafts, setDrafts] = useState(triggers);
	const savedKey = JSON.stringify(triggers);
	const [prevSavedKey, setPrevSavedKey] = useState(savedKey);
	if (savedKey !== prevSavedKey) {
		setPrevSavedKey(savedKey);
		// Adopt what was saved — it carries the ids the server assigned — unless
		// there is unsaved work here, which by definition was never sent.
		if (describeTriggerProblems(drafts).length === 0) setDrafts(triggers);
	}

	const problems = useMemo(() => describeTriggerProblems(drafts), [drafts]);
	const banner = summarizeTriggerProblems(problems);
	const [query, setQuery] = useState("");
	const leaves = useMemo(() => flattenTriggerMenu(), []);
	const results = query
		? leaves.filter((leaf) => matchesQuery(leaf, query))
		: [];

	/** Saves only a set the API would accept; anything else stays a draft. */
	const apply = (next: DraftTrigger[]) => {
		setDrafts(next);
		if (describeTriggerProblems(next).length === 0) onChange(next);
	};

	const add = (config: DraftTrigger["config"]) =>
		apply([...drafts, { enabled: true, config }]);

	return (
		<div className="flex flex-col gap-1">
			{/* A filled surface, not an outlined box: the rows are the structure, and
			    a border around them competes with the card they already sit in. */}
			<div className="rounded-[12px] bg-foreground/[0.04] p-1">
				{drafts.map((trigger, index) => (
					<TriggerSentence
						key={trigger.id ?? `draft-${index}`}
						trigger={trigger}
						onChange={(next) =>
							apply(drafts.map((t, i) => (i === index ? next : t)))
						}
						onRemove={() => apply(drafts.filter((_, i) => i !== index))}
						repositories={repositories}
						people={people}
						problems={problems.filter((p) => p.index === index)}
						nextRun={trigger.config.kind === "schedule" ? nextRun : undefined}
						disabled={readOnly}
					/>
				))}

				{/* Separates the rows from the action, inset so it reads as a rule
				    inside the surface rather than a division of the card. */}
				{drafts.length > 0 && (
					<Separator className="mx-2 bg-border/60 data-[orientation=horizontal]:w-auto" />
				)}

				<DropdownMenu onOpenChange={() => setQuery("")}>
					<DropdownMenuTrigger asChild disabled={readOnly}>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-10 w-full justify-start gap-2 rounded-[8px] px-2 font-normal text-[13px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
						>
							<LuCirclePlus className="size-4" />
							Add Trigger
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-70">
						{/* Radix runs a typeahead on printable keys and would swallow what
					    is being typed here; Escape and the arrows still need to reach
					    the menu, so only the characters are stopped. */}
						<Input
							autoFocus
							value={query}
							placeholder="Search triggers..."
							onChange={(event) => setQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key.length === 1 || event.key === "Backspace") {
									event.stopPropagation();
								}
							}}
							className="mb-1 h-8 border-none bg-transparent px-2 text-[13px] shadow-none focus-visible:ring-0 dark:bg-transparent"
						/>

						{query ? (
							<>
								{results.map((leaf) => {
									const Icon = leaf.icon;
									return (
										<DropdownMenuItem
											key={leaf.path.join(">")}
											onSelect={() => add(leaf.config())}
										>
											{Icon && <Icon className="size-3.5 shrink-0 opacity-60" />}
											{/* The trail disambiguates "Approved" from the other three
											    review outcomes, but it is the trail that gives way when
											    the row is too narrow — truncating the leaf would hide
											    the word that was searched for. */}
											{leaf.path.length > 1 && (
												<span className="truncate text-muted-foreground">
													{`${leaf.path.slice(0, -1).join(" › ")} › `}
												</span>
											)}
											<span className="shrink-0">{leaf.path.at(-1)}</span>
										</DropdownMenuItem>
									);
								})}
								{results.length === 0 && (
									<DropdownMenuItem disabled>
										No matching trigger
									</DropdownMenuItem>
								)}
							</>
						) : (
							<TriggerMenuItems entries={TRIGGER_MENU} onPick={add} />
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Below the surface, not inside it — this is commentary on the set,
			    not another row of it. */}
			{banner && (
				<p className="flex items-center gap-1.5 px-2 pt-1 text-[13px] text-amber-600 dark:text-amber-400">
					<LuTriangleAlert className="size-3.5 shrink-0" />
					{banner}
				</p>
			)}
		</div>
	);
}
