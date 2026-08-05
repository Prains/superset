import { Fragment, type ReactNode } from "react";
import { splitSearchTerms } from "../../utils/settings-search";

interface HighlightTextProps {
	text: string;
	query: string;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function HighlightText({ text, query }: HighlightTextProps): ReactNode {
	const terms = splitSearchTerms(query);
	if (terms.length === 0) return text;

	const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
	const parts = text.split(pattern);
	if (parts.length === 1) return text;

	return (
		<Fragment>
			{parts.map((part, i) =>
				// split() with a single capturing group alternates unmatched text
				// (even indices) and matched terms (odd indices).
				i % 2 === 1 ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: parts come from a stable split of static text
					<mark key={i} className="rounded-sm bg-highlight-match text-inherit">
						{part}
					</mark>
				) : part ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: parts come from a stable split of static text
					<Fragment key={i}>{part}</Fragment>
				) : null,
			)}
		</Fragment>
	);
}
