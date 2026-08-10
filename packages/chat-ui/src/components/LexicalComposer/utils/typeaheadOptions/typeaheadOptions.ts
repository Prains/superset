import { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import type { ComposerMentionEntry, LexicalComposerCommand } from "../../types";

export class MentionTypeaheadOption extends MenuOption {
	entry: ComposerMentionEntry;
	constructor(entry: ComposerMentionEntry) {
		super(entry.id);
		this.entry = entry;
	}
}

export class CommandTypeaheadOption extends MenuOption {
	command: LexicalComposerCommand;
	constructor(command: LexicalComposerCommand) {
		super(command.id);
		this.command = command;
	}
}
