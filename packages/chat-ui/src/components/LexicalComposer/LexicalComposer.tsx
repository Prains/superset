"use client";

import {
	type InitialConfigType,
	LexicalComposer as LexicalComposerProvider,
} from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
	LexicalTypeaheadMenuPlugin,
	MenuOption,
	type MenuTextMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import {
	$createTextNode,
	$getRoot,
	COMMAND_PRIORITY_HIGH,
	COMMAND_PRIORITY_LOW,
	DecoratorNode,
	DROP_COMMAND,
	KEY_ENTER_COMMAND,
	type NodeKey,
	PASTE_COMMAND,
	type SerializedLexicalNode,
	type Spread,
	type TextNode,
} from "lexical";
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
import { type JSX, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./lexical-composer.css";

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

const MAX_SUGGESTIONS = 8;

type SerializedChipNode = Spread<
	{ label: string; brandColor: string | null },
	SerializedLexicalNode
>;

class MentionChipNode extends DecoratorNode<JSX.Element> {
	__label: string;
	__brandColor: string | null;

	static getType(): string {
		return "mention-chip";
	}

	static clone(node: MentionChipNode): MentionChipNode {
		return new MentionChipNode(node.__label, node.__brandColor, node.__key);
	}

	constructor(label: string, brandColor: string | null, key?: NodeKey) {
		super(key);
		this.__label = label;
		this.__brandColor = brandColor;
	}

	static importJSON(serialized: SerializedChipNode): MentionChipNode {
		return new MentionChipNode(serialized.label, serialized.brandColor);
	}

	exportJSON(): SerializedChipNode {
		return {
			...super.exportJSON(),
			type: "mention-chip",
			label: this.__label,
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
		return `@${this.__label}`;
	}

	decorate(): JSX.Element {
		return (
			<span
				className="lexical-composer-chip"
				data-mention-chip="true"
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

class MentionTypeaheadOption extends MenuOption {
	item: LexicalComposerMentionItem;
	constructor(item: LexicalComposerMentionItem) {
		super(item.id);
		this.item = item;
	}
}

class CommandTypeaheadOption extends MenuOption {
	command: LexicalComposerCommand;
	constructor(command: LexicalComposerCommand) {
		super(command.id);
		this.command = command;
	}
}

function matchToken(
	text: string,
	trigger: string,
	requireStart: boolean,
): MenuTextMatch | null {
	const pattern = new RegExp(`(^|\\s)(\\${trigger}([\\w./:-]*))$`);
	const match = pattern.exec(text);
	if (!match) return null;
	const leadOffset = match.index + (match[1]?.length ?? 0);
	if (requireStart && leadOffset !== 0) return null;
	return {
		leadOffset,
		matchingString: match[3] ?? "",
		replaceableString: match[2] ?? "",
	};
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type MenuListProps<TOption extends MenuOption> = {
	options: TOption[];
	selectedIndex: number | null;
	onHighlight: (index: number) => void;
	onSelect: (option: TOption) => void;
	renderRow: (option: TOption) => JSX.Element;
};

function MenuList<TOption extends MenuOption>({
	options,
	selectedIndex,
	onHighlight,
	onSelect,
	renderRow,
}: MenuListProps<TOption>) {
	return (
		<div
			role="listbox"
			className="max-h-72 w-80 overflow-y-auto rounded-xl bg-popover/95 p-1 shadow-xl ring-1 ring-border backdrop-blur-sm"
		>
			{options.map((option, index) => (
				// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the editor
				// biome-ignore lint/a11y/useFocusableInteractive: focus stays in the editor; listbox is virtual
				<div
					key={option.key}
					role="option"
					aria-selected={index === selectedIndex}
					className={cn(
						"flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm",
						index === selectedIndex
							? "bg-accent text-accent-foreground"
							: "text-foreground",
					)}
					onMouseEnter={() => onHighlight(index)}
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => onSelect(option)}
				>
					{renderRow(option)}
				</div>
			))}
		</div>
	);
}

function ComposerInner({
	placeholder,
	mentionItems,
	commands,
	status,
	onSubmit,
	onStop,
}: Required<Pick<LexicalComposerProps, "placeholder" | "status">> &
	Pick<
		LexicalComposerProps,
		"mentionItems" | "commands" | "onSubmit" | "onStop"
	>) {
	const [editor] = useLexicalComposerContext();
	const [attachments, setAttachments] = useState<LexicalComposerAttachment[]>(
		[],
	);
	const [isEmpty, setIsEmpty] = useState(true);
	const [dragging, setDragging] = useState(false);
	const [mentionQuery, setMentionQuery] = useState<string | null>(null);
	const [commandQuery, setCommandQuery] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const stateRef = useRef({ attachments, onSubmit, status });
	stateRef.current = { attachments, onSubmit, status };

	const addFiles = (files: FileList | File[]) => {
		const incoming = Array.from(files);
		if (incoming.length === 0) return;
		setAttachments((previous) => [
			...previous,
			...incoming.map((file) => ({ id: crypto.randomUUID(), file })),
		]);
	};
	const addFilesRef = useRef(addFiles);
	addFilesRef.current = addFiles;

	const mentionOptions = useMemo(
		() =>
			(mentionItems ?? [])
				.filter((item) =>
					item.label.toLowerCase().includes((mentionQuery ?? "").toLowerCase()),
				)
				.slice(0, MAX_SUGGESTIONS)
				.map((item) => new MentionTypeaheadOption(item)),
		[mentionItems, mentionQuery],
	);
	const commandOptions = useMemo(
		() =>
			(commands ?? [])
				.filter((command) =>
					command.label
						.toLowerCase()
						.includes((commandQuery ?? "").toLowerCase()),
				)
				.slice(0, MAX_SUGGESTIONS)
				.map((command) => new CommandTypeaheadOption(command)),
		[commands, commandQuery],
	);

	const submit = () => {
		if (stateRef.current.status === "streaming") return;
		const text = editor
			.getEditorState()
			.read(() => $getRoot().getTextContent())
			.trim();
		const files = stateRef.current.attachments.map(
			(attachment) => attachment.file,
		);
		if (!text && files.length === 0) return;
		stateRef.current.onSubmit?.({ text, files });
		editor.update(() => $getRoot().clear());
		setAttachments([]);
	};
	const submitRef = useRef(submit);
	submitRef.current = submit;

	useEffect(() => {
		const unregisterText = editor.registerTextContentListener((text) =>
			setIsEmpty(text.trim().length === 0),
		);
		const unregisterEnter = editor.registerCommand<KeyboardEvent | null>(
			KEY_ENTER_COMMAND,
			(event) => {
				if (event?.shiftKey) return false;
				event?.preventDefault();
				submitRef.current();
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
		const unregisterDrop = editor.registerCommand<DragEvent>(
			DROP_COMMAND,
			(event) => {
				const files = event.dataTransfer?.files;
				if (files && files.length > 0) {
					event.preventDefault();
					addFilesRef.current(files);
					setDragging(false);
					return true;
				}
				return false;
			},
			COMMAND_PRIORITY_HIGH,
		);
		const unregisterPaste = editor.registerCommand<ClipboardEvent>(
			PASTE_COMMAND,
			(event) => {
				const files =
					event instanceof ClipboardEvent ? event.clipboardData?.files : null;
				if (files && files.length > 0) {
					event.preventDefault();
					addFilesRef.current(files);
					return true;
				}
				return false;
			},
			COMMAND_PRIORITY_HIGH,
		);
		return () => {
			unregisterText();
			unregisterEnter();
			unregisterDrop();
			unregisterPaste();
		};
	}, [editor]);

	const canSend = !isEmpty || attachments.length > 0;

	return (
		<div
			className={cn(
				"relative flex flex-col rounded-2xl bg-card ring-1 ring-border transition-shadow focus-within:ring-ring/40",
				dragging && "ring-2 ring-primary",
			)}
			onDragOver={(event) => {
				if (event.dataTransfer.types.includes("Files")) {
					event.preventDefault();
					setDragging(true);
				}
			}}
			onDragLeave={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null))
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
			<div className="relative px-4 pt-3.5 pb-1">
				<PlainTextPlugin
					contentEditable={
						<ContentEditable className="lexical-composer-editor" />
					}
					placeholder={
						<span className="pointer-events-none absolute top-3.5 left-4 text-sm text-muted-foreground/70">
							{placeholder}
						</span>
					}
					ErrorBoundary={LexicalErrorBoundary}
				/>
				<HistoryPlugin />
				<LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
					onQueryChange={setMentionQuery}
					onSelectOption={(option, nodeToReplace, closeMenu) => {
						editor.update(() => {
							const chip = new MentionChipNode(
								option.item.label,
								option.item.brandColor ?? null,
							);
							if (nodeToReplace) {
								nodeToReplace.replace(chip);
							}
							const space = $createTextNode(" ");
							chip.insertAfter(space);
							space.select(1, 1);
							closeMenu();
						});
					}}
					options={mentionOptions}
					triggerFn={(text) => matchToken(text, "@", false)}
					commandPriority={COMMAND_PRIORITY_HIGH}
					menuRenderFn={(
						anchorElementRef,
						{ selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
					) =>
						anchorElementRef.current && mentionOptions.length > 0
							? createPortal(
									<MenuList
										options={mentionOptions}
										selectedIndex={selectedIndex}
										onHighlight={setHighlightedIndex}
										onSelect={selectOptionAndCleanUp}
										renderRow={(option) => (
											<>
												<FileCode2Icon className="size-4 shrink-0 text-muted-foreground" />
												<span className="min-w-0 truncate">
													{option.item.label}
												</span>
											</>
										)}
									/>,
									anchorElementRef.current,
								)
							: null
					}
				/>
				<LexicalTypeaheadMenuPlugin<CommandTypeaheadOption>
					onQueryChange={setCommandQuery}
					onSelectOption={(option, nodeToReplace, closeMenu) => {
						editor.update(() => {
							const text = $createTextNode(`/${option.command.label} `);
							if (nodeToReplace) {
								nodeToReplace.replace(text);
							}
							text.select(text.getTextContentSize(), text.getTextContentSize());
							closeMenu();
						});
					}}
					options={commandOptions}
					triggerFn={(text) => matchToken(text, "/", true)}
					commandPriority={COMMAND_PRIORITY_HIGH}
					menuRenderFn={(
						anchorElementRef,
						{ selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
					) =>
						anchorElementRef.current && commandOptions.length > 0
							? createPortal(
									<MenuList
										options={commandOptions}
										selectedIndex={selectedIndex}
										onHighlight={setHighlightedIndex}
										onSelect={selectOptionAndCleanUp}
										renderRow={(option) => (
											<>
												<SlashSquareIcon className="size-4 shrink-0 text-muted-foreground" />
												<span className="min-w-0 truncate">
													/{option.command.label}
												</span>
												{option.command.description && (
													<span className="ml-auto min-w-0 shrink-[2] truncate text-xs text-muted-foreground">
														{option.command.description}
													</span>
												)}
											</>
										)}
									/>,
									anchorElementRef.current,
								)
							: null
					}
				/>
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
		</div>
	);
}

export function LexicalComposer({
	placeholder = "Do anything",
	mentionItems,
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
				<ComposerInner
					placeholder={placeholder}
					mentionItems={mentionItems}
					commands={commands}
					status={status}
					onSubmit={onSubmit}
					onStop={onStop}
				/>
			</LexicalComposerProvider>
		</div>
	);
}
