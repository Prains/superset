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
	query: string;
};

export type ComposerPanelContent = {
	title: string;
	render: () => ReactNode;
};

export type ComposerMentionEntry = {
	id: string;
	label: string;
	description?: string;
	icon?: ReactNode;
	keywords?: string[];
	// When set, selecting rewrites the query to this value and keeps the menu
	// open (directory drilling); select() is not called.
	completionQuery?: string;
	select(ctx: ComposerActionContext): void | Promise<void>;
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
			emptyState: string;
			loadingState?: string;
	  };

export type ComposerMentionProvider = {
	id: string;
	title: string;
	priority: number;
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
	placement?: "top" | "bottom";
	toolbar?: ReactNode;
	onSubmit?: (payload: LexicalComposerSubmitPayload) => void;
	onStop?: () => void;
	onMentionHighlight?: (entry: ComposerMentionEntry | null) => void;
	className?: string;
};
