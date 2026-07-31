import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	DYNAMIC_NOTIFY_PATH_MARKER,
	getManagedNotifyHookCommand,
	isSupersetManagedHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { getNotifyScriptPath, NOTIFY_SCRIPT_NAME } from "./notify-hook";

interface DroidHookConfig {
	type: "command";
	command: string;
	timeout?: number;
	[key: string]: unknown;
}

interface DroidHookDefinition {
	matcher?: string;
	hooks?: DroidHookConfig[];
	[key: string]: unknown;
}

interface DroidSettingsJson {
	hooks?: Record<string, DroidHookDefinition[]>;
	[key: string]: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isManagedHookCommand(
	command: string | undefined,
	notifyScriptPath: string,
): boolean {
	return (
		command?.includes(notifyScriptPath) ||
		command?.includes(DYNAMIC_NOTIFY_PATH_MARKER) ||
		isSupersetManagedHookCommand(command, NOTIFY_SCRIPT_NAME)
	);
}

function readExistingDroidSettings(
	globalPath: string,
): DroidSettingsJson | null {
	if (!fs.existsSync(globalPath)) {
		return {};
	}

	try {
		const parsed = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
		if (!isPlainObject(parsed)) {
			console.warn(
				"[agent-setup] Expected ~/.factory/settings.json to contain a JSON object; skipping Droid hook merge",
			);
			return null;
		}
		return parsed;
	} catch (error) {
		console.warn(
			"[agent-setup] Could not parse existing ~/.factory/settings.json; skipping Droid hook merge:",
			error,
		);
		return null;
	}
}

function removeManagedHooksFromDefinition(
	definition: DroidHookDefinition,
	notifyScriptPath: string,
): DroidHookDefinition | null {
	if (!Array.isArray(definition.hooks)) {
		return definition;
	}

	const filteredHooks = definition.hooks.filter(
		(hook) => !isManagedHookCommand(hook.command, notifyScriptPath),
	);

	if (filteredHooks.length === definition.hooks.length) {
		return definition;
	}

	if (filteredHooks.length === 0) {
		return null;
	}

	return {
		...definition,
		hooks: filteredHooks,
	};
}

export function getDroidSettingsJsonPath(): string {
	return path.join(os.homedir(), ".factory", "settings.json");
}

export function createDroidWrapper(): void {
	const script = buildWrapperScript("droid", `exec "$REAL_BIN" "$@"`, {
		agentId: "droid",
	});
	createWrapper("droid", script);
}

/**
 * Reads existing ~/.factory/settings.json, merges our hook definitions
 * (identified by notify script path), and preserves any user-defined hooks.
 *
 * Factory Droid uses the same nested hook structure as Claude:
 *   { hooks: { EventName: [{ matcher?, hooks: [{ type, command }] }] } }
 */
export function getDroidSettingsJsonContent(
	notifyScriptPath: string,
): string | null {
	const globalPath = getDroidSettingsJsonPath();
	const existing = readExistingDroidSettings(globalPath);
	if (!existing) return null;

	if (!existing.hooks || typeof existing.hooks !== "object") {
		existing.hooks = {};
	}

	// Guarded on SUPERSET_HOME_DIR so the hook is a no-op in droid sessions
	// launched outside Superset terminals (~/.factory/settings.json is global).
	const managedHookCommand = getManagedNotifyHookCommand("droid");

	const managedEvents: Array<{
		eventName:
			| "SessionStart"
			| "SessionEnd"
			| "UserPromptSubmit"
			| "Notification"
			| "Stop"
			| "PostToolUse";
		definition: DroidHookDefinition;
	}> = [
		{
			eventName: "SessionStart",
			definition: {
				hooks: [{ type: "command", command: managedHookCommand }],
			},
		},
		{
			eventName: "SessionEnd",
			definition: {
				hooks: [{ type: "command", command: managedHookCommand }],
			},
		},
		{
			eventName: "UserPromptSubmit",
			definition: {
				hooks: [{ type: "command", command: managedHookCommand }],
			},
		},
		{
			eventName: "Notification",
			definition: {
				hooks: [{ type: "command", command: managedHookCommand }],
			},
		},
		{
			eventName: "Stop",
			definition: {
				hooks: [{ type: "command", command: managedHookCommand }],
			},
		},
		{
			eventName: "PostToolUse",
			definition: {
				matcher: "*",
				hooks: [{ type: "command", command: managedHookCommand }],
			},
		},
	];

	for (const { eventName, definition } of managedEvents) {
		const current = existing.hooks[eventName];
		if (Array.isArray(current)) {
			const filtered = current.flatMap((def: DroidHookDefinition) => {
				const cleaned = removeManagedHooksFromDefinition(def, notifyScriptPath);
				return cleaned ? [cleaned] : [];
			});
			filtered.push(definition);
			existing.hooks[eventName] = filtered;
		} else {
			existing.hooks[eventName] = [definition];
		}
	}

	return JSON.stringify(existing, null, 2);
}

/**
 * Removes Superset-managed hook entries from ~/.factory/settings.json,
 * preserving user hooks and non-hook settings. No-op when the file does not
 * exist — teardown must never create config files.
 */
export function removeDroidManagedHooks(): void {
	const globalPath = getDroidSettingsJsonPath();
	if (!fs.existsSync(globalPath)) return;
	const existing = readExistingDroidSettings(globalPath);
	if (!existing || !existing.hooks || typeof existing.hooks !== "object") {
		return;
	}

	const notifyScriptPath = getNotifyScriptPath();
	for (const [eventName, definitions] of Object.entries(existing.hooks)) {
		if (!Array.isArray(definitions)) continue;
		const filtered = definitions.flatMap((definition) => {
			const cleaned = removeManagedHooksFromDefinition(
				definition,
				notifyScriptPath,
			);
			return cleaned ? [cleaned] : [];
		});
		if (filtered.length === 0) {
			delete existing.hooks[eventName];
		} else {
			existing.hooks[eventName] = filtered;
		}
	}
	if (Object.keys(existing.hooks).length === 0) {
		delete existing.hooks;
	}

	const changed = writeFileIfChanged(
		globalPath,
		JSON.stringify(existing, null, 2),
		0o644,
	);
	console.log(
		`[agent-setup] ${changed ? "Removed" : "Verified no"} Droid managed hooks`,
	);
}

export function createDroidSettingsJson(): void {
	const notifyScriptPath = getNotifyScriptPath();
	const globalPath = getDroidSettingsJsonPath();
	const content = getDroidSettingsJsonContent(notifyScriptPath);
	if (content === null) return;

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Droid settings.json`,
	);
}
