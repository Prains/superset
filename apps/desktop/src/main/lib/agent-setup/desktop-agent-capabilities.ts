import type { AgentType } from "@superset/shared/agent-command";

export type SupersetManagedBinary = AgentType;

export const DESKTOP_AGENT_SETUP_ACTIONS = [
	"notify-script",
	"cleanup-global-opencode-plugin",
	"amp-plugin",
	"amp-wrapper",
	"claude-settings-json",
	"claude-wrapper",
	"codex-hooks-json",
	"codex-wrapper",
	"droid-wrapper",
	"droid-settings-json",
	"opencode-plugin",
	"opencode-wrapper",
	"pi-extension",
	"cursor-hook-script",
	"cursor-agent-wrapper",
	"cursor-hooks-json",
	"gemini-hook-script",
	"gemini-wrapper",
	"gemini-settings-json",
	"kimi-config-toml",
	"kimi-wrapper",
	"grok-hooks-json",
	"grok-config-toml",
	"grok-wrapper",
	"mastra-wrapper",
	"mastra-hooks-json",
	"copilot-hook-script",
	"copilot-wrapper",
	"vibe-hooks-toml",
	"vibe-wrapper",
] as const;

export type DesktopAgentSetupAction =
	(typeof DESKTOP_AGENT_SETUP_ACTIONS)[number];

/**
 * Teardown actions remove Superset's footprint from an agent's global config
 * when the user disables its hook integration. Wrappers and scripts under
 * ~/.superset/ stay — they are Superset-owned and inert outside its terminals.
 * Copilot and OpenCode have no global footprint, so they have no teardown.
 */
export const DESKTOP_AGENT_TEARDOWN_ACTIONS = [
	"amp-plugin-remove",
	"claude-settings-json-remove",
	"codex-hooks-json-remove",
	"droid-settings-json-remove",
	"pi-extension-remove",
	"cursor-hooks-json-remove",
	"gemini-settings-json-remove",
	"kimi-config-toml-remove",
	"grok-hooks-remove",
	"mastra-hooks-json-remove",
	"vibe-hooks-toml-remove",
] as const;

export type DesktopAgentTeardownAction =
	(typeof DESKTOP_AGENT_TEARDOWN_ACTIONS)[number];

interface DesktopAgentSetupTarget {
	id: AgentType;
	setupActions: readonly DesktopAgentSetupAction[];
	teardownActions?: readonly DesktopAgentTeardownAction[];
	managedBinary?: boolean;
}

export const DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS = [
	"cleanup-global-opencode-plugin",
	"notify-script",
] as const satisfies readonly DesktopAgentSetupAction[];

export const DESKTOP_AGENT_SETUP_TARGETS = [
	{
		id: "amp",
		setupActions: ["amp-plugin", "amp-wrapper"],
		teardownActions: ["amp-plugin-remove"],
		managedBinary: true,
	},
	{
		id: "claude",
		setupActions: ["claude-settings-json", "claude-wrapper"],
		teardownActions: ["claude-settings-json-remove"],
		managedBinary: true,
	},
	{
		id: "codex",
		setupActions: ["codex-hooks-json", "codex-wrapper"],
		teardownActions: ["codex-hooks-json-remove"],
		managedBinary: true,
	},
	{
		id: "droid",
		setupActions: ["droid-wrapper", "droid-settings-json"],
		teardownActions: ["droid-settings-json-remove"],
		managedBinary: true,
	},
	{
		id: "opencode",
		setupActions: ["opencode-plugin", "opencode-wrapper"],
		managedBinary: true,
	},
	{
		id: "pi",
		setupActions: ["pi-extension"],
		teardownActions: ["pi-extension-remove"],
	},
	{
		id: "cursor-agent",
		setupActions: [
			"cursor-hook-script",
			"cursor-agent-wrapper",
			"cursor-hooks-json",
		],
		teardownActions: ["cursor-hooks-json-remove"],
	},
	{
		id: "gemini",
		setupActions: [
			"gemini-hook-script",
			"gemini-wrapper",
			"gemini-settings-json",
		],
		teardownActions: ["gemini-settings-json-remove"],
		managedBinary: true,
	},
	{
		id: "mastracode",
		setupActions: ["mastra-wrapper", "mastra-hooks-json"],
		teardownActions: ["mastra-hooks-json-remove"],
		managedBinary: true,
	},
	{
		id: "kimi",
		setupActions: ["kimi-config-toml", "kimi-wrapper"],
		teardownActions: ["kimi-config-toml-remove"],
		managedBinary: true,
	},
	{
		id: "grok",
		setupActions: ["grok-hooks-json", "grok-config-toml", "grok-wrapper"],
		teardownActions: ["grok-hooks-remove"],
		managedBinary: true,
	},
	{
		id: "copilot",
		setupActions: ["copilot-hook-script", "copilot-wrapper"],
		managedBinary: true,
	},
	{
		id: "vibe",
		setupActions: ["vibe-hooks-toml", "vibe-wrapper"],
		teardownActions: ["vibe-hooks-toml-remove"],
		managedBinary: true,
	},
] as const satisfies readonly DesktopAgentSetupTarget[];

export const SUPERSET_MANAGED_BINARIES = DESKTOP_AGENT_SETUP_TARGETS.filter(
	(target) => "managedBinary" in target && target.managedBinary,
).map((target) => target.id) satisfies SupersetManagedBinary[];
