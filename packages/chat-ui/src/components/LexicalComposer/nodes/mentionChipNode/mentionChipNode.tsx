import {
	DecoratorNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread,
} from "lexical";
import type { JSX } from "react";
import type { ComposerChip } from "../../types";

export type SerializedMentionChipNode = Spread<
	{
		label: string;
		serialized: string;
		brandColor: string | null;
		dataJson: string | null;
	},
	SerializedLexicalNode
>;

export class MentionChipNode extends DecoratorNode<JSX.Element> {
	__label: string;
	__serialized: string;
	__brandColor: string | null;
	__dataJson: string | null;

	static getType(): string {
		return "mention-chip";
	}

	static clone(node: MentionChipNode): MentionChipNode {
		return new MentionChipNode(
			node.__label,
			node.__serialized,
			node.__brandColor,
			node.__dataJson,
			node.__key,
		);
	}

	constructor(
		label: string,
		serialized: string,
		brandColor: string | null,
		dataJson: string | null,
		key?: NodeKey,
	) {
		super(key);
		this.__label = label;
		this.__serialized = serialized;
		this.__brandColor = brandColor;
		this.__dataJson = dataJson;
	}

	static fromChip(chip: ComposerChip): MentionChipNode {
		return new MentionChipNode(
			chip.label,
			chip.serialized,
			chip.brandColor ?? null,
			chip.data === undefined ? null : JSON.stringify(chip.data),
		);
	}

	toChip(): ComposerChip {
		return {
			label: this.__label,
			serialized: this.__serialized,
			brandColor: this.__brandColor ?? undefined,
			data: this.__dataJson == null ? undefined : JSON.parse(this.__dataJson),
		};
	}

	static importJSON(serialized: SerializedMentionChipNode): MentionChipNode {
		return new MentionChipNode(
			serialized.label,
			serialized.serialized,
			serialized.brandColor,
			serialized.dataJson,
		);
	}

	exportJSON(): SerializedMentionChipNode {
		return {
			...super.exportJSON(),
			type: "mention-chip",
			label: this.__label,
			serialized: this.__serialized,
			brandColor: this.__brandColor,
			dataJson: this.__dataJson,
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
		return this.__serialized;
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
