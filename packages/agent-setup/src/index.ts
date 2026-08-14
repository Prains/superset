import fs from "node:fs";
import {
	runSetupAction,
	setupAgentCapabilities,
	setupSingleAgent,
	teardownSingleAgent,
} from "./agent-setup";
import {
	getBashDir,
	getBinDir,
	getHooksDir,
	getOpenCodePluginDir,
	getZshDir,
} from "./paths";
import {
	createBashWrapper,
	createZshWrapper,
	getCommandShellArgs,
	getShellArgs,
	getShellEnv,
} from "./shell-wrappers";

/**
 * Provisions everything Superset manages in the user's environment for the
 * supported terminal agents: lifecycle hooks, binary wrappers, shell
 * integration, and the managed skills plugin. Agents in
 * `options.disabledAgentIds` get their global-config footprint removed
 * instead. Runs on every host that serves terminals — the Electron main
 * process and the standalone (CLI-launched) host-service alike.
 */
export function setupAgentIntegrations(
	options: { disabledAgentIds?: readonly string[] } = {},
): void {
	console.log("[agent-setup] Provisioning agent integrations...");

	fs.mkdirSync(getBinDir(), { recursive: true });
	fs.mkdirSync(getHooksDir(), { recursive: true });
	fs.mkdirSync(getZshDir(), { recursive: true });
	fs.mkdirSync(getBashDir(), { recursive: true });
	fs.mkdirSync(getOpenCodePluginDir(), { recursive: true });

	setupAgentCapabilities(options);

	runSetupAction("zsh-wrapper", createZshWrapper);
	runSetupAction("bash-wrapper", createBashWrapper);

	console.log("[agent-setup] Agent integrations provisioned");
}

export { setupSingleAgent, teardownSingleAgent };

export { getCommandShellArgs, getShellArgs, getShellEnv };

export {
	getAgentSetupTemplatesDir,
	setAgentSetupTemplatesDir,
} from "./config";
export { getBinDir, resolveSupersetHomeDir } from "./paths";
