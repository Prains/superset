import { FaSlack } from "react-icons/fa";
import { ActorChip } from "../../TriggerSentence/components/ActorChip";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { TextFilterChip } from "../../TriggerSentence/components/TextFilterChip";
import type { SentenceContext, TriggerProvider } from "../types";
import { SLACK_REACTION_OPTIONS } from "./emoji";
import {
	type SentencePart,
	SLACK_MENU,
	SLACK_SENTENCES,
	type SlackConfig,
} from "./grammar";

/**
 * Renders one slot of a Slack sentence. Each slot names the config field it
 * edits, so `set` patches by that name and `mark` finds it in the problems.
 */
function renderPart(
	config: SlackConfig,
	part: SentencePart,
	index: number,
	{ set, mark, options, disabled }: SentenceContext,
) {
	if ("text" in part) {
		return (
			<span key={index} className="text-[13px] text-muted-foreground">
				{part.text}
			</span>
		);
	}
	switch (part.slot) {
		case "channels":
			return (
				<ScopeChip
					key={index}
					scope={config.channels}
					onChange={(v) => set({ channels: v })}
					className={mark("channels")}
					options={options.slack?.channels ?? []}
					emptyLabel="Select channels"
					anyLabel="Any channel"
					disabled={disabled}
				/>
			);
		case "emoji":
			return (
				<ScopeChip
					key={index}
					scope={config.emoji}
					// Clearing an optional filter means "any", not "none": the chip
					// says "Any reaction" either way, and null would make that a lie.
					onChange={(v) => set({ emoji: v ?? { mode: "any" } })}
					className={mark("emoji")}
					options={SLACK_REACTION_OPTIONS}
					emptyLabel="Any reaction"
					anyLabel="Any reaction"
					disabled={disabled}
				/>
			);
		case "actor":
			return (
				<ActorChip
					key={index}
					actor={config.actor}
					onChange={(v) => set({ actor: v })}
					className={mark("actor")}
					people={options.slack?.people ?? []}
					disabled={disabled}
				/>
			);
		case "messageFilter": {
			// The same field filters a message's text or a new channel's name;
			// only the words around it change.
			const isChannelName = config.event === "channel_created";
			return (
				<TextFilterChip
					key={index}
					value={config.messageFilter}
					onChange={(v) => set({ messageFilter: v })}
					emptyLabel={isChannelName ? "Any name" : "Any message"}
					placeholder={
						isChannelName
							? "Name contains this text..."
							: "Contains this text..."
					}
					disabled={disabled}
				/>
			);
		}
	}
}

export const slackProvider: TriggerProvider<SlackConfig> = {
	kind: "slack",
	label: "Slack",
	icon: FaSlack,
	menu: SLACK_MENU,
	renderSentence: (config, ctx) => {
		// The event comes from a persisted config. If its grammar entry is ever
		// removed or renamed, the row must still render rather than take the
		// editor down, so an unknown event reads as its raw name.
		const parts = SLACK_SENTENCES[config.event];
		if (!parts) {
			return (
				<span className="text-[13px] text-muted-foreground">
					{config.event}
				</span>
			);
		}
		return parts.map((part, index) => renderPart(config, part, index, ctx));
	},
};
