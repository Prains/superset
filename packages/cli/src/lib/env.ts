/**
 * Build-time constants baked into the CLI binary via `Bun.build({ define })`
 * (see `cli.config.ts`). In dev mode, falls back to actual process.env so
 * local dev can override these.
 */

export const env = {
	RELAY_URL: process.env.RELAY_URL || "https://relay.superset.sh",
	SUPERSET_API_URL: process.env.SUPERSET_API_URL || "https://api.superset.sh",
	SUPERSET_WEB_URL: process.env.SUPERSET_WEB_URL || "https://app.superset.sh",
	VERSION: process.env.SUPERSET_VERSION || "0.0.0-dev",
};

/** True when this executable is shipped inside the Desktop application. */
export function isDesktopBundled(): boolean {
	return process.env.SUPERSET_CLI_CHANNEL === "desktop-bundled";
}
