import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveBrowserTarget } from "../shared";

export default command({
	description: "Open a URL in a workspace browser pane and return its pane id",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		url: string().required().desc("URL to open"),
		target: string().desc("`current-tab` (default) or `new-tab`"),
	},
	run: async ({ ctx, options }) => {
		const { client } = await resolveBrowserTarget(ctx, options);
		const target = options.target === "new-tab" ? "new-tab" : "current-tab";
		const result = await client.browser.open.mutate({
			workspaceId: options.workspace,
			url: options.url,
			target,
		});
		return {
			data: result,
			message: `Opened ${result.url}\npane: ${result.paneId}`,
		};
	},
});
