"use client";

import {
	type InitialConfigType,
	LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { cn } from "@superset/ui/utils";
import {
	$createTextNode,
	$getRoot,
	$getSelection,
	$isRangeSelection,
	$isTextNode,
	COMMAND_PRIORITY_HIGH,
	DecoratorNode,
	KEY_ARROW_DOWN_COMMAND,
	KEY_ARROW_UP_COMMAND,
	KEY_ENTER_COMMAND,
	KEY_ESCAPE_COMMAND,
	KEY_TAB_COMMAND,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread,
} from "lexical";
import { type JSX, useEffect, useRef, useState } from "react";
import {
	type ComposerMentionItem,
	type ComposerTrigger,
	detectComposerTrigger,
	filterMentionItems,
	serializeChip,
} from "./composerLogic";
import { SuggestionPopover } from "./SuggestionPopover";
import type { ComposerEditorProps } from "./TiptapComposerEditor";
import "./composer-chip.css";

type SerializedChipNode = Spread<
	{ label: string; kind: "file" | "skill"; brandColor: string | null },
	SerializedLexicalNode
>;

class ChipNode extends DecoratorNode<JSX.Element> {
	__label: string;
	__kind: "file" | "skill";
	__brandColor: string | null;

	static getType(): string {
		return "composer-chip";
	}

	static clone(node: ChipNode): ChipNode {
		return new ChipNode(
			node.__label,
			node.__kind,
			node.__brandColor,
			node.__key,
		);
	}

	constructor(
		label: string,
		kind: "file" | "skill",
		brandColor: string | null,
		key?: NodeKey,
	) {
		super(key);
		this.__label = label;
		this.__kind = kind;
		this.__brandColor = brandColor;
	}

	static importJSON(serialized: SerializedChipNode): ChipNode {
		return new ChipNode(
			serialized.label,
			serialized.kind,
			serialized.brandColor,
		);
	}

	exportJSON(): SerializedChipNode {
		return {
			...super.exportJSON(),
			type: "composer-chip",
			label: this.__label,
			kind: this.__kind,
			brandColor: this.__brandColor,
		};
	}

	createDOM(): HTMLElement {
		return document.createElement("span");
	}

	updateDOM(): boolean {
		return false;
	}

	isInline(): boolean {
		return true;
	}

	getTextContent(): string {
		return serializeChip(this.__kind, this.__label);
	}

	decorate(): JSX.Element {
		return (
			<span
				className="chat-composer-chip"
				data-composer-chip={this.__kind}
				style={
					this.__brandColor
						? ({ "--chip-color": this.__brandColor } as React.CSSProperties)
						: undefined
				}
			>
				{this.__label}
			</span>
		);
	}
}

type SuggestionState = {
	trigger: ComposerTrigger;
	items: ComposerMentionItem[];
	anchorKey: NodeKey;
};

function EditorPlugins({
	mentionItems,
	onSubmit,
	onTextChange,
}: Pick<ComposerEditorProps, "mentionItems" | "onSubmit" | "onTextChange">) {
	const [editor] = useLexicalComposerContext();
	const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
	const [activeIndex, setActiveIndex] = useState(0);
	const stateRef = useRef({ suggestion, activeIndex, mentionItems, onSubmit });
	stateRef.current = { suggestion, activeIndex, mentionItems, onSubmit };

	const acceptSuggestion = (item: ComposerMentionItem) => {
		const current = stateRef.current.suggestion;
		if (!current) return;
		editor.update(() => {
			const selection = $getSelection();
			if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
			const anchorNode = selection.anchor.getNode();
			if (!$isTextNode(anchorNode)) return;
			const offset = selection.anchor.offset;
			const tokenLength = current.trigger.rangeEnd - current.trigger.rangeStart;
			const tokenStart = offset - tokenLength;
			if (tokenStart < 0) return;
			let target = anchorNode;
			if (tokenStart > 0) {
				const after = anchorNode.splitText(tokenStart)[1];
				if (!after) return;
				target = after;
			}
			const localEnd = offset - tokenStart;
			if (localEnd < target.getTextContentSize()) {
				const first = target.splitText(localEnd)[0];
				if (!first) return;
				target = first;
			}
			const chip = new ChipNode(item.label, item.kind, item.brandColor ?? null);
			const space = $createTextNode(" ");
			target.replace(chip);
			chip.insertAfter(space);
			space.select(1, 1);
		});
		setSuggestion(null);
	};
	const acceptRef = useRef(acceptSuggestion);
	acceptRef.current = acceptSuggestion;

	useEffect(() => {
		return editor.registerUpdateListener(({ editorState }) => {
			editorState.read(() => {
				const selection = $getSelection();
				if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
					setSuggestion(null);
					return;
				}
				const anchorNode = selection.anchor.getNode();
				if (!$isTextNode(anchorNode)) {
					setSuggestion(null);
					return;
				}
				const textBefore = anchorNode
					.getTextContent()
					.slice(0, selection.anchor.offset);
				const trigger = detectComposerTrigger(
					textBefore,
					selection.anchor.offset,
				);
				if (!trigger) {
					setSuggestion(null);
					return;
				}
				const items = filterMentionItems(
					stateRef.current.mentionItems,
					trigger.kind,
					trigger.query,
				);
				if (items.length === 0) {
					setSuggestion(null);
					return;
				}
				setActiveIndex((previous) =>
					stateRef.current.suggestion?.trigger.rangeStart !== trigger.rangeStart
						? 0
						: previous,
				);
				setSuggestion({ trigger, items, anchorKey: anchorNode.getKey() });
			});
			onTextChange?.(editorState.read(() => $getRoot().getTextContent()));
		});
	}, [editor, onTextChange]);

	useEffect(() => {
		const unregisterEnter = editor.registerCommand<KeyboardEvent | null>(
			KEY_ENTER_COMMAND,
			(event) => {
				const current = stateRef.current;
				if (current.suggestion) {
					const item = current.suggestion.items[current.activeIndex];
					if (item) {
						event?.preventDefault();
						acceptRef.current(item);
						return true;
					}
				}
				if (event?.shiftKey) return false;
				event?.preventDefault();
				const text = editor
					.getEditorState()
					.read(() => $getRoot().getTextContent())
					.trim();
				if (text) {
					current.onSubmit?.(text);
					editor.update(() => $getRoot().clear());
				}
				return true;
			},
			COMMAND_PRIORITY_HIGH,
		);
		const move = (delta: 1 | -1) => (event: KeyboardEvent) => {
			const current = stateRef.current;
			if (!current.suggestion) return false;
			event.preventDefault();
			const count = current.suggestion.items.length;
			setActiveIndex((current.activeIndex + delta + count) % count);
			return true;
		};
		const unregisterDown = editor.registerCommand(
			KEY_ARROW_DOWN_COMMAND,
			move(1),
			COMMAND_PRIORITY_HIGH,
		);
		const unregisterUp = editor.registerCommand(
			KEY_ARROW_UP_COMMAND,
			move(-1),
			COMMAND_PRIORITY_HIGH,
		);
		const unregisterTab = editor.registerCommand<KeyboardEvent>(
			KEY_TAB_COMMAND,
			(event) => {
				const current = stateRef.current;
				if (!current.suggestion) return false;
				const item = current.suggestion.items[current.activeIndex];
				if (!item) return false;
				event.preventDefault();
				acceptRef.current(item);
				return true;
			},
			COMMAND_PRIORITY_HIGH,
		);
		const unregisterEscape = editor.registerCommand(
			KEY_ESCAPE_COMMAND,
			() => {
				if (!stateRef.current.suggestion) return false;
				setSuggestion(null);
				return true;
			},
			COMMAND_PRIORITY_HIGH,
		);
		return () => {
			unregisterEnter();
			unregisterDown();
			unregisterUp();
			unregisterTab();
			unregisterEscape();
		};
	}, [editor]);

	return suggestion ? (
		<SuggestionPopover
			items={suggestion.items}
			activeIndex={activeIndex}
			onHighlight={setActiveIndex}
			onSelect={(item) => acceptRef.current(item)}
		/>
	) : null;
}

export function LexicalComposerEditor({
	placeholder = "Do anything",
	mentionItems,
	onSubmit,
	onTextChange,
	className,
}: ComposerEditorProps) {
	const [initialConfig] = useState<InitialConfigType>(() => ({
		namespace: "chat-composer",
		nodes: [ChipNode],
		onError: (error: Error) => {
			throw error;
		},
	}));

	return (
		<div className={cn("relative", className)}>
			<LexicalComposer initialConfig={initialConfig}>
				<EditorPlugins
					mentionItems={mentionItems}
					onSubmit={onSubmit}
					onTextChange={onTextChange}
				/>
				<PlainTextPlugin
					contentEditable={<ContentEditable className="chat-composer-editor" />}
					placeholder={
						<span className="pointer-events-none absolute top-0 left-0 text-muted-foreground/70">
							{placeholder}
						</span>
					}
					ErrorBoundary={LexicalErrorBoundary}
				/>
				<HistoryPlugin />
			</LexicalComposer>
		</div>
	);
}
