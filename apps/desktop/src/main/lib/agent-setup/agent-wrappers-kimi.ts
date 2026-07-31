import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	getManagedNotifyHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";

export const KIMI_HOOKS_MARKER_START =
	"# >>> superset-managed-kimi-hooks v1 (do not edit) >>>";
export const KIMI_HOOKS_MARKER_END = "# <<< superset-managed-kimi-hooks v1 <<<";

const KIMI_MANAGED_HOOK_EVENTS = [
	"SessionStart",
	"UserPromptSubmit",
	"PostToolUse",
	"PostToolUseFailure",
	"PermissionRequest",
	"PermissionResult",
	"StopFailure",
	"Interrupt",
	"Stop",
	"SessionEnd",
] as const;

const KIMI_MANAGED_HOOK_COMMAND = getManagedNotifyHookCommand("kimi");

export function getKimiConfigTomlPath(): string {
	const configuredHome = process.env.KIMI_CODE_HOME?.trim();
	const kimiHome = configuredHome || path.join(os.homedir(), ".kimi-code");
	return path.join(kimiHome, "config.toml");
}

function buildKimiManagedHooksBlock(): string {
	return [
		KIMI_HOOKS_MARKER_START,
		...KIMI_MANAGED_HOOK_EVENTS.flatMap((event, index) => [
			...(index === 0 ? [] : [""]),
			"[[hooks]]",
			`event = "${event}"`,
			`command = '${KIMI_MANAGED_HOOK_COMMAND}'`,
		]),
		KIMI_HOOKS_MARKER_END,
	].join("\n");
}

function isTomlTableHeader(line: string): boolean {
	return /^\s*\[/.test(line);
}

function isManagedOrPartialHookTable(lines: string[]): boolean {
	if (!/^\s*\[\[hooks\]\]\s*$/.test(lines[0] ?? "")) return false;
	const event = lines
		.map((line) => line.match(/^\s*event\s*=\s*"([^"]+)"/))
		.find((match) => match)?.[1];
	if (
		!event ||
		!(KIMI_MANAGED_HOOK_EVENTS as readonly string[]).includes(event)
	) {
		return false;
	}

	const commandLine = lines.find((line) => /^\s*command\s*=/.test(line));
	return !commandLine || commandLine.includes("SUPERSET_AGENT_ID=kimi");
}

/**
 * Recover from an interrupted write whose end marker is missing. Managed hook
 * tables are removed, while a later user-owned table and its leading comments
 * are retained.
 */
function stripOrphanedManagedBlock(base: string, start: number): string {
	const before = base.slice(0, start);
	const lines = base.slice(start).split("\n");
	let cut = lines.length;

	for (let index = 1; index < lines.length; index++) {
		if (!isTomlTableHeader(lines[index])) continue;
		let end = index + 1;
		while (end < lines.length && !isTomlTableHeader(lines[end])) end++;
		if (isManagedOrPartialHookTable(lines.slice(index, end))) {
			index = end - 1;
			continue;
		}

		cut = index;
		break;
	}

	while (
		cut > 1 &&
		(lines[cut - 1].trim() === "" || lines[cut - 1].trimStart().startsWith("#"))
	) {
		cut--;
	}

	return before + lines.slice(cut).join("\n");
}

function stripKimiManagedBlock(existing: string): string {
	const start = existing.indexOf(KIMI_HOOKS_MARKER_START);
	if (start === -1) return existing;
	const end = existing.indexOf(KIMI_HOOKS_MARKER_END, start);
	return end !== -1
		? existing.slice(0, start) +
				existing.slice(end + KIMI_HOOKS_MARKER_END.length)
		: stripOrphanedManagedBlock(existing, start);
}

/** Preserve user config while replacing Superset's marker-owned hook block. */
export function getKimiConfigTomlContent(existing: string): string {
	const base = stripKimiManagedBlock(existing).replace(/\s+$/, "");
	const block = buildKimiManagedHooksBlock();
	return base.length > 0 ? `${base}\n\n${block}\n` : `${block}\n`;
}

/**
 * Removes Superset's marker-owned hook block from Kimi's config.toml,
 * preserving user config. Deletes the file when nothing but the managed
 * block was in it. No-op when the file does not exist.
 */
export function removeKimiManagedHooks(): void {
	const configPath = getKimiConfigTomlPath();
	if (!fs.existsSync(configPath)) return;
	const existing = fs.readFileSync(configPath, "utf-8");
	const base = stripKimiManagedBlock(existing).replace(/\s+$/, "");
	if (base.length === 0) {
		fs.unlinkSync(configPath);
		console.log("[agent-setup] Removed Kimi config.toml (managed block only)");
		return;
	}
	const changed = writeFileIfChanged(configPath, `${base}\n`, 0o600);
	console.log(
		`[agent-setup] ${changed ? "Removed" : "Verified no"} Kimi managed hooks`,
	);
}

export function createKimiConfigToml(): void {
	const configPath = getKimiConfigTomlPath();
	const existing = fs.existsSync(configPath)
		? fs.readFileSync(configPath, "utf-8")
		: "";
	const content = getKimiConfigTomlContent(existing);
	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	const changed = writeFileIfChanged(configPath, content, 0o600);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Kimi config.toml`,
	);
}

export function getKimiWrapperScript(): string {
	return buildWrapperScript("kimi", 'exec "$REAL_BIN" "$@"', {
		agentId: "kimi",
	});
}

export function createKimiWrapper(): void {
	createWrapper("kimi", getKimiWrapperScript());
}
