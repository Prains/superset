"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { LexicalTypeaheadMenuPlugin } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { cn } from "@superset/ui/utils";
import {
	$createTextNode,
	$getRoot,
	$getSelection,
	$isRangeSelection,
	$isTextNode,
	COMMAND_PRIORITY_HIGH,
	COMMAND_PRIORITY_LOW,
	DROP_COMMAND,
	KEY_ENTER_COMMAND,
	type LexicalNode,
	PASTE_COMMAND,
} from "lexical";
import { ArrowUpIcon, SlashSquareIcon, SquareIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useComposerDropZone } from "../../../ComposerDropZone";
import { useMentionSources } from "../../hooks/useMentionSources";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import type {
	ComposerActionContext,
	ComposerChip,
	ComposerMentionEntry,
	ComposerPanelContent,
	LexicalComposerAttachment,
	LexicalComposerProps,
} from "../../types";
import { matchToken } from "../../utils/matchToken";
import {
	CommandTypeaheadOption,
	MentionTypeaheadOption,
} from "../../utils/typeaheadOptions";
import { AttachmentPills } from "../AttachmentPills";
import { ComposerPanel } from "../ComposerPanel";
import { ContextButton } from "../ContextButton";
import { MentionMenu } from "../MentionMenu";
import { SuggestionListbox } from "../SuggestionListbox";

const MAX_COMMAND_SUGGESTIONS = 8;

export type ComposerBodyProps = Required<
	Pick<LexicalComposerProps, "placeholder" | "status" | "placement">
> &
	Pick<
		LexicalComposerProps,
		| "mentionProviders"
		| "commands"
		| "toolbar"
		| "onSubmit"
		| "onStop"
		| "onMentionHighlight"
		| "onAttachmentClick"
	>;

function $insertChipAtSelection(chip: ComposerChip) {
	let selection = $getSelection();
	if (!$isRangeSelection(selection)) {
		$getRoot().selectEnd();
		selection = $getSelection();
	}
	if (!$isRangeSelection(selection)) return;
	const chipNode = MentionChipNode.fromChip(chip);
	selection.insertNodes([chipNode, $createTextNode(" ")]);
}

function $collectChips(): ComposerChip[] {
	const chips: ComposerChip[] = [];
	const visit = (node: LexicalNode) => {
		if (node instanceof MentionChipNode) {
			chips.push(node.toChip());
		}
		if ("getChildren" in node) {
			for (const child of (
				node as unknown as { getChildren(): LexicalNode[] }
			).getChildren()) {
				visit(child);
			}
		}
	};
	visit($getRoot());
	return chips;
}

