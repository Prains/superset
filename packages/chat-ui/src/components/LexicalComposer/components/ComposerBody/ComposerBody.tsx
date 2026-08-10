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
	COMMAND_PRIORITY_HIGH,
	COMMAND_PRIORITY_LOW,
	DROP_COMMAND,
	KEY_ENTER_COMMAND,
	PASTE_COMMAND,
} from "lexical";
import {
	ArrowUpIcon,
	FileCode2Icon,
	SlashSquareIcon,
	SquareIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import type {
	LexicalComposerAttachment,
	LexicalComposerProps,
} from "../../types";
import { matchToken } from "../../utils/matchToken";
import {
	CommandTypeaheadOption,
	MentionTypeaheadOption,
} from "../../utils/typeaheadOptions";
import { AttachmentPills } from "../AttachmentPills";
import { PlusMenu } from "../PlusMenu";
import { SuggestionListbox } from "../SuggestionListbox";

const MAX_SUGGESTIONS = 8;

export type ComposerBodyProps = Required<
	Pick<LexicalComposerProps, "placeholder" | "status">
> &
	Pick<
		LexicalComposerProps,
		"mentionItems" | "commands" | "onSubmit" | "onStop"
	>;

export function ComposerBody({
	placeholder,
	mentionItems,
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
									<SuggestionListbox
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
									anchorElementRef.current,
								)
							: null
					}
				/>
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
		</div>
	);
}
