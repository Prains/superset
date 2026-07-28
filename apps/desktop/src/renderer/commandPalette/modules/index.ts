import { registerProvider } from "../core/registry";
import { actionsProvider } from "./actions/commands";
import { addProjectProvider } from "./addProject/commands";
import { navigationProvider } from "./navigation/commands";
import { openInProvider } from "./openIn/commands";
import { resourcesProvider } from "./resources/commands";
import { workspaceProvider } from "./workspace/commands";

export function registerAllModules(): () => void {
	const unregisters = [
		registerProvider(workspaceProvider),
		registerProvider(actionsProvider),
		registerProvider(resourcesProvider),
		registerProvider(openInProvider),
		registerProvider(navigationProvider),
		registerProvider(addProjectProvider),
	];
	return () => {
		for (const u of unregisters) u();
	};
}
