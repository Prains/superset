import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	DYNAMIC_NOTIFY_PATH_MARKER,
	getManagedNotifyHookCommand,
	isSupersetManagedHookCommand,
	reconcileManagedEntries,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { getNotifyScriptPath, NOTIFY_SCRIPT_NAME } from "./notify-hook";

interface MastraHookMatcher {
	tool_name?: string;
	[key: string]: unknown;
}

interface MastraHookDefinition {
	type: "command";
	command: string;
	matcher?: MastraHookMatcher;
	timeout?: number;
	description?: string;
	[key: string]: unknown;
}

interface MastraHooksJson {
	PreToolUse?: MastraHookDefinition[];
	PostToolUse?: MastraHookDefinition[];
	Stop?: MastraHookDefinition[];
	UserPromptSubmit?: MastraHookDefinition[];
	SessionStart?: MastraHookDefinition[];
	SessionEnd?: MastraHookDefinition[];
	Notification?: MastraHookDefinition[];
	[key: string]: unknown;
}

export function getMastraGlobalHooksJsonPath(): string {
	return path.join(os.homedir(), ".mastracode", "hooks.json");
}

export function createMastraWrapper(): void {
	const script = buildWrapperScript("mastracode", `exec "$REAL_BIN" "$@"`, {
		agentId: "mastracode",
	});
	createWrapper("mastracode", script);
}

/**
 * Reads existing ~/.mastracode/hooks.json, merges our hook entries (identified
 * by notify script path), and preserves any user-defined hooks.
 */
export function getMastraHooksJsonContent(notifyScriptPath: string): string {
	const globalPath = getMastraGlobalHooksJsonPath();

	let existing: MastraHooksJson = {};
	try {
		if (fs.existsSync(globalPath)) {
			existing = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
		}
	} catch {
		console.warn(
			"[agent-setup] Could not parse existing ~/.mastracode/hooks.json, merging carefully",
		);
	}

	// Guarded on SUPERSET_HOME_DIR so the hook is a no-op in mastracode
	// sessions launched outside Superset terminals (hooks.json is global).
	const notifyCommand = getManagedNotifyHookCommand("mastracode");
	// Session lifecycle drives the pane icon binding; per-prompt drives status.
	const managedEvents = [
		"SessionStart",
		"SessionEnd",
		"UserPromptSubmit",
		"Stop",
		"PostToolUse",
	] as const;

	for (const eventName of managedEvents) {
		const current = existing[eventName];
		const { entries } = reconcileManagedEntries({
			current,
			desired: [{ type: "command", command: notifyCommand }],
			isManaged: (entry: MastraHookDefinition) =>
				entry.command?.includes(notifyScriptPath) ||
				entry.command?.includes(DYNAMIC_NOTIFY_PATH_MARKER) ||
				isSupersetManagedHookCommand(entry.command, NOTIFY_SCRIPT_NAME),
			isEquivalent: (
				entry: MastraHookDefinition,
				desiredEntry: MastraHookDefinition,
			) => entry.command === desiredEntry.command,
		});
		existing[eventName] = entries;
	}

	return JSON.stringify(existing, null, 2);
}

/**
 * Removes Superset-managed hook entries from ~/.mastracode/hooks.json,
 * preserving user hooks. No-op when the file does not exist.
 */
export function removeMastraManagedHooks(): void {
	const globalPath = getMastraGlobalHooksJsonPath();
	if (!fs.existsSync(globalPath)) return;

	let existing: MastraHooksJson;
	try {
		existing = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
	} catch {
		console.warn(
			"[agent-setup] Could not parse existing ~/.mastracode/hooks.json; skipping Mastra hook removal",
		);
		return;
	}
	if (typeof existing !== "object" || existing === null) return;

	const notifyScriptPath = getNotifyScriptPath();
	for (const [eventName, entries] of Object.entries(existing)) {
		if (!Array.isArray(entries)) continue;
		const filtered = entries.filter(
			(entry: MastraHookDefinition) =>
				!(
					entry.command?.includes(notifyScriptPath) ||
					entry.command?.includes(DYNAMIC_NOTIFY_PATH_MARKER) ||
					isSupersetManagedHookCommand(entry.command, NOTIFY_SCRIPT_NAME)
				),
		);
		if (filtered.length === 0) {
			delete existing[eventName];
		} else {
			existing[eventName] = filtered;
		}
	}

	const changed = writeFileIfChanged(
		globalPath,
		JSON.stringify(existing, null, 2),
		0o644,
	);
	console.log(
		`[agent-setup] ${changed ? "Removed" : "Verified no"} Mastra managed hooks`,
	);
}

export function createMastraHooksJson(): void {
	const notifyScriptPath = getNotifyScriptPath();
	const globalPath = getMastraGlobalHooksJsonPath();
	const content = getMastraHooksJsonContent(notifyScriptPath);

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Mastra hooks.json`,
	);
}
