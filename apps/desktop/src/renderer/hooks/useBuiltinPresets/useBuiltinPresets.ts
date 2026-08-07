import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useMemo } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

export const BUILTIN_CLI_PRESET_ID = "superset-cli";

// Synthetic app-shipped preset merged into the preset bar at read time — never
// inserted into the v2TerminalPresets collection, so it can't trip the
// first-run seeding guard or the agent→preset dedupe, and it stays updatable
// across releases. Slug-shaped id: user preset rows use UUIDs, so the
// namespaces can't collide.
export const BUILTIN_CLI_PRESET: V2TerminalPresetRow = {
	id: BUILTIN_CLI_PRESET_ID,
	name: "Superset CLI",
	description:
		"Script workspaces, agents, and automations from any terminal — agents in Superset terminals can use it too.",
	cwd: "",
	commands: ["superset --help"],
	projectIds: null,
	executionMode: "new-tab",
	tabOrder: Number.MAX_SAFE_INTEGER,
	createdAt: new Date(0),
};

export interface BuiltinPresetEntry {
	preset: V2TerminalPresetRow;
	isVisible: boolean;
}

export function getBuiltinPresetEntries(
	flagEnabled: boolean | undefined,
	hiddenBuiltinPresetIds: readonly string[],
): BuiltinPresetEntry[] {
	if (!flagEnabled) return [];
	return [
		{
			preset: BUILTIN_CLI_PRESET,
			isVisible: !hiddenBuiltinPresetIds.includes(BUILTIN_CLI_PRESET_ID),
		},
	];
}

/**
 * Built-in presets to render alongside user presets. Hidden entries are still
 * returned (isVisible: false) so manage surfaces can offer un-hiding; bar
 * surfaces should filter on isVisible.
 */
export function useBuiltinPresets(): BuiltinPresetEntry[] {
	const flagEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.BUILTIN_CLI_PRESET);
	const { preferences } = useV2UserPreferences();
	return useMemo(
		() =>
			getBuiltinPresetEntries(flagEnabled, preferences.hiddenBuiltinPresetIds),
		[flagEnabled, preferences.hiddenBuiltinPresetIds],
	);
}
