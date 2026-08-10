export type TiptapComposerMentionItem = {
	id: string;
	label: string;
	brandColor?: string;
};

export type TiptapComposerCommand = {
	id: string;
	label: string;
	description?: string;
};

export type TiptapComposerAttachment = {
	id: string;
	file: File;
};

export type TiptapComposerSubmitPayload = {
	text: string;
	files: File[];
};

export type TiptapComposerProps = {
	placeholder?: string;
	mentionItems: TiptapComposerMentionItem[];
	commands: TiptapComposerCommand[];
	status?: "ready" | "streaming";
	onSubmit?: (payload: TiptapComposerSubmitPayload) => void;
	onStop?: () => void;
	className?: string;
};
