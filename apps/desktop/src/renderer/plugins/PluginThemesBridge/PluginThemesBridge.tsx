import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useThemeStore } from "renderer/stores/theme";
import { parseThemeConfigFile } from "shared/themes";

/**
 * Imports themes declared by running plugins through the existing custom-
 * theme pipeline, and removes them when their plugin stops running. Theme
 * ids are prefixed with the plugin id so removal never touches user themes.
 *
 * Mounted at the dashboard layout, which sits outside the workspaceTrpc
 * provider — so this polls through the raw host client instead of the
 * workspace-client hooks.
 */
export function PluginThemesBridge() {
	const { activeHostUrl } = useLocalHostService();
	const pluginsQuery = useQuery({
		queryKey: ["host-plugins-themes", activeHostUrl] as const,
		enabled: Boolean(activeHostUrl),
		staleTime: 15_000,
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
		queryFn: () => {
			if (!activeHostUrl) return [];
			return getHostServiceClientByUrl(activeHostUrl).plugins.list.query();
		},
	});
	// pluginId -> theme ids we installed for it this session.
	const installedRef = useRef(new Map<string, string[]>());

	const plugins = pluginsQuery.data;
	const appliedRef = useRef("");

	useEffect(() => {
		if (!plugins || !activeHostUrl) return;
		// Poll results are new array identities; only act when the set of
		// theme-bearing running plugins actually changed.
		const fingerprint = plugins
			.filter(
				(plugin) =>
					plugin.status === "running" &&
					(plugin.manifest.contributes?.themes?.length ?? 0) > 0,
			)
			.map((plugin) => `${plugin.id}:${plugin.updatedAt}`)
			.join(",");
		if (fingerprint === appliedRef.current) return;
		appliedRef.current = fingerprint;
		let cancelled = false;
		const { upsertCustomThemes, removeCustomTheme } = useThemeStore.getState();
		const running = new Set(
			plugins.filter((p) => p.status === "running").map((p) => p.id),
		);

		for (const [pluginId, themeIds] of installedRef.current) {
			if (running.has(pluginId)) continue;
			for (const themeId of themeIds) removeCustomTheme(themeId);
			installedRef.current.delete(pluginId);
		}

		const client = getHostServiceClientByUrl(activeHostUrl);
		for (const plugin of plugins) {
			if (
				plugin.status !== "running" ||
				!plugin.manifest.contributes?.themes?.length
			) {
				continue;
			}
			void client.plugins.getThemes
				.query({ id: plugin.id })
				.then((files) => {
					if (cancelled) return;
					const ids: string[] = [];
					for (const content of files) {
						const parsed = parseThemeConfigFile(content);
						if (!parsed.ok) {
							console.warn(
								`[plugins] invalid theme from ${plugin.id}: ${parsed.error}`,
							);
							continue;
						}
						const namespaced = parsed.themes.map((theme) => ({
							...theme,
							id: `${plugin.id}.${theme.id}`,
						}));
						upsertCustomThemes(namespaced);
						ids.push(...namespaced.map((theme) => theme.id));
					}
					if (ids.length > 0) installedRef.current.set(plugin.id, ids);
				})
				.catch((error) => {
					console.warn(`[plugins] theme fetch failed for ${plugin.id}:`, error);
				});
		}
		return () => {
			cancelled = true;
		};
	}, [activeHostUrl, plugins]);

	return null;
}
