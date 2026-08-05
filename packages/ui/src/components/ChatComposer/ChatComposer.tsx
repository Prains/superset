"use client";

import { ArrowUpIcon, PlusIcon, SquareIcon } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { isEnterSubmit } from "../../lib/keyboard";
import { cn } from "../../lib/utils";

export type ChatComposerStatus = "ready" | "streaming";

export type ChatComposerProps = {
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	onSubmit?: (value: string) => void;
	onStop?: () => void;
	onAttach?: () => void;
	status?: ChatComposerStatus;
	placeholder?: string;
	focusShortcut?: boolean;
	toolbar?: ReactNode;
	autoFocus?: boolean;
	disabled?: boolean;
	className?: string;
};

const MAX_HEIGHT = 192;

function isMacPlatform() {
	return (
		typeof navigator !== "undefined" &&
		navigator.platform.toUpperCase().includes("MAC")
	);
}

export function ChatComposer({
	value: controlledValue,
	defaultValue = "",
	onValueChange,
	onSubmit,
	onStop,
	onAttach,
	status = "ready",
	placeholder = "Ask to make changes, @mention files, run /commands",
	focusShortcut = true,
	toolbar,
	autoFocus,
	disabled,
	className,
}: ChatComposerProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
	const [focused, setFocused] = useState(false);
	const value = controlledValue ?? uncontrolledValue;
	const canSend = !disabled && value.trim().length > 0;

	const setValue = (next: string) => {
		if (controlledValue === undefined) setUncontrolledValue(next);
		onValueChange?.(next);
	};

	useLayoutEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
	}, []);

	useEffect(() => {
		if (!focusShortcut) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.key.toLowerCase() === "l" &&
				(event.metaKey || event.ctrlKey) &&
				!event.shiftKey &&
				!event.altKey
			) {
				event.preventDefault();
				textareaRef.current?.focus();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [focusShortcut]);

	const submit = () => {
		const trimmed = value.trim();
		if (!trimmed || disabled || status === "streaming") return;
		onSubmit?.(trimmed);
		if (controlledValue === undefined) setUncontrolledValue("");
	};

	const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
		if (isEnterSubmit(event)) {
			event.preventDefault();
			submit();
		}
	};

	const showFocusHint = focusShortcut && !focused;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: click-to-focus convenience; the textarea is the interactive element
		<div
			className={cn(
				"flex flex-col rounded-2xl bg-card ring-1 ring-border transition-shadow focus-within:ring-ring/40",
				className,
			)}
			onClick={(event) => {
				if (event.target === event.currentTarget) textareaRef.current?.focus();
			}}
		>
			<div className="relative">
				<textarea
					ref={textareaRef}
					value={value}
					rows={1}
					// biome-ignore lint/a11y/noAutofocus: opt-in via prop, standard for composers
					autoFocus={autoFocus}
					disabled={disabled}
					placeholder={placeholder}
					className="w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-base text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
					style={{ maxHeight: MAX_HEIGHT }}
					onChange={(event) => {
						setValue(event.target.value);
						const textarea = event.target;
						textarea.style.height = "auto";
						textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
					}}
					onKeyDown={handleKeyDown}
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
				/>
				{showFocusHint && (
					<span className="pointer-events-none absolute top-3.5 right-4 text-sm text-muted-foreground/60">
						{isMacPlatform() ? "⌘L" : "Ctrl L"} to focus
					</span>
				)}
			</div>
			<div className="flex min-h-14 items-center gap-1 px-3 pb-2.5">
				<div className="flex min-w-0 flex-1 items-center gap-1">{toolbar}</div>
				{onAttach && (
					<button
						type="button"
						aria-label="Add attachment"
						disabled={disabled}
						onClick={onAttach}
						className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
					>
						<PlusIcon className="size-4.5" />
					</button>
				)}
				{status === "streaming" ? (
					<button
						type="button"
						aria-label="Stop response"
						onClick={onStop}
						className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80"
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
							"flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
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
