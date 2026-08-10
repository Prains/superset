"use client";

import {
	type InitialConfigType,
	LexicalComposer as LexicalComposerProvider,
} from "@lexical/react/LexicalComposer";
import { useState } from "react";
import { ComposerBody } from "./components/ComposerBody";
import { MentionChipNode } from "./nodes/mentionChipNode";
import type { LexicalComposerProps } from "./types";
import "./lexical-composer.css";

export type {
	ComposerActionContext,
	ComposerChip,
	ComposerMentionEntry,
	ComposerMentionProvider,
	ComposerMentionSource,
	ComposerPanelContent,
	LexicalComposerAttachment,
	LexicalComposerCommand,
	LexicalComposerProps,
	LexicalComposerSubmitPayload,
} from "./types";

export function LexicalComposer({
	placeholder = "Do anything",
	mentionProviders,
	commands,
	status = "ready",
	placement = "top",
	toolbar,
	onSubmit,
	onStop,
	onMentionHighlight,
	className,
}: LexicalComposerProps) {
	const [initialConfig] = useState<InitialConfigType>(() => ({
		namespace: "lexical-chat-composer",
		nodes: [MentionChipNode],
		onError: (error: Error) => {
			throw error;
		},
	}));

	return (
		<div className={className}>
			<LexicalComposerProvider initialConfig={initialConfig}>
				<ComposerBody
					placeholder={placeholder}
					mentionProviders={mentionProviders}
					commands={commands}
					status={status}
					placement={placement}
					toolbar={toolbar}
					onSubmit={onSubmit}
					onStop={onStop}
					onMentionHighlight={onMentionHighlight}
				/>
			</LexicalComposerProvider>
		</div>
	);
}
