import { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import type {
	LexicalComposerCommand,
	LexicalComposerMentionItem,
} from "../../types";

export class MentionTypeaheadOption extends MenuOption {
	item: LexicalComposerMentionItem;
	constructor(item: LexicalComposerMentionItem) {
		super(item.id);
		this.item = item;
	}
}

export class CommandTypeaheadOption extends MenuOption {
	command: LexicalComposerCommand;
	constructor(command: LexicalComposerCommand) {
		super(command.id);
		this.command = command;
	}
}
