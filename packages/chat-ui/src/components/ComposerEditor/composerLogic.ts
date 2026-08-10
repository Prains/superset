export type ComposerChipKind = "file" | "skill";

export type ComposerMentionItem = {
	id: string;
	label: string;
	kind: ComposerChipKind;
	brandColor?: string;
};

export type ComposerTrigger = {
	kind: ComposerChipKind;
	query: string;
	rangeStart: number;
	rangeEnd: number;
};

export const CHIP_TRIGGERS: Record<string, ComposerChipKind> = {
	"@": "file",
	$: "skill",
};

export function chipPrefix(kind: ComposerChipKind): string {
	return kind === "file" ? "@" : "$";
}

export function serializeChip(kind: ComposerChipKind, label: string): string {
	return `${chipPrefix(kind)}${label}`;
}

export function detectComposerTrigger(
	text: string,
	cursor: number,
): ComposerTrigger | null {
	const before = text.slice(0, cursor);
	const match = /(^|\s)([@$])([\w./:-]*)$/.exec(before);
	if (!match) return null;
	const trigger = match[2];
	const kind = trigger ? CHIP_TRIGGERS[trigger] : undefined;
	if (!kind) return null;
	const query = match[3] ?? "";
	return {
		kind,
		query,
		rangeStart: cursor - query.length - 1,
		rangeEnd: cursor,
	};
}

export function filterMentionItems(
	items: ComposerMentionItem[],
	kind: ComposerChipKind,
	query: string,
	limit = 8,
): ComposerMentionItem[] {
	const lowered = query.toLowerCase();
	return items
		.filter(
			(item) =>
				item.kind === kind && item.label.toLowerCase().includes(lowered),
		)
		.slice(0, limit);
}
