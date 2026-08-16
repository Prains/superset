import { number, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveBrowserTarget } from "../shared";

export default command({
	description: "Read a browser pane's captured console output",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		pane: string().required().desc("Pane ID (from `superset browser list`)"),
		maxLines: number().int().desc("Cap returned entries from the bottom"),
	},
	run: async ({ ctx, options }) => {
		const { client } = await resolveBrowserTarget(ctx, options);
		const { entries } = await client.browser.console.query({
			paneId: options.pane,
		});
		const limited = options.maxLines
			? entries.slice(-options.maxLines)
			: entries;
		return {
			data: limited,
			message: limited.length
				? limited.map((e) => `[${e.level}] ${e.message}`).join("\n")
				: "No console output captured.",
		};
	},
});
