import { Button } from "@superset/ui/button";
import { useState } from "react";
import { HiPlus } from "react-icons/hi2";
import {
	MAX_CARDS,
	useFreeSoloBoardStore,
} from "renderer/stores/free-solo-board";
import { BoardCard } from "../BoardCard";
import { AddCardDialog } from "./components/AddCardDialog";
import { BoardCardTitle } from "./components/BoardCardTitle";
import { BoardTerminal } from "./components/BoardTerminal";

const FULL_REASON = `The board is full (max ${MAX_CARDS} cards) — remove a card to add another.`;

export function Board() {
	const cards = useFreeSoloBoardStore((state) => state.cards);
	const setActiveCard = useFreeSoloBoardStore((state) => state.setActiveCard);
	const [isAdding, setIsAdding] = useState(false);
	const isFull = cards.length >= MAX_CARDS;

	return (
		<div className="relative min-h-0 flex-1 bg-background">
			{/* The scroller owns the cards' coordinate space; `isolate` keeps
			    their z-index stacking contained so the pinned "+" button below —
			    outside the scroller, un-scrolled, un-stacked-on — always stays on
			    top instead of getting buried under a raised card. */}
			<div className="absolute inset-0 isolate overflow-auto">
				{/* Clicking the board itself drops focus, so global hotkeys aren't
				    swallowed by whichever terminal was last active. */}
				<button
					type="button"
					aria-label="Deselect card"
					tabIndex={-1}
					className="absolute inset-0 h-full w-full cursor-default"
					onClick={() => setActiveCard(null)}
				/>
				{cards.length === 0 ? (
					<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
						<p className="text-sm text-muted-foreground">
							Put any terminal from any project here.
						</p>
						{/* A disabled button gets `pointer-events: none` and never fires a
						    hover, so the title-explains-why contract has to live on a span
						    wrapping it instead. */}
						<span
							className="pointer-events-auto"
							title={isFull ? FULL_REASON : undefined}
						>
							<Button disabled={isFull} onClick={() => setIsAdding(true)}>
								Add a terminal
							</Button>
						</span>
					</div>
				) : (
					cards.map((card) => (
						<BoardCard
							key={card.id}
							card={card}
							title={<BoardCardTitle card={card} />}
						>
							<BoardTerminal card={card} />
						</BoardCard>
					))
				)}
			</div>
			{/* Same pointer-events-none-on-disabled issue as the empty-state
			    button above: the title lives on this span, not the Button. */}
			<span
				className="absolute right-3 top-3"
				title={isFull ? FULL_REASON : "Add a terminal"}
			>
				<Button
					variant="outline"
					size="icon"
					aria-label="Add a terminal"
					disabled={isFull}
					onClick={() => setIsAdding(true)}
				>
					<HiPlus className="size-4" />
				</Button>
			</span>
			<AddCardDialog open={isAdding} onOpenChange={setIsAdding} />
		</div>
	);
}
