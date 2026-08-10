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
	ComposerMentionAction,
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
	onSubmit,
	onStop,
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
					onSubmit={onSubmit}
					onStop={onStop}
				/>
			</LexicalComposerProvider>
		</div>
	);
}
