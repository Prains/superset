import fs from "node:fs";
import path from "node:path";
import { getTemplatePath, getV1NotificationsPort } from "./config";
import { getHooksDir } from "./paths";

export const NOTIFY_SCRIPT_NAME = "notify.sh";
export const NOTIFY_SCRIPT_MARKER = "# Superset agent notification hook v8";

function writeFileIfChanged(
	filePath: string,
	content: string,
	mode: number,
): boolean {
	const existing = fs.existsSync(filePath)
		? fs.readFileSync(filePath, "utf-8")
		: null;
	if (existing === content) {
		try {
			fs.chmodSync(filePath, mode);
		} catch {
			// Best effort.
		}
		return false;
	}

	fs.writeFileSync(filePath, content, { mode });
	return true;
}

export function getNotifyScriptPath(): string {
	return path.join(getHooksDir(), NOTIFY_SCRIPT_NAME);
}

export function getNotifyScriptContent(): string {
	const template = fs.readFileSync(
		getTemplatePath("notify-hook.template.sh"),
		"utf-8",
	);
	return template
		.replaceAll("{{MARKER}}", NOTIFY_SCRIPT_MARKER)
		.replaceAll("{{DEFAULT_PORT}}", String(getV1NotificationsPort()));
}

export function createNotifyScript(): void {
	const notifyPath = getNotifyScriptPath();
	const script = getNotifyScriptContent();
	const changed = writeFileIfChanged(notifyPath, script, 0o755);
	console.log(`[agent-setup] ${changed ? "Updated" : "Verified"} notify hook`);
}
