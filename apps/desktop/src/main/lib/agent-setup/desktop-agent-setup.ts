import {
	cleanupGlobalOpenCodePlugin,
	createAmpPlugin,
	createAmpWrapper,
	createClaudeSettingsJson,
	createClaudeWrapper,
	createCodexHooksJson,
	createCodexWrapper,
	createCopilotHookScript,
	createCopilotWrapper,
	createCursorAgentWrapper,
	createCursorHookScript,
	createCursorHooksJson,
	createDroidSettingsJson,
	createDroidWrapper,
	createGeminiHookScript,
	createGeminiSettingsJson,
	createGeminiWrapper,
	createGrokConfigToml,
	createGrokHooksJson,
	createGrokWrapper,
	createKimiConfigToml,
	createKimiWrapper,
	createMastraHooksJson,
	createMastraWrapper,
	createOpenCodePlugin,
	createOpenCodeWrapper,
	createPiExtension,
	createVibeHooksToml,
	createVibeWrapper,
	removeAmpPlugin,
	removeClaudeManagedHooks,
	removeCodexManagedHooks,
	removeCursorManagedHooks,
	removeDroidManagedHooks,
	removeGeminiManagedHooks,
	removeGrokManagedHooks,
	removeKimiManagedHooks,
	removeMastraManagedHooks,
	removePiExtension,
	removeVibeManagedHooks,
} from "./agent-wrappers";
import {
	DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS,
	DESKTOP_AGENT_SETUP_TARGETS,
	type DesktopAgentSetupAction,
	type DesktopAgentTeardownAction,
} from "./desktop-agent-capabilities";
import { createNotifyScript } from "./notify-hook";

const DESKTOP_AGENT_SETUP_RUNNERS: Record<DesktopAgentSetupAction, () => void> =
	{
		"notify-script": createNotifyScript,
		"cleanup-global-opencode-plugin": cleanupGlobalOpenCodePlugin,
		"amp-plugin": createAmpPlugin,
		"amp-wrapper": createAmpWrapper,
		"claude-settings-json": createClaudeSettingsJson,
		"claude-wrapper": createClaudeWrapper,
		"codex-hooks-json": createCodexHooksJson,
		"codex-wrapper": createCodexWrapper,
		"droid-wrapper": createDroidWrapper,
		"droid-settings-json": createDroidSettingsJson,
		"opencode-plugin": createOpenCodePlugin,
		"opencode-wrapper": createOpenCodeWrapper,
		"pi-extension": createPiExtension,
		"cursor-hook-script": createCursorHookScript,
		"cursor-agent-wrapper": createCursorAgentWrapper,
		"cursor-hooks-json": createCursorHooksJson,
		"gemini-hook-script": createGeminiHookScript,
		"gemini-wrapper": createGeminiWrapper,
		"gemini-settings-json": createGeminiSettingsJson,
		"kimi-config-toml": createKimiConfigToml,
		"kimi-wrapper": createKimiWrapper,
		"grok-hooks-json": createGrokHooksJson,
		"grok-config-toml": createGrokConfigToml,
		"grok-wrapper": createGrokWrapper,
		"mastra-wrapper": createMastraWrapper,
		"mastra-hooks-json": createMastraHooksJson,
		"copilot-hook-script": createCopilotHookScript,
		"copilot-wrapper": createCopilotWrapper,
		"vibe-hooks-toml": createVibeHooksToml,
		"vibe-wrapper": createVibeWrapper,
	};

const DESKTOP_AGENT_TEARDOWN_RUNNERS: Record<
	DesktopAgentTeardownAction,
	() => void
> = {
	"amp-plugin-remove": removeAmpPlugin,
	"claude-settings-json-remove": removeClaudeManagedHooks,
	"codex-hooks-json-remove": removeCodexManagedHooks,
	"droid-settings-json-remove": removeDroidManagedHooks,
	"pi-extension-remove": removePiExtension,
	"cursor-hooks-json-remove": removeCursorManagedHooks,
	"gemini-settings-json-remove": removeGeminiManagedHooks,
	"kimi-config-toml-remove": removeKimiManagedHooks,
	"grok-hooks-remove": removeGrokManagedHooks,
	"mastra-hooks-json-remove": removeMastraManagedHooks,
	"vibe-hooks-toml-remove": removeVibeManagedHooks,
};

interface SetupDesktopAgentCapabilitiesOptions {
	/**
	 * Agents whose hook integration the user disabled. Their teardown actions
	 * run instead of setup, actively reaping entries written by older app
	 * versions or while the toggle changed offline.
	 */
	disabledAgentIds?: readonly string[];
}

export function setupDesktopAgentCapabilities({
	disabledAgentIds = [],
}: SetupDesktopAgentCapabilitiesOptions = {}): void {
	const disabled = new Set(disabledAgentIds);
	for (const action of DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS) {
		DESKTOP_AGENT_SETUP_RUNNERS[action]();
	}

	for (const target of DESKTOP_AGENT_SETUP_TARGETS) {
		if (disabled.has(target.id)) {
			runTeardownActions(target);
			continue;
		}
		for (const action of target.setupActions) {
			DESKTOP_AGENT_SETUP_RUNNERS[action]();
		}
	}
}

function runTeardownActions(
	target: (typeof DESKTOP_AGENT_SETUP_TARGETS)[number],
): void {
	if (!("teardownActions" in target)) return;
	for (const action of target.teardownActions) {
		DESKTOP_AGENT_TEARDOWN_RUNNERS[action]();
	}
}

/**
 * Re-run setupActions for one agent. Bootstrap actions run first because
 * per-agent hooks reference the shared notify script — without them the
 * per-agent setup isn't self-sufficient. Returns `false` for unknown ids.
 */
export function setupSingleAgent(agentId: string): boolean {
	const target = DESKTOP_AGENT_SETUP_TARGETS.find((t) => t.id === agentId);
	if (!target) return false;
	for (const action of DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS) {
		DESKTOP_AGENT_SETUP_RUNNERS[action]();
	}
	for (const action of target.setupActions) {
		DESKTOP_AGENT_SETUP_RUNNERS[action]();
	}
	return true;
}

/**
 * Removes one agent's Superset footprint from its global config. Returns
 * `false` for unknown ids; `true` even when the agent has no teardown
 * actions (no global footprint to remove).
 */
export function teardownSingleAgent(agentId: string): boolean {
	const target = DESKTOP_AGENT_SETUP_TARGETS.find((t) => t.id === agentId);
	if (!target) return false;
	runTeardownActions(target);
	return true;
}
