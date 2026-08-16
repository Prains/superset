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
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useMemo } from "react";
import { LuCirclePlus, LuTriangleAlert } from "react-icons/lu";
import {
	GITHUB_MENU,
	newGithubConfig,
	type ScopeOption,
	TriggerSentence,
} from "../TriggerSentence";

interface TriggersEditorProps {
	triggers: DraftTrigger[];
	onChange: (next: DraftTrigger[]) => void;
	repositories: ScopeOption[];
	people: ScopeOption[];
	readOnly?: boolean;
}

const DEFAULT_SCHEDULE = {
	kind: "schedule" as const,
	rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
	dtstart: new Date().toISOString(),
	timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
};

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
	readOnly,
}: TriggersEditorProps) {
	const problems = useMemo(() => describeTriggerProblems(triggers), [triggers]);
	const banner = summarizeTriggerProblems(problems);
	const hasSchedule = triggers.some((t) => t.config.kind === "schedule");

	const add = (config: DraftTrigger["config"]) =>
		onChange([...triggers, { enabled: true, config }]);

	return (
		<div className="space-y-1">
			<div className="rounded-lg border border-border/60">
				{triggers.map((trigger, index) => (
					<div
						key={trigger.id ?? `draft-${index}`}
						className="border-border/60 border-b px-3 last:border-b-0"
					>
						<TriggerSentence
							trigger={trigger}
							onChange={(next) =>
								onChange(triggers.map((t, i) => (i === index ? next : t)))
							}
							onRemove={() => onChange(triggers.filter((_, i) => i !== index))}
							repositories={repositories}
							people={people}
							disabled={readOnly}
						/>
					</div>
				))}

				<DropdownMenu>
					<DropdownMenuTrigger asChild disabled={readOnly}>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="w-full justify-start gap-2 rounded-none px-3 py-2 text-muted-foreground hover:text-foreground"
						>
							<LuCirclePlus className="size-4" />
							Add Trigger
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-56">
						<DropdownMenuItem
							disabled={hasSchedule}
							onSelect={() => add(DEFAULT_SCHEDULE)}
						>
							Scheduled
							{hasSchedule && (
								<span className="ml-auto text-muted-foreground text-xs">
									already set
								</span>
							)}
						</DropdownMenuItem>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>GitHub</DropdownMenuSubTrigger>
							<DropdownMenuPortal>
								<DropdownMenuSubContent className="max-h-96 overflow-y-auto">
									{GITHUB_MENU.map((entry) =>
										entry.children ? (
											<DropdownMenuSub key={entry.label}>
												<DropdownMenuSubTrigger>
													{entry.label}
												</DropdownMenuSubTrigger>
												<DropdownMenuPortal>
													<DropdownMenuSubContent>
														{entry.children.map((child) => (
															<DropdownMenuItem
																key={child.event}
																onSelect={() =>
																	add(newGithubConfig(child.event))
																}
															>
																{child.label}
															</DropdownMenuItem>
														))}
													</DropdownMenuSubContent>
												</DropdownMenuPortal>
											</DropdownMenuSub>
										) : (
											<DropdownMenuItem
												key={entry.label}
												onSelect={() =>
													entry.event && add(newGithubConfig(entry.event))
												}
											>
												{entry.label}
											</DropdownMenuItem>
										),
									)}
								</DropdownMenuSubContent>
							</DropdownMenuPortal>
						</DropdownMenuSub>
						<DropdownMenuItem onSelect={() => add({ kind: "webhook" })}>
							Webhook Triggered
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{banner && (
				<p className="flex items-center gap-1.5 px-1 text-sm text-warning">
					<LuTriangleAlert className="size-3.5 shrink-0" />
					{banner}
				</p>
			)}
		</div>
	);
}
