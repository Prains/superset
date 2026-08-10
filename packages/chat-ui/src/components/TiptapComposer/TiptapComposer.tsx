"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { mergeAttributes, Node, type Range } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import History from "@tiptap/extension-history";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import { PluginKey } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import {
	ArrowUpIcon,
	FileCode2Icon,
	ImageIcon,
	PaperclipIcon,
	PlusIcon,
	SlashSquareIcon,
	SquareIcon,
	XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./tiptap-composer.css";

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

const MAX_SUGGESTIONS = 8;

const MentionChip = Node.create({
	name: "mentionChip",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	addAttributes() {
		return { label: { default: "" }, brandColor: { default: null } };
	},
	parseHTML() {
		return [{ tag: "span[data-mention-chip]" }];
	},
	renderHTML({ node }) {
		return [
			"span",
			mergeAttributes({
				"data-mention-chip": "true",
				class: "tiptap-composer-chip",
				style: node.attrs.brandColor
					? `--chip-color:${node.attrs.brandColor}`
					: undefined,
			}),
			node.attrs.label,
		];
	},
	renderText({ node }) {
		return `@${node.attrs.label}`;
	},
});

type PopoverState = {
	kind: "mention" | "command";
	items: Array<TiptapComposerMentionItem | TiptapComposerCommand>;
	rect: { left: number; bottom: number; top: number };
	command: (item: TiptapComposerMentionItem | TiptapComposerCommand) => void;
};

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
	const fileInputRef = useRef<HTMLInputElement>(null);
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
	const popoverBelow =
		popover != null && popover.rect.bottom + 300 < window.innerHeight;

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
			{attachments.length > 0 && (
				<div className="flex flex-wrap gap-1.5 px-3 pt-3">
					{attachments.map((attachment) => (
						<span
							key={attachment.id}
							className="flex items-center gap-1.5 rounded-lg bg-secondary px-2 py-1 text-xs text-secondary-foreground"
						>
							<PaperclipIcon className="size-3.5 text-muted-foreground" />
							<span className="max-w-40 truncate">{attachment.file.name}</span>
							<span className="text-muted-foreground">
								{formatBytes(attachment.file.size)}
							</span>
							<button
								type="button"
								aria-label={`Remove ${attachment.file.name}`}
								className="cursor-pointer text-muted-foreground hover:text-foreground"
								onClick={() =>
									setAttachments((previous) =>
										previous.filter((entry) => entry.id !== attachment.id),
									)
								}
							>
								<XIcon className="size-3.5" />
							</button>
						</span>
					))}
				</div>
			)}
			<div className="px-4 pt-3.5 pb-1">
				<EditorContent editor={editor} />
			</div>
			<div className="flex min-h-12 items-center gap-1 px-3 pb-2.5">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label="Add"
							className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<PlusIcon className="size-4.5" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
							<PaperclipIcon className="size-4" />
							Photos & files
						</DropdownMenuItem>
						<DropdownMenuItem disabled>
							<ImageIcon className="size-4" />
							Screenshot
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					className="hidden"
					onChange={(event) => {
						if (event.target.files) addFiles(event.target.files);
						event.target.value = "";
					}}
				/>
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
			{popover &&
				popover.items.length > 0 &&
				createPortal(
					<div
						role="listbox"
						className="fixed z-50 max-h-72 w-80 overflow-y-auto rounded-xl bg-popover/95 p-1 shadow-xl ring-1 ring-border backdrop-blur-sm"
						style={
							popoverBelow
								? { left: popover.rect.left, top: popover.rect.bottom + 6 }
								: {
										left: popover.rect.left,
										bottom: window.innerHeight - popover.rect.top + 6,
									}
						}
					>
						{popover.items.map((item, index) => (
							// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the editor
							// biome-ignore lint/a11y/useFocusableInteractive: focus stays in the editor; listbox is virtual
							<div
								key={item.id}
								role="option"
								aria-selected={index === activeIndex}
								className={cn(
									"flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm",
									index === activeIndex
										? "bg-accent text-accent-foreground"
										: "text-foreground",
								)}
								onMouseEnter={() => setActiveIndex(index)}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => popover.command(item)}
							>
								{popover.kind === "mention" ? (
									<FileCode2Icon className="size-4 shrink-0 text-muted-foreground" />
								) : (
									<SlashSquareIcon className="size-4 shrink-0 text-muted-foreground" />
								)}
								<span className="min-w-0 truncate">
									{popover.kind === "command" ? `/${item.label}` : item.label}
								</span>
								{"description" in item && item.description && (
									<span className="ml-auto min-w-0 shrink-[2] truncate text-xs text-muted-foreground">
										{item.description}
									</span>
								)}
							</div>
						))}
					</div>,
					document.body,
				)}
		</div>
	);
}
