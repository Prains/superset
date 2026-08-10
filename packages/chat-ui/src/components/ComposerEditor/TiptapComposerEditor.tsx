"use client";

import { cn } from "@superset/ui/utils";
import type { Range } from "@tiptap/core";
import { mergeAttributes, Node } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import History from "@tiptap/extension-history";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import { PluginKey } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { useRef, useState } from "react";
import {
	type ComposerChipKind,
	type ComposerMentionItem,
	filterMentionItems,
	serializeChip,
} from "./composerLogic";
import { SuggestionPopover } from "./SuggestionPopover";
import "./composer-chip.css";

export type ComposerEditorProps = {
	placeholder?: string;
	mentionItems: ComposerMentionItem[];
	onSubmit?: (text: string) => void;
	onTextChange?: (text: string) => void;
	className?: string;
};

const ComposerChip = Node.create({
	name: "composerChip",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	addAttributes() {
		return {
			label: { default: "" },
			kind: { default: "file" },
			brandColor: { default: null },
		};
	},
	parseHTML() {
		return [{ tag: "span[data-composer-chip]" }];
	},
	renderHTML({ node }) {
		return [
			"span",
			mergeAttributes({
				"data-composer-chip": node.attrs.kind,
				class: "chat-composer-chip",
				style: node.attrs.brandColor
					? `--chip-color:${node.attrs.brandColor}`
					: undefined,
			}),
			node.attrs.label,
		];
	},
	renderText({ node }) {
		return serializeChip(node.attrs.kind, node.attrs.label);
	},
});

type SuggestionState = {
	kind: ComposerChipKind;
	items: ComposerMentionItem[];
	range: Range;
};

export function TiptapComposerEditor({
	placeholder = "Do anything",
	mentionItems,
	onSubmit,
	onTextChange,
	className,
}: ComposerEditorProps) {
	const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
	const [activeIndex, setActiveIndex] = useState(0);
	const stateRef = useRef({ suggestion, activeIndex, mentionItems, onSubmit });
	stateRef.current = { suggestion, activeIndex, mentionItems, onSubmit };
	const insertChipRef = useRef<
		(item: ComposerMentionItem, range: Range) => void
	>(() => {});

	const [extensions] = useState(() => {
		const suggestionExtension = (char: "@" | "$", kind: ComposerChipKind) =>
			Node.create({
				name: `composerSuggestion${char === "@" ? "File" : "Skill"}`,
				addProseMirrorPlugins() {
					return [
						Suggestion({
							editor: this.editor,
							pluginKey: new PluginKey(`composerSuggestion${char}`),
							char,
							allowSpaces: false,
							items: ({ query }) =>
								filterMentionItems(stateRef.current.mentionItems, kind, query),
							render: () => ({
								onStart: (props) => {
									setActiveIndex(0);
									setSuggestion({
										kind,
										items: props.items as ComposerMentionItem[],
										range: props.range,
									});
								},
								onUpdate: (props) => {
									setSuggestion({
										kind,
										items: props.items as ComposerMentionItem[],
										range: props.range,
									});
								},
								onKeyDown: ({ event }) => {
									const current = stateRef.current;
									if (!current.suggestion) return false;
									const count = current.suggestion.items.length;
									if (event.key === "ArrowDown") {
										setActiveIndex((current.activeIndex + 1) % count);
										return true;
									}
									if (event.key === "ArrowUp") {
										setActiveIndex((current.activeIndex - 1 + count) % count);
										return true;
									}
									if (event.key === "Enter" || event.key === "Tab") {
										const item = current.suggestion.items[current.activeIndex];
										if (item) {
											insertChipRef.current(item, current.suggestion.range);
											return true;
										}
									}
									if (event.key === "Escape") {
										setSuggestion(null);
										return true;
									}
									return false;
								},
								onExit: () => setSuggestion(null),
							}),
						}),
					];
				},
			});

		return [
			Document,
			Paragraph,
			Text,
			History,
			HardBreak,
			Placeholder.configure({ placeholder }),
			ComposerChip,
			suggestionExtension("@", "file"),
			suggestionExtension("$", "skill"),
			Node.create({
				name: "composerSubmit",
				addKeyboardShortcuts() {
					return {
						Enter: () => {
							if (stateRef.current.suggestion) return false;
							const { onSubmit: submit } = stateRef.current;
							const text = this.editor.getText({ blockSeparator: "\n" }).trim();
							if (!text) return true;
							submit?.(text);
							this.editor.commands.clearContent();
							return true;
						},
						"Shift-Enter": () => this.editor.commands.setHardBreak(),
					};
				},
			}),
		];
	});

	const editor = useEditor({
		extensions,
		editorProps: {
			attributes: { class: "chat-composer-editor" },
		},
		onUpdate: ({ editor: current }) => {
			onTextChange?.(current.getText({ blockSeparator: "\n" }));
		},
	});

	const insertChip = (item: ComposerMentionItem, range: Range) => {
		if (!editor) return;
		editor
			.chain()
			.focus()
			.insertContentAt(range, [
				{
					type: "composerChip",
					attrs: {
						label: item.label,
						kind: item.kind,
						brandColor: item.brandColor ?? null,
					},
				},
				{ type: "text", text: " " },
			])
			.run();
		setSuggestion(null);
	};
	insertChipRef.current = insertChip;

	return (
		<div className={cn("relative", className)}>
			{suggestion && (
				<SuggestionPopover
					items={suggestion.items}
					activeIndex={activeIndex}
					onHighlight={setActiveIndex}
					onSelect={(item) => {
						if (suggestion) insertChip(item, suggestion.range);
					}}
				/>
			)}
			<EditorContent editor={editor} />
		</div>
	);
}
