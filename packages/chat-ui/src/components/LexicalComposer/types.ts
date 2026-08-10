import type { ReactNode } from "react";

export type ComposerChip = {
	label: string;
	serialized: string;
	brandColor?: string;
	data?: unknown;
};

export type ComposerActionContext = {
	insertChip(chip: ComposerChip): void;
	attachFiles(): void;
	openPanel(panel: ComposerPanelContent): void;
	closeMenu(): void;
	query: string;
};

export type ComposerPanelContent = {
	title: string;
	render: () => ReactNode;
};

export type ComposerMentionAction =
	| { type: "insert-chip"; chip: ComposerChip }
	| { type: "run"; run: (ctx: ComposerActionContext) => void | Promise<void> };

export type ComposerMentionEntry = {
	id: string;
	label: string;
	description?: string;
	icon?: ReactNode;
	keywords?: string[];
	action: ComposerMentionAction;
};

export type ComposerMentionSource =
	| {
			kind: "static";
			load(
				signal: AbortSignal,
			): ComposerMentionEntry[] | Promise<ComposerMentionEntry[]>;
	  }
	| {
			kind: "search";
			search(
				query: string,
				signal: AbortSignal,
			): Promise<ComposerMentionEntry[]>;
			hint: string;
	  };

export type ComposerMentionProvider = {
	id: string;
	section: { label: string; priority: number };
	source: ComposerMentionSource;
};

export type LexicalComposerCommand = {
	id: string;
	label: string;
	description?: string;
};

export type LexicalComposerAttachment = {
	id: string;
	file: File;
};

export type LexicalComposerSubmitPayload = {
	text: string;
	files: File[];
	mentions: ComposerChip[];
};

export type LexicalComposerProps = {
	placeholder?: string;
	mentionProviders: ComposerMentionProvider[];
	commands: LexicalComposerCommand[];
	status?: "ready" | "streaming";
	onSubmit?: (payload: LexicalComposerSubmitPayload) => void;
	onStop?: () => void;
	className?: string;
};