export function ComposerBody({
	placeholder,
	mentionProviders,
	commands,
	status,
	placement,
	toolbar,
	onSubmit,
	onStop,
	onMentionHighlight,
	onAttachmentClick,
}: ComposerBodyProps) {
	const [editor] = useLexicalComposerContext();
	const [attachments, setAttachments] = useState<LexicalComposerAttachment[]>(
		[],
	);
	const [isEmpty, setIsEmpty] = useState(true);
	const [dragging, setDragging] = useState(false);
	const [mentionQuery, setMentionQuery] = useState<string | null>(null);
	const [commandQuery, setCommandQuery] = useState<string | null>(null);
	const [panel, setPanel] = useState<ComposerPanelContent | null>(null);
	const [menuSlot, setMenuSlot] = useState<HTMLDivElement | null>(null);
	const [browseOpen, setBrowseOpen] = useState(false);
	const [browseIndex, setBrowseIndex] = useState(0);
	const [typeaheadDismissed, setTypeaheadDismissed] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	// Lexical command listeners register once; this ref bridges them to live React state.
	const stateRef = useRef({ attachments, onSubmit, status });
	stateRef.current = { attachments, onSubmit, status };

	const addFiles = (files: FileList | File[]) => {
		const incoming = Array.from(files);
		if (incoming.length === 0) return;
		setAttachments((previous) => [
			...previous,
			...incoming.map((file) => ({
				id: crypto.randomUUID(),
				file,
				previewUrl: file.type.startsWith("image/")
					? URL.createObjectURL(file)
					: undefined,
			})),
		]);
	};
	const addFilesRef = useRef(addFiles);
	addFilesRef.current = addFiles;

	const dropZone = useComposerDropZone();
	useEffect(() => {
		return dropZone?.register((files) => addFilesRef.current(files));
	}, [dropZone]);

	const actionContext: ComposerActionContext = {
		insertChip: (chip) => {
			editor.update(() => $insertChipAtSelection(chip));
		},
		attachFiles: () => fileInputRef.current?.click(),
		openPanel: setPanel,
		query: mentionQuery ?? "",
	};
	const actionContextRef = useRef(actionContext);
	actionContextRef.current = actionContext;

	const sections = useMentionSources(
		mentionProviders ?? [],
		mentionQuery != null || browseOpen,
		mentionQuery ?? "",
	);
	const browseEntries = useMemo(
		() => sections.flatMap((section) => section.entries),
		[sections],
	);

	useEffect(() => {
		setTypeaheadDismissed(false);
		// The two menu modes are mutually exclusive: typing "@" replaces browse.
		if (mentionQuery != null) setBrowseOpen(false);
	}, [mentionQuery]);
	const mentionOptions = useMemo(
		() =>
			sections.flatMap((section) =>
				section.entries.map((entry) => new MentionTypeaheadOption(entry)),
			),
		[sections],
	);

	const commandOptions = useMemo(
		() =>
			(commands ?? [])
				.filter((command) =>
					command.label
						.toLowerCase()
						.includes((commandQuery ?? "").toLowerCase()),
				)
				.slice(0, MAX_COMMAND_SUGGESTIONS)
				.map((command) => new CommandTypeaheadOption(command)),
		[commands, commandQuery],
	);

	const selectMentionEntry = (
		entry: ComposerMentionEntry,
		nodeToReplace: LexicalNode | null,
		closeMenu: () => void,
	) => {
		if (entry.completionQuery != null) {
			const completion = entry.completionQuery;
			editor.update(() => {
				if (nodeToReplace && "setTextContent" in nodeToReplace) {
					const textNode = nodeToReplace as unknown as {
						setTextContent(text: string): void;
						select(anchor: number, focus: number): void;
					};
					const text = `@${completion}`;
					textNode.setTextContent(text);
					textNode.select(text.length, text.length);
				}
			});
			return;
		}
		editor.update(() => {
			nodeToReplace?.remove();
			closeMenu();
		});
		void entry.select(actionContextRef.current);
	};

	useEffect(() => {
		if (mentionQuery == null) onMentionHighlight?.(null);
	}, [mentionQuery, onMentionHighlight]);

	const releaseAttachment = (attachment: LexicalComposerAttachment) => {
		if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
	};

	const submit = () => {
		if (stateRef.current.status === "streaming") return;
		const { text, mentions } = editor.getEditorState().read(() => ({
			text: $getRoot().getTextContent().trim(),
			mentions: $collectChips(),
		}));
		const files = stateRef.current.attachments.map(
			(attachment) => attachment.file,
		);
		if (!text && files.length === 0) return;
		stateRef.current.onSubmit?.({ text, files, mentions });
		editor.update(() => $getRoot().clear());
		setAttachments((previous) => {
			for (const attachment of previous) releaseAttachment(attachment);
			return [];
		});
		setPanel(null);
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

	const toggleBrowseMenu = () => {
		setTypeaheadDismissed(true);
		setBrowseIndex(0);
		setBrowseOpen((previous) => !previous);
	};

	const selectBrowseEntry = (entry: ComposerMentionEntry) => {
		setBrowseOpen(false);
		if (entry.completionQuery != null) {
			const completion = entry.completionQuery;
			editor.focus();
			editor.update(() => {
				let selection = $getSelection();
				if (!$isRangeSelection(selection)) {
					$getRoot().selectEnd();
					selection = $getSelection();
				}
				if (!$isRangeSelection(selection)) return;
				const anchorNode = selection.anchor.getNode();
				const offset = selection.anchor.offset;
				const previousChar = $isTextNode(anchorNode)
					? anchorNode.getTextContent()[offset - 1]
					: undefined;
				const needsSpace =
					(previousChar != null && !/\s/.test(previousChar)) ||
					(!$isTextNode(anchorNode) && offset > 0);
				selection.insertText(needsSpace ? ` @${completion}` : `@${completion}`);
			});
			return;
		}
		void entry.select(actionContextRef.current);
	};

	// Browse-mode keyboard: the editor may not be focused, so listen globally.
	useEffect(() => {
		if (!browseOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				const delta = event.key === "ArrowDown" ? 1 : -1;
				setBrowseIndex((previous) => {
					const count = browseEntries.length;
					return count === 0 ? 0 : (previous + delta + count) % count;
				});
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				const entry = browseEntries[browseIndex];
				if (entry) selectBrowseEntry(entry);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setBrowseOpen(false);
			}
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () =>
			window.removeEventListener("keydown", onKeyDown, { capture: true });
	});

	// Any pointer press outside the composer and its menus dismisses both
	// modes; a press on the editor itself closes browse (typing intent).
	useEffect(() => {
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (target && rootRef.current?.contains(target)) {
				if (
					target instanceof Element &&
					target.closest(".lexical-composer-editor")
				) {
					setBrowseOpen(false);
				}
				return;
			}
			setBrowseOpen(false);
			setTypeaheadDismissed(true);
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, []);

	const canSend = !isEmpty || attachments.length > 0;

	return (
		<div
			ref={rootRef}
			className={cn(
				"relative flex flex-col rounded-2xl bg-card ring-1 ring-border transition-shadow focus-within:ring-ring/40",
			)}
			onDragOver={(event) => {
				if (dropZone == null && event.dataTransfer.types.includes("Files")) {
					event.preventDefault();
					setDragging(true);
				}
			}}
			onDragLeave={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null))
					setDragging(false);
			}}
			onDrop={(event) => {
				// The editor's DROP_COMMAND handler may have consumed this already;
				// preventDefault marks it and the event still bubbles here. Inside a
				// layout ComposerDropZone the zone owns non-editor drops instead.
				if (
					dropZone == null &&
					!event.defaultPrevented &&
					event.dataTransfer.files.length > 0
				) {
					event.preventDefault();
					addFiles(event.dataTransfer.files);
				}
				setDragging(false);
			}}
		>
			<div
				ref={setMenuSlot}
				className={cn(
					"pointer-events-none absolute inset-x-0 [&>*]:pointer-events-auto",
					placement === "bottom" ? "top-full pt-2" : "bottom-full pb-2",
				)}
			>
				{browseOpen && (
					<MentionMenu
						sections={sections}
						selectedIndex={browseIndex}
						onHighlight={setBrowseIndex}
						onSelectionChange={onMentionHighlight}
						onSelect={selectBrowseEntry}
					/>
				)}
			</div>
			{panel && (
				<ComposerPanel
					title={panel.title}
					placement={placement}
					onClose={() => setPanel(null)}
				>
					{panel.render()}
				</ComposerPanel>
			)}
			<div
				aria-hidden={!dragging}
				className={cn(
					"pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/10 transition-opacity duration-150 motion-reduce:transition-none",
					dragging ? "opacity-100" : "opacity-0",
				)}
			>
				<span
					className={cn(
						"inline-flex items-center rounded-md border border-border/50 bg-secondary px-3 py-1 text-sm text-foreground shadow transition-transform duration-150 motion-reduce:transition-none",
						dragging ? "scale-100" : "scale-95",
					)}
				>
					Drop to attach
				</span>
			</div>
			<AttachmentPills
				attachments={attachments}
				onAttachmentClick={onAttachmentClick}
				onPreviewError={(id) =>
					setAttachments((previous) =>
						previous.map((entry) => {
							if (entry.id !== id || !entry.previewUrl) return entry;
							URL.revokeObjectURL(entry.previewUrl);
							return { ...entry, previewUrl: undefined };
						}),
					)
				}
				onRemove={(id) =>
					setAttachments((previous) =>
						previous.filter((entry) => {
							if (entry.id !== id) return true;
							releaseAttachment(entry);
							return false;
						}),
					)
				}
			/>
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
					onSelectOption={(option, nodeToReplace, closeMenu) =>
						selectMentionEntry(option.entry, nodeToReplace, closeMenu)
					}
					options={mentionOptions}
					triggerFn={(text) => matchToken(text, "@", false)}
					commandPriority={COMMAND_PRIORITY_HIGH}
					onClose={() => setMentionQuery(null)}
					menuRenderFn={(
						anchorElementRef,
						{ selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
					) =>
						anchorElementRef.current && menuSlot && !typeaheadDismissed
							? createPortal(
									<MentionMenu
										sections={sections}
										selectedIndex={selectedIndex}
										onHighlight={setHighlightedIndex}
										onSelectionChange={onMentionHighlight}
										onSelect={(entry) => {
											const option = mentionOptions.find(
												(candidate) => candidate.entry.id === entry.id,
											);
											if (option) selectOptionAndCleanUp(option);
										}}
									/>,
									menuSlot,
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
						anchorElementRef.current && menuSlot && commandOptions.length > 0
							? createPortal(
									<SuggestionListbox
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
									menuSlot,
								)
							: null
					}
				/>
			</div>
			<div className="flex min-h-12 items-center gap-1 px-3 pb-2.5">
				<ContextButton onClick={toggleBrowseMenu} />
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
				{toolbar}
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
