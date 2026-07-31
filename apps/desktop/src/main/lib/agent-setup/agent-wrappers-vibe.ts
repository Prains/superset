import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	getManagedNotifyHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";

export const VIBE_HOOKS_MARKER_START =
	"# >>> superset-managed-hooks v1 (do not edit) >>>";
export const VIBE_HOOKS_MARKER_END = "# <<< superset-managed-hooks v1 <<<";

// Vibe runs the command via a shell and pipes the hook invocation JSON (which
// carries `hook_event_name`) on stdin.
const VIBE_MANAGED_HOOK_COMMAND = getManagedNotifyHookCommand("vibe");

export function getVibeHooksTomlPath(): string {
	return path.join(os.homedir(), ".vibe", "hooks.toml");
}

function buildVibeManagedHooksBlock(): string {
	return [
		VIBE_HOOKS_MARKER_START,
		"[[hooks]]",
		'name = "superset-notify-before-tool"',
		'type = "before_tool"',
		`command = '${VIBE_MANAGED_HOOK_COMMAND}'`,
		"",
		"[[hooks]]",
		'name = "superset-notify-post-agent-turn"',
		'type = "post_agent_turn"',
		`command = '${VIBE_MANAGED_HOOK_COMMAND}'`,
		VIBE_HOOKS_MARKER_END,
	].join("\n");
}

const MANAGED_HOOK_NAME_PREFIX = "superset-notify-";

/**
 * Remove an orphaned managed block (start marker present, end marker lost to a
 * partial/interrupted write) without deleting user hooks that follow it. Our
 * block only ever contains `[[hooks]]` tables named `superset-notify-*`, so we
 * drop the marker and our own tables and stop at the first foreign TOML table.
 */
function stripOrphanedManagedBlock(base: string, start: number): string {
	const before = base.slice(0, start);
	const lines = base.slice(start).split("\n");
	const isTableHeader = (line: string) => /^\s*\[/.test(line);
	// Default: nothing foreign follows the orphaned block — strip to end-of-file.
	let cut = lines.length;
	for (let i = 1; i < lines.length; i++) {
		if (!isTableHeader(lines[i])) continue;
		let name: string | null = null;
		for (let j = i + 1; j < lines.length && !isTableHeader(lines[j]); j++) {
			const match = lines[j].match(/^\s*name\s*=\s*"([^"]*)"/);
			if (match) {
				name = match[1];
				break;
			}
		}
		if (name !== null && !name.startsWith(MANAGED_HOOK_NAME_PREFIX)) {
			cut = i;
			break;
		}
	}
	// Keep any user comments/blank lines sitting just above the foreign table.
	while (
		cut > 1 &&
		(lines[cut - 1].trim() === "" || lines[cut - 1].trimStart().startsWith("#"))
	) {
		cut--;
	}
	return before + lines.slice(cut).join("\n");
}

/**
 * Merge our managed block into an existing hooks.toml: strip any prior managed
 * block, then append the fresh one. Preserves user hooks and is idempotent —
 * no TOML parser needed since we own the block content.
 */
export function getVibeHooksTomlContent(existing: string): string {
	const base = stripVibeManagedBlock(existing).replace(/\s+$/, "");
	const block = buildVibeManagedHooksBlock();
	return base.length > 0 ? `${base}\n\n${block}\n` : `${block}\n`;
}

function stripVibeManagedBlock(existing: string): string {
	const start = existing.indexOf(VIBE_HOOKS_MARKER_START);
	if (start === -1) return existing;
	const end = existing.indexOf(VIBE_HOOKS_MARKER_END, start);
	return end !== -1
		? existing.slice(0, start) +
				existing.slice(end + VIBE_HOOKS_MARKER_END.length)
		: stripOrphanedManagedBlock(existing, start);
}

/**
 * Removes Superset's marker-owned hook block from ~/.vibe/hooks.toml,
 * preserving user hooks. Deletes the file when nothing but the managed block
 * was in it. No-op when the file does not exist.
 */
export function removeVibeManagedHooks(): void {
	const tomlPath = getVibeHooksTomlPath();
	if (!fs.existsSync(tomlPath)) return;
	const existing = fs.readFileSync(tomlPath, "utf-8");
	const base = stripVibeManagedBlock(existing).replace(/\s+$/, "");
	if (base.length === 0) {
		fs.unlinkSync(tomlPath);
		console.log("[agent-setup] Removed Vibe hooks.toml (managed block only)");
		return;
	}
	const changed = writeFileIfChanged(tomlPath, `${base}\n`, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Removed" : "Verified no"} Vibe managed hooks`,
	);
}

export function createVibeHooksToml(): void {
	const tomlPath = getVibeHooksTomlPath();
	const existing = fs.existsSync(tomlPath)
		? fs.readFileSync(tomlPath, "utf-8")
		: "";
	const content = getVibeHooksTomlContent(existing);
	fs.mkdirSync(path.dirname(tomlPath), { recursive: true });
	const changed = writeFileIfChanged(tomlPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Vibe hooks.toml`,
	);
}

/**
 * Wrapper for `vibe`: enables experimental hooks (so hooks.toml loads) and
 * stamps SUPERSET_AGENT_ID so the notify payload carries identity. Modeled on
 * createOpenCodeWrapper (plain export + exec — no session-log watcher).
 */
export function getVibeWrapperScript(): string {
	return buildWrapperScript(
		"vibe",
		'export VIBE_ENABLE_EXPERIMENTAL_HOOKS=true\nexec "$REAL_BIN" "$@"',
		{ agentId: "vibe" },
	);
}

export function createVibeWrapper(): void {
	createWrapper("vibe", getVibeWrapperScript());
}
