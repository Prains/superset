import type { PaneRegistry } from "@superset/panes";
import { useMemo } from "react";
import { LuPuzzle } from "react-icons/lu";
import { PluginSlotMount } from "renderer/plugins/PluginSlotMount";
import {
	isRunningWithUi,
	pluginBundleVersion,
	useInstalledPlugins,
} from "renderer/plugins/useInstalledPlugins";
import type { PaneViewerData } from "../../../../types";

/**
 * Pane definitions contributed by installed plugins, keyed by the manifest's
 * pane `kind`. Spread BEFORE the builtin definitions so a plugin kind can
 * never shadow a builtin pane.
 */
export function usePluginPaneDefinitions(
	workspaceId: string,
): PaneRegistry<PaneViewerData> {
	const plugins = useInstalledPlugins();
	return useMemo(() => {
		const definitions: PaneRegistry<PaneViewerData> = {};
		for (const plugin of plugins.filter(isRunningWithUi)) {
			for (const pane of plugin.manifest.contributes?.panes ?? []) {
				definitions[pane.kind] = {
					getTitle: () => pane.title,
					getIcon: () => <LuPuzzle className="size-4" />,
					renderPane: () => (
						<PluginSlotMount
							pluginId={plugin.id}
							bundleVersion={pluginBundleVersion(plugin)}
							componentName={pane.component}
							workspaceId={workspaceId}
						/>
					),
				};
			}
		}
		return definitions;
	}, [plugins, workspaceId]);
}
