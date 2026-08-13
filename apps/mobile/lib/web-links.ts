import { env } from "@/lib/env";

const DEFAULT_WEB_URL = "https://app.superset.sh";

/**
 * Shareable web-app link for a workspace. `/workspaces/<id>` is the chosen
 * canonical share path — the web app doesn't serve it yet (planned: restore
 * the route or deep-link into desktop; tracked on the Linear roadmap).
 */
export function workspaceShareUrl(workspaceId: string): string {
	const base = (env.EXPO_PUBLIC_WEB_URL ?? DEFAULT_WEB_URL).replace(/\/$/, "");
	return `${base}/workspaces/${workspaceId}`;
}
