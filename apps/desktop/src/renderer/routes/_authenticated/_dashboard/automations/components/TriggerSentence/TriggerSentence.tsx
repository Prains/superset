import type { DraftTrigger } from "@superset/shared/automation-triggers";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { LuGithub, LuTrash2, LuWebhook } from "react-icons/lu";
import { ScheduleSentence } from "../ScheduleSentence";
import { ActorChip, ScopeChip, type ScopeOption } from "./chips";
import { GITHUB_SENTENCES, type SentencePart } from "./sentence";

interface TriggerSentenceProps {
	trigger: DraftTrigger;
	onChange: (next: DraftTrigger) => void;
	onRemove: () => void;
	repositories: ScopeOption[];
	people: ScopeOption[];
	disabled?: boolean;
}

/**
 * One trigger, rendered as a sentence.
 *
 * The grammar lives in `sentence.ts` so each event describes its own slots;
 * this only walks the parts and renders the matching control.
 */
export function TriggerSentence({
	trigger,
	onChange,
	onRemove,
	repositories,
	people,
	disabled,
}: TriggerSentenceProps) {
	const config = trigger.config;
	const set = (patch: Record<string, unknown>) =>
		onChange({ ...trigger, config: { ...config, ...patch } as never });

	const renderPart = (part: SentencePart, index: number) => {
		if ("text" in part) {
			return (
				<span key={index} className="text-muted-foreground text-sm">
					{part.text}
				</span>
			);
		}
		// The slot list is derived from this event, so the fields it names are
		const c = config as unknown as Record<string, never>;
		switch (part.slot) {
			case "repositories":
				return (
					<ScopeChip
						key={index}
						scope={c.repositories}
						onChange={(v) => set({ repositories: v })}
						options={repositories}
						emptyLabel="Select repos"
						anyLabel="Any repo"
						disabled={disabled}
					/>
				);
			case "branches":
				return (
					<ScopeChip
						key={index}
						scope={c.branches}
						onChange={(v) => set({ branches: v })}
						options={[]}
						emptyLabel="Any branch"
						anyLabel="Any branch"
						disabled={disabled}
					/>
				);
			case "labels":
				return (
					<ScopeChip
						key={index}
						scope={c.labels}
						onChange={(v) => set({ labels: v })}
						options={[]}
						emptyLabel="Any label"
						anyLabel="Any label"
						disabled={disabled}
					/>
				);
			case "actor":
				return (
					<ActorChip
						key={index}
						actor={c.actor}
						onChange={(v) => set({ actor: v })}
						people={people}
						disabled={disabled}
					/>
				);
			case "subjectAuthor":
				return (
					<ActorChip
						key={index}
						actor={c.subjectAuthor}
						onChange={(v) => set({ subjectAuthor: v })}
						people={people}
						disabled={disabled}
					/>
				);
			case "commentFilter": {
				const filter = c.commentFilter as {
					pattern: string;
					isRegex: false;
				} | null;
				return (
					<Input
						key={index}
						value={filter?.pattern ?? ""}
						placeholder="Any comment"
						disabled={disabled}
						onChange={(e) =>
							set({
								commentFilter: e.target.value
									? { pattern: e.target.value, isRegex: false }
									: null,
							})
						}
						className="h-7 w-40 px-1.5 text-sm"
					/>
				);
			}
		}
	};

	return (
		<div className="flex flex-wrap items-center gap-1.5 py-1.5">
			{config.kind === "github" && (
				<LuGithub className="size-4 shrink-0 text-muted-foreground" />
			)}
			{config.kind === "webhook" && (
				<LuWebhook className="size-4 shrink-0 text-muted-foreground" />
			)}

			{config.kind === "github" &&
				GITHUB_SENTENCES[config.event].map(renderPart)}

			{config.kind === "schedule" && (
				<ScheduleSentence
					rrule={config.rrule}
					onRruleChange={(rrule) => set({ rrule })}
					timezone={config.timezone}
					onTimezoneChange={(timezone) => set({ timezone })}
					disabled={disabled}
				/>
			)}

			{config.kind === "webhook" && (
				<span className="text-muted-foreground text-sm">
					Triggered by an incoming webhook
				</span>
			)}

			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label="Remove trigger"
				disabled={disabled}
				onClick={onRemove}
				className="ml-auto size-7 text-muted-foreground hover:text-foreground"
			>
				<LuTrash2 className="size-3.5" />
			</Button>
		</div>
	);
}
