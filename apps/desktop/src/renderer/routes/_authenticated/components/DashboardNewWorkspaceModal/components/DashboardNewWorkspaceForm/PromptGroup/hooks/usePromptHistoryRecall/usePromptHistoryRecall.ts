import { useRef } from "react";
import { usePromptHistoryStore } from "renderer/stores/prompt-history";

interface UsePromptHistoryRecallOptions {
	currentPrompt: string;
	/** Replace the composer content, placing the caret at the given edge. */
	applyPrompt: (prompt: string, caret: "start" | "end") => void;
}

/**
 * Shell-style prompt recall for the workspace composer: ArrowUp at the doc
 * start walks back through prompt history, ArrowDown at the doc end walks
 * forward again (ending on an empty composer). Any manual edit breaks the
 * cycle because the content no longer matches the last recalled entry.
 */
export function usePromptHistoryRecall({
	currentPrompt,
	applyPrompt,
}: UsePromptHistoryRecallOptions) {
	const indexRef = useRef<number | null>(null);
	const lastRecalledRef = useRef<string | null>(null);
	const currentPromptRef = useRef(currentPrompt);
	currentPromptRef.current = currentPrompt;
	const applyPromptRef = useRef(applyPrompt);
	applyPromptRef.current = applyPrompt;

	const recall = (index: number): boolean => {
		const entry = usePromptHistoryStore.getState().entries[index];
		if (!entry) return false;
		indexRef.current = index;
		lastRecalledRef.current = entry.prompt;
		// Caret at the start so the next ArrowUp cycles straight to the
		// next-older entry without traversing a multi-line prompt.
		applyPromptRef.current(entry.prompt, "start");
		return true;
	};

	const onArrowUpAtStart = (): boolean => {
		const current = currentPromptRef.current;
		if (!current.trim()) return recall(0);
		if (indexRef.current !== null && current === lastRecalledRef.current) {
			return recall(indexRef.current + 1);
		}
		return false;
	};

	const onArrowDownAtEnd = (): boolean => {
		const current = currentPromptRef.current;
		if (indexRef.current === null || current !== lastRecalledRef.current) {
			return false;
		}
		if (indexRef.current === 0) {
			indexRef.current = null;
			lastRecalledRef.current = null;
			applyPromptRef.current("", "start");
			return true;
		}
		return recall(indexRef.current - 1);
	};

	return { onArrowUpAtStart, onArrowDownAtEnd };
}
