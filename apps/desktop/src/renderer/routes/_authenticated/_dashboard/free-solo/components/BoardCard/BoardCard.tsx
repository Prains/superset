import { cn } from "@superset/ui/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { HiXMark } from "react-icons/hi2";
import {
	type BoardCard as BoardCardModel,
	MIN_CARD_HEIGHT,
	MIN_CARD_WIDTH,
	useFreeSoloBoardStore,
} from "renderer/stores/free-solo-board";
import { type DragOrigin, dragPosition } from "./geometry";

interface BoardCardProps {
	card: BoardCardModel;
	title: ReactNode;
	children: ReactNode;
}

export function BoardCard({ card, title, children }: BoardCardProps) {
	const isActive = useFreeSoloBoardStore(
		(state) => state.activeCardId === card.id,
	);
	const raiseCard = useFreeSoloBoardStore((state) => state.raiseCard);
	const removeCard = useFreeSoloBoardStore((state) => state.removeCard);
	const moveCard = useFreeSoloBoardStore((state) => state.moveCard);
	const resizeCard = useFreeSoloBoardStore((state) => state.resizeCard);

	// Drag lives in local state so a gesture is one store write, not one per
	// pointer event — every write hits localStorage through `persist`.
	const dragOriginRef = useRef<DragOrigin | null>(null);
	const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
		null,
	);

	const sizedRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const element = sizedRef.current;
		if (!element) return;
		// The native resize grip has no event of its own; observe the box it
		// changes and persist the settled size. The observed element must be
		// the SAME element that carries the width/height style, or the
		// observation feeds back into a shrink loop: outer − chrome → body →
		// smaller outer → …
		const observer = new ResizeObserver(() => {
			const { width, height } = element.getBoundingClientRect();
			if (width < 1 || height < 1) return;
			resizeCard(card.id, width, height);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [card.id, resizeCard]);

	const position = dragOffset ?? { x: card.x, y: card.y };

	return (
		<div
			ref={sizedRef}
			className={cn(
				// `resize` needs a non-visible overflow. This element owns both the
				// size style and the ResizeObserver — see the effect above.
				"absolute flex resize flex-col overflow-hidden rounded-lg border bg-card shadow-sm",
				isActive ? "border-border-selected" : "border-border",
			)}
			style={{
				left: position.x,
				top: position.y,
				width: card.w,
				height: card.h,
				minWidth: MIN_CARD_WIDTH,
				minHeight: MIN_CARD_HEIGHT,
				zIndex: card.z,
			}}
			onPointerDownCapture={() => raiseCard(card.id)}
		>
			<div
				className="flex shrink-0 cursor-grab items-center gap-2 border-b border-border px-2 py-1 active:cursor-grabbing"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					dragOriginRef.current = {
						x: card.x,
						y: card.y,
						pointerX: event.clientX,
						pointerY: event.clientY,
					};
				}}
				onPointerMove={(event) => {
					const origin = dragOriginRef.current;
					if (!origin) return;
					setDragOffset(
						dragPosition(origin, {
							pointerX: event.clientX,
							pointerY: event.clientY,
						}),
					);
				}}
				onPointerUp={(event) => {
					const origin = dragOriginRef.current;
					dragOriginRef.current = null;
					event.currentTarget.releasePointerCapture(event.pointerId);
					if (!origin) return;
					const next = dragPosition(origin, {
						pointerX: event.clientX,
						pointerY: event.clientY,
					});
					setDragOffset(null);
					moveCard(card.id, next.x, next.y);
				}}
			>
				<div className="min-w-0 flex-1">{title}</div>
				<button
					type="button"
					aria-label="Remove card"
					className="rounded p-0.5 text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					onClick={() => removeCard(card.id)}
				>
					<HiXMark className="size-3.5" />
				</button>
			</div>
			{/* Bottom padding keeps the resize corner as the card's own, so the
			    grip isn't buried under xterm's screen. */}
			<div className="min-h-0 flex-1 overflow-hidden p-1 pb-3">{children}</div>
		</div>
	);
}
