import { env } from "@/lib/env";

const DEFAULT_WEB_URL = "https://app.superset.sh";

/**
 * Shareable web-app link for a workspace (the Cursor pattern:
 * cursor.com/agents/<id> → app.superset.sh/agents/workspace/<id>).
 * The web route lives at apps/web src/app/(agents)/agents/workspace.
 */
export function workspaceShareUrl(workspaceId: string): string {
	const base = (env.EXPO_PUBLIC_WEB_URL ?? DEFAULT_WEB_URL).replace(/\/$/, "");
	return `${base}/agents/workspace/${workspaceId}`;
}
