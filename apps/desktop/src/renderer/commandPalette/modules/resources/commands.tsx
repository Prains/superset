import { HiOutlineCpuChip } from "react-icons/hi2";
import type { Command, CommandProvider } from "../../core/types";
import { ResourcesFrame } from "../../ui/ResourcesFrame";

/** Exported so the CHECK_RESOURCES hotkey can push this frame directly. */
export const checkResourcesCommand: Command = {
	id: "resources.check",
	title: "Check resources",
	section: "actions",
	icon: HiOutlineCpuChip,
	hotkeyId: "CHECK_RESOURCES",
	keywords: [
		"resources",
		"memory",
		"cpu",
		"ram",
		"usage",
		"performance",
		"monitor",
		"activity",
		"processes",
	],
	renderFrame: () => <ResourcesFrame />,
};

export const resourcesProvider: CommandProvider = {
	id: "resources",
	provide: () => [checkResourcesCommand],
};
