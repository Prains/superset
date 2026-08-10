import { useEffect, useMemo, useRef, useState } from "react";
import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "../../types";

export type MentionSection = {
	providerId: string;
	label: string;
	entries: ComposerMentionEntry[];
	hint?: string;
};

function matchesQuery(entry: ComposerMentionEntry, query: string): boolean {
	if (!query) return true;
	const lowered = query.toLowerCase();
	if (entry.label.toLowerCase().includes(lowered)) return true;
	return (entry.keywords ?? []).some((keyword) =>
		keyword.toLowerCase().includes(lowered),
	);
}

export function useMentionSources(
	providers: ComposerMentionProvider[],
	menuOpen: boolean,
	query: string,
): MentionSection[] {
	const [staticEntries, setStaticEntries] = useState<
		Record<string, ComposerMentionEntry[]>
	>({});
	const [searchEntries, setSearchEntries] = useState<
		Record<string, ComposerMentionEntry[]>
	>({});
	const providersRef = useRef(providers);
	providersRef.current = providers;

	// Load static sources at mount and refresh them each time the menu opens;
	// cached entries stay visible while fresh ones load.
	useEffect(() => {
		if (!menuOpen && Object.keys(staticEntries).length > 0) return;
		const controller = new AbortController();
		for (const provider of providersRef.current) {
			if (provider.source.kind !== "static") continue;
			Promise.resolve(provider.source.load(controller.signal))
				.then((entries) => {
					if (controller.signal.aborted) return;
					setStaticEntries((previous) => ({
						...previous,
						[provider.id]: entries,
					}));
				})
				.catch(() => {});
		}
		return () => controller.abort();
		// staticEntries intentionally omitted: it gates the initial mount load only.
		// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	}, [menuOpen]);

	// Search sources fire per keystroke; aborting the previous request replaces
	// debouncing.
	useEffect(() => {
		if (!menuOpen) return;
		const controller = new AbortController();
		for (const provider of providersRef.current) {
			if (provider.source.kind !== "search") continue;
			if (query === "") {
				setSearchEntries((previous) => ({ ...previous, [provider.id]: [] }));
				continue;
			}
			provider.source
				.search(query, controller.signal)
				.then((entries) => {
					if (controller.signal.aborted) return;
					setSearchEntries((previous) => ({
						...previous,
						[provider.id]: entries,
					}));
				})
				.catch(() => {});
		}
		return () => controller.abort();
	}, [menuOpen, query]);

	return useMemo(() => {
		const sections: MentionSection[] = [];
		const sorted = [...providers].sort(
			(a, b) => a.section.priority - b.section.priority,
		);
		for (const provider of sorted) {
			if (provider.source.kind === "static") {
				const entries = (staticEntries[provider.id] ?? []).filter((entry) =>
					matchesQuery(entry, query),
				);
				if (entries.length > 0) {
					sections.push({
						providerId: provider.id,
						label: provider.section.label,
						entries,
					});
				}
			} else {
				const entries = query === "" ? [] : (searchEntries[provider.id] ?? []);
				if (entries.length > 0) {
					sections.push({
						providerId: provider.id,
						label: provider.section.label,
						entries,
					});
				} else if (query === "") {
					sections.push({
						providerId: provider.id,
						label: provider.section.label,
						entries: [],
						hint: provider.source.hint,
					});
				}
			}
		}
		return sections;
	}, [providers, staticEntries, searchEntries, query]);
}
