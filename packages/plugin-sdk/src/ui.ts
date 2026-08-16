import type { Unsubscribe } from "./backend";

/**
 * The API available to a plugin's React slot components, passed as the
 * `ctx` prop. Versioned contract: additive-only within an SDK major.
 */
export interface PluginUiContext {
	readonly pluginId: string;
	/** The workspace the hosting surface belongs to. */
	readonly workspaceId: string;
	/** Invoke a backend action registered via `api.actions.register`. */
	invokeAction(name: string, params?: unknown): Promise<unknown>;
	/** Payloads published by the plugin backend via `api.realtime.publish`. */
	onRealtime(handler: (payload: unknown) => void): Unsubscribe;
}

export interface PluginSlotProps {
	ctx: PluginUiContext;
}

/**
 * A plugin app bundle is an ESM module whose named exports are React
 * components taking `PluginSlotProps`, referenced by `component` names in
 * the manifest's `contributes` entries.
 */
export type PluginAppModule = Record<
	string,
	React.ComponentType<PluginSlotProps>
>;
