"use client";

import { cn } from "@superset/ui/utils";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

type DropZoneContextValue = {
	register(sink: (files: FileList) => void): () => void;
};

const ComposerDropZoneContext = createContext<DropZoneContextValue | null>(
	null,
);

export function useComposerDropZone(): DropZoneContextValue | null {
	return useContext(ComposerDropZoneContext);
}

export type ComposerDropZoneProps = {
	children: ReactNode;
	label?: string;
	className?: string;
};

/**
 * Layout-level file drop target: mount around the whole content area (like the
 * new-workspace screen) and any composer rendered inside registers itself as
 * the drop sink automatically.
 */
export function ComposerDropZone({
	children,
	label = "Drop files to attach",
	className,
}: ComposerDropZoneProps) {
	const sinkRef = useRef<((files: FileList) => void) | null>(null);
	// dragover + timeout reset instead of an enter/leave counter, so
	// Esc-cancelled drags and drops outside the window can't wedge the overlay.
	const [isDraggingFiles, setIsDraggingFiles] = useState(false);

	useEffect(() => {
		let timer: number | null = null;
		const onDragOver = (event: DragEvent) => {
			if (!Array.from(event.dataTransfer?.types ?? []).includes("Files"))
				return;
			setIsDraggingFiles(true);
			if (timer !== null) window.clearTimeout(timer);
			timer = window.setTimeout(() => setIsDraggingFiles(false), 200);
		};
		const onDrop = () => {
			if (timer !== null) window.clearTimeout(timer);
			timer = null;
			setIsDraggingFiles(false);
		};
		document.addEventListener("dragover", onDragOver);
		document.addEventListener("drop", onDrop);
		return () => {
			document.removeEventListener("dragover", onDragOver);
			document.removeEventListener("drop", onDrop);
			if (timer !== null) window.clearTimeout(timer);
		};
	}, []);

	const contextValue = useMemo<DropZoneContextValue>(
		() => ({
			register(sink) {
				sinkRef.current = sink;
				return () => {
					if (sinkRef.current === sink) sinkRef.current = null;
				};
			},
		}),
		[],
	);

	return (
		<ComposerDropZoneContext.Provider value={contextValue}>
			<div
				className={cn("relative", className)}
				onDragOver={(event) => {
					if (event.dataTransfer.types.includes("Files"))
						event.preventDefault();
				}}
				onDrop={(event) => {
					// The composer's editor may have consumed this already;
					// preventDefault marks it and the event still bubbles here.
					if (event.defaultPrevented) return;
					if (event.dataTransfer.files.length === 0) return;
					event.preventDefault();
					sinkRef.current?.(event.dataTransfer.files);
				}}
			>
				{children}
				{isDraggingFiles && (
					<div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-primary/5 ring-2 ring-primary ring-inset">
						<span className="rounded-lg bg-background/90 px-3 py-1.5 text-sm font-medium text-primary shadow-sm">
							{label}
						</span>
					</div>
				)}
			</div>
		</ComposerDropZoneContext.Provider>
	);
}
