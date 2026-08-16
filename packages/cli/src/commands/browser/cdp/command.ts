import { CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description:
		"Print a raw CDP WebSocket endpoint for a pane (for browser-use / Playwright-class tools)",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		pane: string().required().desc("Pane ID (from `superset browser list`)"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const hostId = options.host ?? getHostId();
		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});
		// Verify the pane exists before handing out a URL — a dead pane id would
		// otherwise fail only once the tool dials in.
		const { panes } = await target.client.browser.list.query({
			workspaceId: options.workspace,
		});
		if (!panes.some((p) => p.paneId === options.pane)) {
			throw new CLIError(
				`No browser pane ${options.pane} in workspace ${options.workspace}`,
				"Run: superset browser list --workspace <id>",
			);
		}
		const url = `${target.ws.baseWsUrl}/browser/${encodeURIComponent(
			options.pane,
		)}/cdp?token=${encodeURIComponent(target.ws.token)}`;
		return { data: { url }, message: url };
	},
});
