export type LexicalComposerMentionItem = {
	id: string;
	label: string;
	brandColor?: string;
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
};

export type LexicalComposerProps = {
	placeholder?: string;
	mentionItems: LexicalComposerMentionItem[];
	commands: LexicalComposerCommand[];
	status?: "ready" | "streaming";
	onSubmit?: (payload: LexicalComposerSubmitPayload) => void;
	onStop?: () => void;
	className?: string;
};
