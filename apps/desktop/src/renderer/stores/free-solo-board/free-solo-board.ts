import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/** Each card is a live xterm plus its own WebSocket, so this is a resource
 *  limit before it is a storage one — and it is what bounds the persisted
 *  key (apps/desktop/AGENTS.md).
 *  ponytail: flat cap, revisit only if someone actually hits it. */
export const MAX_CARDS = 16;

export const DEFAULT_CARD_WIDTH = 640;
export const DEFAULT_CARD_HEIGHT = 420;
export const MIN_CARD_WIDTH = 280;
export const MIN_CARD_HEIGHT = 160;

/** Offsets each new card so a burst of adds doesn't land in one pile. */
const CASCADE_STEP = 32;
const CASCADE_WRAP = 8;

export type CardMissingReason = "workspace" | "terminal";

export interface BoardCard {
	/** Stable across reloads: this is the `instanceId` in
	 *  terminalRuntimeRegistry, and a new one costs the card its scrollback. */
	id: string;
	workspaceId: string;
	terminalId: string;
	/** Card added as "new terminal": the WS attach spawns the session
	 *  host-side (`?create=1`) instead of an awaited mutation. */
	createOnAttach?: boolean;
	x: number;
	y: number;
	w: number;
	h: number;
	z: number;
	/** Set by reconciliation. Runtime-only — never persisted. */
	missing?: CardMissingReason;
}

export interface AddCardInput {
	workspaceId: string;
	terminalId: string;
	createOnAttach?: boolean;
}

interface FreeSoloBoardState {
	cards: BoardCard[];
	activeCardId: string | null;
	/** Returns the card id, or null when the cap is reached. A terminal
	 *  already on the board returns its existing card raised, never a
	 *  second view of one PTY. */
	addCard: (input: AddCardInput) => string | null;
	removeCard: (cardId: string) => void;
	moveCard: (cardId: string, x: number, y: number) => void;
	resizeCard: (cardId: string, w: number, h: number) => void;
	raiseCard: (cardId: string) => void;
	setActiveCard: (cardId: string | null) => void;
	setMissing: (missingByCardId: Record<string, CardMissingReason>) => void;
	/** Follows an agent auto-resume swapping the pane's terminal. */
	updateCardTerminal: (cardId: string, terminalId: string) => void;
}

/** Restored z values are only meaningful as an order; rewrite them as a dense
 *  0..n-1 sequence so they can't climb forever across sessions. */
export function normalizeZ<T extends { z: number }>(cards: T[]): T[] {
	const order = [...cards].sort((a, b) => a.z - b.z);
	const rank = new Map(order.map((card, index) => [card, index]));
	return cards.map((card) => ({ ...card, z: rank.get(card) ?? 0 }));
}

function topZ(cards: BoardCard[]): number {
	return cards.reduce((max, card) => Math.max(max, card.z), -1);
}

function cascade(count: number): { x: number; y: number } {
	const step = (count % CASCADE_WRAP) * CASCADE_STEP;
	return { x: step, y: step };
}

export const useFreeSoloBoardStore = create<FreeSoloBoardState>()(
	devtools(
		persist(
			(set, get) => ({
				cards: [],
				activeCardId: null,

				addCard: ({ workspaceId, terminalId, createOnAttach }) => {
					const { cards } = get();
					const existing = cards.find(
						(card) => card.terminalId === terminalId,
					);
					if (existing) {
						get().raiseCard(existing.id);
						return existing.id;
					}
					if (cards.length >= MAX_CARDS) return null;

					const id = crypto.randomUUID();
					const { x, y } = cascade(cards.length);
					set({
						cards: [
							...cards,
							{
								id,
								workspaceId,
								terminalId,
								createOnAttach,
								x,
								y,
								w: DEFAULT_CARD_WIDTH,
								h: DEFAULT_CARD_HEIGHT,
								z: topZ(cards) + 1,
							},
						],
						activeCardId: id,
					});
					return id;
				},

				removeCard: (cardId) =>
					set((state) => ({
						cards: state.cards.filter((card) => card.id !== cardId),
						activeCardId:
							state.activeCardId === cardId ? null : state.activeCardId,
					})),

				moveCard: (cardId, x, y) =>
					set((state) => ({
						cards: state.cards.map((card) =>
							card.id === cardId
								? { ...card, x: Math.max(0, x), y: Math.max(0, y) }
								: card,
						),
					})),

				resizeCard: (cardId, w, h) =>
					set((state) => ({
						cards: state.cards.map((card) =>
							card.id === cardId
								? {
										...card,
										w: Math.max(MIN_CARD_WIDTH, Math.round(w)),
										h: Math.max(MIN_CARD_HEIGHT, Math.round(h)),
									}
								: card,
						),
					})),

				raiseCard: (cardId) =>
					set((state) => {
						const next = topZ(state.cards) + 1;
						return {
							cards: state.cards.map((card) =>
								card.id === cardId ? { ...card, z: next } : card,
							),
							activeCardId: cardId,
						};
					}),

				setActiveCard: (cardId) => set({ activeCardId: cardId }),

				/** Agent auto-resume replaces a session with a resumed one and
				 *  writes the new id into the pane store; the card has to follow
				 *  or it keeps pointing at a terminal that no longer exists.
				 *  `createOnAttach` is cleared with it: it described the old id,
				 *  and the resumed session already exists. (The host ignores a
				 *  stale flag anyway — it honours create-on-attach only when no
				 *  session row exists at all — so this is hygiene, not a guard.) */
				updateCardTerminal: (cardId, terminalId) =>
					set((state) => ({
						cards: state.cards.map((card) =>
							card.id === cardId && card.terminalId !== terminalId
								? { ...card, terminalId, createOnAttach: undefined }
								: card,
						),
					})),

				setMissing: (missingByCardId) =>
					set((state) => ({
						cards: state.cards.map((card) => {
							const missing = missingByCardId[card.id];
							if (missing === card.missing) return card;
							const { missing: _dropped, ...rest } = card;
							return missing ? { ...rest, missing } : rest;
						}),
					})),
			}),
			{
				name: "free-solo-board",
				version: 1,
				// Focus is a per-session concern, and `missing` is recomputed on
				// every load — persisting either would restore a stale view.
				partialize: (state) => ({
					cards: state.cards.map(({ missing: _missing, ...card }) => card),
				}),
				// Restored z values only carry an order; rewrite them densely on
				// merge rather than mutating hydrated state in place.
				merge: (persisted, current) => ({
					...current,
					...(persisted as { cards?: BoardCard[] }),
					cards: normalizeZ(
						(persisted as { cards?: BoardCard[] })?.cards ?? [],
					),
				}),
			},
		),
		{ name: "free-solo-board" },
	),
);
