import { randomUUID } from "node:crypto";
import {
	existsSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CLIError } from "@superset/cli-framework";
import { getAppStatePath, getSupersetHomeDir } from "./paths";

export const SYSTEM_THEME_ID = "system";

// Mirrors apps/desktop/src/shared/themes/built-in.
export const BUILT_IN_THEMES = [
	{ id: "dark", name: "Dark", type: "dark" },
	{ id: "light", name: "Light", type: "light" },
	{ id: "monokai", name: "Monokai", type: "dark" },
] as const;

export interface CustomTheme {
	id: string;
	name?: string;
	type?: string;
}

export interface ThemeState {
	activeThemeId: string;
	customThemes: CustomTheme[];
	systemLightThemeId?: string;
	systemDarkThemeId?: string;
}

const DEFAULT_THEME_STATE: ThemeState = {
	activeThemeId: "dark",
	customThemes: [],
	systemLightThemeId: "light",
	systemDarkThemeId: "dark",
};

type AppState = Record<string, unknown> & { themeState?: Partial<ThemeState> };

function readAppState(): AppState {
	const path = getAppStatePath();
	if (!existsSync(path)) {
		throw new CLIError(
			`Superset app state not found at ${path}`,
			"Launch the Superset desktop app once on this machine first.",
		);
	}
	const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
	if (typeof parsed !== "object" || parsed === null) {
		throw new CLIError(`Superset app state at ${path} is not a JSON object`);
	}
	return parsed as AppState;
}

export function readThemeState(): ThemeState {
	const state = readAppState().themeState;
	return {
		...DEFAULT_THEME_STATE,
		...state,
		customThemes: Array.isArray(state?.customThemes)
			? (state.customThemes as CustomTheme[])
			: [],
	};
}

/**
 * Merge a patch into themeState, preserving every other field in
 * app-state.json (tabs, hotkeys, ...). The desktop app only reads this file
 * at startup and overwrites it while running, so callers must tell the user
 * to restart (and ideally quit first).
 */
export function writeThemeState(patch: Partial<ThemeState>): ThemeState {
	const appState = readAppState();
	const themeState = {
		...DEFAULT_THEME_STATE,
		...appState.themeState,
		...patch,
	} as ThemeState;
	const next = { ...appState, themeState };

	const path = getAppStatePath();
	const tempPath = join(
		getSupersetHomeDir(),
		`.${randomUUID()}.${process.pid}.app-state.tmp`,
	);
	writeFileSync(tempPath, JSON.stringify(next, null, 2), { mode: 0o600 });
	try {
		renameSync(tempPath, path);
	} catch (error) {
		try {
			unlinkSync(tempPath);
		} catch {}
		throw error;
	}
	return themeState;
}

export interface ThemeChoice {
	id: string;
	name: string;
	type: string;
	source: "built-in" | "custom" | "system";
}

/** All ids valid for the active theme, including "system". */
export function listThemeChoices(themeState: ThemeState): ThemeChoice[] {
	return [
		{
			id: SYSTEM_THEME_ID,
			name: "System (follows OS appearance)",
			type: "auto",
			source: "system",
		},
		...BUILT_IN_THEMES.map((theme) => ({
			...theme,
			source: "built-in" as const,
		})),
		...themeState.customThemes.map((theme) => ({
			id: theme.id,
			name: theme.name ?? theme.id,
			type: theme.type ?? "unknown",
			source: "custom" as const,
		})),
	];
}

export function requireThemeId(
	themeState: ThemeState,
	id: string,
	options: { allowSystem: boolean },
): string {
	const choices = listThemeChoices(themeState).filter(
		(choice) => options.allowSystem || choice.source !== "system",
	);
	if (!choices.some((choice) => choice.id === id)) {
		throw new CLIError(
			`Unknown theme: ${id}`,
			`Available: ${choices.map((choice) => choice.id).join(", ")}`,
		);
	}
	return id;
}
