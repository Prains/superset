import {
	DecoratorNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread,
} from "lexical";
import type { JSX } from "react";

export type SerializedMentionChipNode = Spread<
	{ label: string; brandColor: string | null },
	SerializedLexicalNode
>;

export class MentionChipNode extends DecoratorNode<JSX.Element> {
	__label: string;
	__brandColor: string | null;

	static getType(): string {
		return "mention-chip";
	}

	static clone(node: MentionChipNode): MentionChipNode {
		return new MentionChipNode(node.__label, node.__brandColor, node.__key);
	}

	constructor(label: string, brandColor: string | null, key?: NodeKey) {
		super(key);
		this.__label = label;
		this.__brandColor = brandColor;
	}

	static importJSON(serialized: SerializedMentionChipNode): MentionChipNode {
		return new MentionChipNode(serialized.label, serialized.brandColor);
	}

	exportJSON(): SerializedMentionChipNode {
		return {
			...super.exportJSON(),
			type: "mention-chip",
			label: this.__label,
			brandColor: this.__brandColor,
		};
	}

	createDOM(): HTMLElement {
		return document.createElement("span");
	}

	updateDOM(): boolean {
		return false;
	}

	isInline(): boolean {
		return true;
	}

	getTextContent(): string {
		return `@${this.__label}`;
	}

	decorate(): JSX.Element {
		return (
			<span
				className="lexical-composer-chip"
				data-mention-chip="true"
				style={
					this.__brandColor
						? ({ "--chip-color": this.__brandColor } as React.CSSProperties)
						: undefined
				}
			>
				{this.__label}
			</span>
		);
	}
}
