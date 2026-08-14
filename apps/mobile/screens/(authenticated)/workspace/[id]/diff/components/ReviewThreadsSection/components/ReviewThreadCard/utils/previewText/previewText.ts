// Review bots (coderabbit, greptile, cubic) open with a badge strip —
// "_🩺 Stability & Availability_ | _🟠 Major_ | _⚡ Quick win_" — and bury the
// reasoning in a <details> block. Neither says what the comment wants.
const BADGE_STRIP = /^\s*(?:_[^_]*_\s*\|\s*)+_[^_]*_\s*$/;
const BADGE_WORDS =
	/^(potential issue|nitpick|major|minor|critical|quick win|suggestion|refactor suggestion|verification agent)\b/i;

/**
 * Plain-text preview of a markdown comment body: enough to recognise the
 * comment in a collapsed card, with bot badge strips, `<details>` reasoning,
 * fenced code and images dropped.
 */
export function previewText(body: string): string {
	const kept: string[] = [];
	for (const line of body.split(/\r?\n/)) {
		if (BADGE_STRIP.test(line)) continue;
		const text = line
			.replace(/<details>[\s\S]*/g, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
			.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/[*_`>#]/g, "")
			.replace(/\s+/g, " ")
			.trim();
		if (!text) continue;
		if (BADGE_WORDS.test(text.replace(/^[^\p{L}\p{N}]+/u, ""))) continue;
		kept.push(text);
		if (kept.length === 3) break;
	}
	return kept.join(" ") || "No preview available";
}
