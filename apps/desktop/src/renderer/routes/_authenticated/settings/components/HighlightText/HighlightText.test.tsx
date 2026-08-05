import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HighlightText } from "./HighlightText";

describe("HighlightText", () => {
	it("returns plain text unchanged when the query is empty", () => {
		const markup = renderToStaticMarkup(
			<HighlightText text="Branch prefix" query="" />,
		);
		expect(markup).toBe("Branch prefix");
	});

	it("returns plain text unchanged when whitespace-only", () => {
		const markup = renderToStaticMarkup(
			<HighlightText text="Branch prefix" query="   " />,
		);
		expect(markup).toBe("Branch prefix");
	});

	it("wraps a single matching term in a mark", () => {
		const markup = renderToStaticMarkup(
			<HighlightText text="Branch prefix" query="branch" />,
		);
		expect(markup).toBe(
			'<mark class="rounded-sm bg-highlight-match text-inherit">Branch</mark> prefix',
		);
	});

	it("is case-insensitive", () => {
		const markup = renderToStaticMarkup(
			<HighlightText text="Branch prefix" query="PREFIX" />,
		);
		expect(markup).toContain(
			'<mark class="rounded-sm bg-highlight-match text-inherit">prefix</mark>',
		);
	});

	it("highlights each of multiple terms independently", () => {
		const markup = renderToStaticMarkup(
			<HighlightText text="Branch prefix" query="branch prefix" />,
		);
		expect(markup).toBe(
			'<mark class="rounded-sm bg-highlight-match text-inherit">Branch</mark> <mark class="rounded-sm bg-highlight-match text-inherit">prefix</mark>',
		);
	});

	it("leaves text unchanged when no term matches", () => {
		const markup = renderToStaticMarkup(
			<HighlightText text="Branch prefix" query="worktree" />,
		);
		expect(markup).toBe("Branch prefix");
	});

	it("does not treat regex metacharacters in the query as regex syntax", () => {
		const markup = renderToStaticMarkup(
			<HighlightText text="Wait 5s (approx.)" query="5s (approx.)" />,
		);
		expect(markup).toBe(
			'Wait <mark class="rounded-sm bg-highlight-match text-inherit">5s</mark> <mark class="rounded-sm bg-highlight-match text-inherit">(approx.)</mark>',
		);
	});
});
