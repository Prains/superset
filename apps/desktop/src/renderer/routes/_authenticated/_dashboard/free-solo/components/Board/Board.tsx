import { Button } from "@superset/ui/button";
import { useFreeSoloBoardStore } from "renderer/stores/free-solo-board";

export function Board() {
	const cards = useFreeSoloBoardStore((state) => state.cards);
	const setActiveCard = useFreeSoloBoardStore((state) => state.setActiveCard);

	return (
		<div className="relative min-h-0 flex-1 overflow-auto bg-background">
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
					<Button className="pointer-events-auto" disabled>
						Add a terminal
					</Button>
				</div>
			) : (
				cards.map((card) => (
					<div
						key={card.id}
						className="absolute rounded-md border border-border bg-card p-2 text-xs"
						style={{
							left: card.x,
							top: card.y,
							width: card.w,
							height: card.h,
							zIndex: card.z,
						}}
					>
						{card.terminalId}
					</div>
				))
			)}
		</div>
	);
}
