import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../lib/command";
import { resolvePluginHost } from "../plugin/lib";

export default command({
	description:
		"Run a plugin-contributed command (manifest `contributes.cli`); bare `superset x` lists them",
	args: [positional("name").desc("Plugin command name")],
	options: {
		params: string().desc("Params as JSON, passed to the mapped action"),
		workspace: string().desc("Workspace ID to scope the action to"),
		host: string().desc("Target host machineId (default: this machine)"),
		local: boolean().desc("Target this machine (the default)"),
	},
	run: async ({ ctx, args, options }) => {
		const target = await resolvePluginHost(ctx, {
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});
		const plugins = await target.client.plugins.list.query();
		const commands = plugins.flatMap((plugin) =>
			plugin.status === "running"
				? (plugin.manifest.contributes?.cli ?? []).map((entry) => ({
						plugin,
						entry,
					}))
				: [],
		);

		const name = args.name as string | undefined;
		if (!name) {
			return {
				data: commands.map(({ plugin, entry }) => ({
					name: entry.name,
					plugin: plugin.id,
					description: entry.description ?? null,
				})),
			};
		}

		const matches = commands.filter(({ entry }) => entry.name === name);
		if (matches.length === 0) {
			throw new CLIError(
				`No plugin command named "${name}". Run \`superset x\` to list them.`,
			);
		}
		if (matches.length > 1) {
			throw new CLIError(
				`"${name}" is provided by multiple plugins (${matches
					.map((m) => m.plugin.id)
					.join(", ")}). Use \`superset plugin invoke <id> <action>\` instead.`,
			);
		}

		let params: unknown;
		if (options.params) {
			try {
				params = JSON.parse(options.params);
			} catch (error) {
				throw new CLIError(
					`--params is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		const match = matches[0];
		if (!match) throw new CLIError("unreachable");
		const result = await target.client.plugins.invokeAction.mutate({
			id: match.plugin.id,
			action: match.entry.action,
			params,
			workspaceId: options.workspace ?? undefined,
		});
		return { data: result ?? null };
	},
});
