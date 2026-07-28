import { HiOutlineCpuChip } from "react-icons/hi2";
import type { CommandProvider } from "../../core/types";
import { ResourcesFrame } from "../../ui/ResourcesFrame";

export const resourcesProvider: CommandProvider = {
	id: "resources",
	provide: () => [
		{
			id: "resources.check",
			title: "Check resources",
			section: "actions",
			icon: HiOutlineCpuChip,
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
		},
	],
};
