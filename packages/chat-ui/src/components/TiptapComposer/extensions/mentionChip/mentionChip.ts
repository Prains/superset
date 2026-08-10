import { mergeAttributes, Node } from "@tiptap/core";

export const MentionChip = Node.create({
	name: "mentionChip",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	addAttributes() {
		return { label: { default: "" }, brandColor: { default: null } };
	},
	parseHTML() {
		return [{ tag: "span[data-mention-chip]" }];
	},
	renderHTML({ node }) {
		return [
			"span",
			mergeAttributes({
				"data-mention-chip": "true",
				class: "tiptap-composer-chip",
				style: node.attrs.brandColor
					? `--chip-color:${node.attrs.brandColor}`
					: undefined,
			}),
			node.attrs.label,
		];
	},
	renderText({ node }) {
		return `@${node.attrs.label}`;
	},
});
