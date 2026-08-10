"use client";

import { cn } from "@superset/ui/utils";
import { Node } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import History from "@tiptap/extension-history";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import { PluginKey } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { useRef, useState } from "react";
import { AttachmentPills } from "./components/AttachmentPills";
import { CaretMenu } from "./components/CaretMenu";
import { PlusMenu } from "./components/PlusMenu";
import { SuggestionListbox } from "./components/SuggestionListbox";
import { MentionChip } from "./extensions/mentionChip";
import type {
	TiptapComposerAttachment,
	TiptapComposerCommand,
	TiptapComposerMentionItem,
	TiptapComposerProps,
} from "./types";
import "./tiptap-composer.css";

export type {
	TiptapComposerAttachment,
	TiptapComposerCommand,
	TiptapComposerMentionItem,
	TiptapComposerProps,
	TiptapComposerSubmitPayload,
} from "./types";

const MAX_SUGGESTIONS = 8;

type PopoverState = {
	kind: "mention" | "command";
	items: Array<TiptapComposerMentionItem | TiptapComposerCommand>;
	rect: { left: number; bottom: number; top: number };
	command: (item: TiptapComposerMentionItem | TiptapComposerCommand) => void;
};

export function TiptapComposer({
	placeholder = "Do anything",
	mentionItems,
	commands,
	status = "ready",
	onSubmit,
	onStop,
	className,
}: TiptapComposerProps) {
	const [popover, setPopover] = useState<PopoverState | null>(null);
	const [activeIndex, setActiveIndex] = useState(0);
	const [attachments, setAttachments] = useState<TiptapComposerAttachment[]>(
		[],
	);
	const [isEmpty, setIsEmpty] = useState(true);
	const [dragging, setDragging] = useState(false);
	// Tiptap extensions are instantiated once; this ref bridges them to live React state.
	const stateRef = useRef({
		popover,
		activeIndex,
		mentionItems,
		commands,
		attachments,
		onSubmit,
		status,
	});
	stateRef.current = {
		popover,
		activeIndex,
		mentionItems,
		commands,
		attachments,
		onSubmit,
		status,
	};

	const addFiles = (files: FileList | File[]) => {
		const incoming = Array.from(files);
		if (incoming.length === 0) return;
		setAttachments((previous) => [
			...previous,
			...incoming.map((file) => ({ id: crypto.randomUUID(), file })),
		]);
	};

	const [extensions] = useState(() => {
		const popoverRender = (
			kind: "mention" | "command",
		): Parameters<typeof Suggestion>[0]["render"] => {
			const toState = (props: {
				items: unknown[];
				clientRect?: (() => DOMRect | null) | null;
				command: (item: unknown) => void;
			}): PopoverState | null => {
				const rect = props.clientRect?.();
				if (!rect) return null;
				return {
					kind,
					items: props.items as PopoverState["items"],
					rect: { left: rect.left, bottom: rect.bottom, top: rect.top },
					command: props.command,
				};
			};
			return () => ({
				onStart: (props) => {
					setActiveIndex(0);
					setPopover(toState(props));
				},
				onUpdate: (props) => setPopover(toState(props)),
				onKeyDown: ({ event }) => {
					const current = stateRef.current;
					if (!current.popover) return false;
					const count = current.popover.items.length;
					if (event.key === "ArrowDown") {
						setActiveIndex((current.activeIndex + 1) % count);
						return true;
					}
					if (event.key === "ArrowUp") {
						setActiveIndex((current.activeIndex - 1 + count) % count);
						return true;
					}
					if (event.key === "Enter" || event.key === "Tab") {
						const item = current.popover.items[current.activeIndex];
						if (item) {
							current.popover.command(item);
							return true;
						}
					}
					if (event.key === "Escape") {
						setPopover(null);
						return true;
					}
					return false;
				},
				onExit: () => setPopover(null),
			});
		};

		return [
			Document,
			Paragraph,
			Text,
			History,
			HardBreak,
			Placeholder.configure({ placeholder }),
			MentionChip,
			Node.create({
				name: "mentionSuggestion",
				addProseMirrorPlugins() {
					return [
						Suggestion({
							editor: this.editor,
							pluginKey: new PluginKey("mentionSuggestion"),
							char: "@",
							allowSpaces: false,
							items: ({ query }) =>
								stateRef.current.mentionItems
									.filter((item) =>
										item.label.toLowerCase().includes(query.toLowerCase()),
									)
									.slice(0, MAX_SUGGESTIONS),
							command: ({ editor, range, props }) => {
								const item = props as TiptapComposerMentionItem;
								editor
									.chain()
									.focus()
									.insertContentAt(range, [
										{
											type: "mentionChip",
											attrs: {
												label: item.label,
												brandColor: item.brandColor ?? null,
											},
										},
										{ type: "text", text: " " },
									])
									.run();
							},
							render: popoverRender("mention"),
						}),
					];
				},
			}),
			Node.create({
				name: "commandSuggestion",
				addProseMirrorPlugins() {
					return [
						Suggestion({
							editor: this.editor,
							pluginKey: new PluginKey("commandSuggestion"),
							char: "/",
							startOfLine: true,
							allowSpaces: false,
							items: ({ query }) =>
								stateRef.current.commands
									.filter((command) =>
										command.label.toLowerCase().includes(query.toLowerCase()),
									)
									.slice(0, MAX_SUGGESTIONS),
							command: ({ editor, range, props }) => {
								const command = props as TiptapComposerCommand;
								editor
									.chain()
									.focus()
									.insertContentAt(range, `/${command.label} `)
									.run();
							},
							render: popoverRender("command"),
						}),
					];
				},
			}),
			Node.create({
				name: "composerSubmit",
				addKeyboardShortcuts() {
					return {
						Enter: () => {
							if (stateRef.current.popover) return false;
							submitRef.current();
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
			attributes: { class: "tiptap-composer-editor" },
			handleDrop: (_view, event) => {
				const files = event.dataTransfer?.files;
				if (files && files.length > 0) {
					event.preventDefault();
					addFiles(files);
					setDragging(false);
					return true;
				}
				return false;
			},
			handlePaste: (_view, event) => {
				const files = event.clipboardData?.files;
				if (files && files.length > 0) {
					event.preventDefault();
					addFiles(files);
					return true;
				}
				return false;
			},
		},
		onUpdate: ({ editor: current }) => {
			setIsEmpty(current.getText().trim().length === 0);
		},
	});

	const submit = () => {
		if (!editor || stateRef.current.status === "streaming") return;
		const text = editor.getText({ blockSeparator: "\n" }).trim();
		const files = stateRef.current.attachments.map(
			(attachment) => attachment.file,
		);
		if (!text && files.length === 0) return;
		stateRef.current.onSubmit?.({ text, files });
		editor.commands.clearContent();
		setAttachments([]);
	};
	const submitRef = useRef(submit);
	submitRef.current = submit;

	const canSend = !isEmpty || attachments.length > 0;

	return (
		<div
			className={cn(
				"relative flex flex-col rounded-2xl bg-card ring-1 ring-border transition-shadow focus-within:ring-ring/40",
				dragging && "ring-2 ring-primary",
				className,
			)}
			onDragOver={(event) => {
				if (event.dataTransfer.types.includes("Files")) {
					event.preventDefault();
					setDragging(true);
				}
			}}
			onDragLeave={(event) => {
				if (
					!event.currentTarget.contains(
						event.relatedTarget as globalThis.Node | null,
					)
				)
					setDragging(false);
			}}
			onDrop={(event) => {
				if (event.dataTransfer.files.length > 0) {
					event.preventDefault();
					addFiles(event.dataTransfer.files);
				}
				setDragging(false);
			}}
		>
			{dragging && (
				<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/5 text-sm font-medium text-primary">
					Drop files to attach
				</div>
			)}
			<AttachmentPills
				attachments={attachments}
				onRemove={(id) =>
					setAttachments((previous) =>
						previous.filter((entry) => entry.id !== id),
					)
				}
			/>
			<div className="px-4 pt-3.5 pb-1">
				<EditorContent editor={editor} />
			</div>
			<div className="flex min-h-12 items-center gap-1 px-3 pb-2.5">
				<PlusMenu onFiles={addFiles} />
				<div className="flex-1" />
				{status === "streaming" ? (
					<button
						type="button"
						aria-label="Stop response"
						onClick={onStop}
						className="flex size-8 cursor-pointer items-center justify-center rounded-lg bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80"
					>
						<SquareIcon className="size-3.5 fill-current" />
					</button>
				) : (
					<button
						type="button"
						aria-label="Send message"
						disabled={!canSend}
						onClick={submit}
						className={cn(
							"flex size-8 items-center justify-center rounded-lg transition-colors",
							canSend
								? "cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
								: "cursor-not-allowed bg-secondary text-muted-foreground",
						)}
					>
						<ArrowUpIcon className="size-4.5" />
					</button>
				)}
			</div>
			{popover && popover.items.length > 0 && (
				<CaretMenu rect={popover.rect}>
					<SuggestionListbox
						kind={popover.kind}
						items={popover.items}
						activeIndex={activeIndex}
						onHighlight={setActiveIndex}
						onSelect={(item) => popover.command(item)}
					/>
				</CaretMenu>
			)}
		</div>
	);
}
