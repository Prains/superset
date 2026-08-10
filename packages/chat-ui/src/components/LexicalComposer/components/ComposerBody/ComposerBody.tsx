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
import { MentionMenu } from "../MentionMenu";
import { PlusMenu } from "../PlusMenu";
import { SuggestionListbox } from "../SuggestionListbox";

const MAX_COMMAND_SUGGESTIONS = 8;

export type ComposerBodyProps = Required<
	Pick<LexicalComposerProps, "placeholder" | "status">
> &
	Pick<
		LexicalComposerProps,
		"mentionProviders" | "commands" | "onSubmit" | "onStop"
	>;

function $insertChipAtSelection(chip: ComposerChip) {
	const selection = $getSelection();
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
	onSubmit,
	onStop,
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
	const fileInputRef = useRef<HTMLInputElement>(null);
	const closeMenuRef = useRef<() => void>(() => {});
	// Lexical command listeners register once; this ref bridges them to live React state.
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

	const actionContext: ComposerActionContext = {
		insertChip: (chip) => {
			editor.update(() => $insertChipAtSelection(chip));
		},
		attachFiles: () => fileInputRef.current?.click(),
		openPanel: setPanel,
		closeMenu: () => closeMenuRef.current(),
		query: mentionQuery ?? "",
	};
	const actionContextRef = useRef(actionContext);
	actionContextRef.current = actionContext;

	const sections = useMentionSources(
		mentionProviders ?? [],
		mentionQuery != null,
		mentionQuery ?? "",
	);
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
		closeMenuRef.current = closeMenu;
		editor.update(() => {
			if (entry.action.type === "insert-chip") {
				const chipNode = MentionChipNode.fromChip(entry.action.chip);
				const space = $createTextNode(" ");
				if (nodeToReplace) {
					nodeToReplace.replace(chipNode);
					chipNode.insertAfter(space);
					space.select(1, 1);
				} else {
					$insertChipAtSelection(entry.action.chip);
				}
			} else {
				nodeToReplace?.remove();
			}
			closeMenu();
		});
		if (entry.action.type === "run") {
			void entry.action.run(actionContextRef.current);
		}
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
		setAttachments([]);
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
			<div
				ref={setMenuSlot}
				className="pointer-events-none absolute inset-x-0 bottom-full [&>*]:pointer-events-auto"
			/>
			{panel && (
				<ComposerPanel title={panel.title} onClose={() => setPanel(null)}>
					{panel.render()}
				</ComposerPanel>
			)}
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
						anchorElementRef.current && menuSlot
							? createPortal(
									<MentionMenu
										sections={sections}
										selectedIndex={selectedIndex}
										onHighlight={setHighlightedIndex}
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
				<PlusMenu onFiles={addFiles} fileInputRef={fileInputRef} />
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
