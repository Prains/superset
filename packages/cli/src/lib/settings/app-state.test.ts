import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	listThemeChoices,
	readThemeState,
	requireThemeId,
	writeThemeState,
} from "./app-state";

let homeDir: string;
let previousHome: string | undefined;

function writeAppState(state: Record<string, unknown>) {
	writeFileSync(
		join(homeDir, "app-state.json"),
		JSON.stringify(state, null, 2),
	);
}

beforeEach(() => {
	previousHome = process.env.SUPERSET_HOME_DIR;
	homeDir = mkdtempSync(join(tmpdir(), "superset-cli-appstate-"));
	process.env.SUPERSET_HOME_DIR = homeDir;
});

afterEach(() => {
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	rmSync(homeDir, { recursive: true, force: true });
});

describe("theme state", () => {
	test("read errors when app-state.json is missing", () => {
		expect(() => readThemeState()).toThrow(/not found/);
	});

	test("read fills defaults for missing fields", () => {
		writeAppState({ themeState: { activeThemeId: "monokai" } });
		const state = readThemeState();
		expect(state.activeThemeId).toBe("monokai");
		expect(state.systemLightThemeId).toBe("light");
		expect(state.customThemes).toEqual([]);
	});

	test("write patches themeState and preserves unrelated app state", () => {
		writeAppState({
			tabsState: { tabs: [{ id: "tab-1" }] },
			themeState: { activeThemeId: "dark", customThemes: [] },
			lastRunVersion: "1.20.2",
		});
		writeThemeState({ activeThemeId: "light" });

		const raw = JSON.parse(
			readFileSync(join(homeDir, "app-state.json"), "utf-8"),
		);
		expect(raw.themeState.activeThemeId).toBe("light");
		expect(raw.tabsState.tabs[0].id).toBe("tab-1");
		expect(raw.lastRunVersion).toBe("1.20.2");
	});

	test("theme choices include system, built-ins, and custom themes", () => {
		writeAppState({
			themeState: {
				activeThemeId: "dark",
				customThemes: [{ id: "dracula", name: "Dracula", type: "dark" }],
			},
		});
		const ids = listThemeChoices(readThemeState()).map((choice) => choice.id);
		expect(ids).toEqual(["system", "dark", "light", "monokai", "dracula"]);
	});

	test("requireThemeId validates ids and gates the system pseudo-theme", () => {
		writeAppState({ themeState: { activeThemeId: "dark", customThemes: [] } });
		const state = readThemeState();
		expect(requireThemeId(state, "monokai", { allowSystem: false })).toBe(
			"monokai",
		);
		expect(requireThemeId(state, "system", { allowSystem: true })).toBe(
			"system",
		);
		expect(() =>
			requireThemeId(state, "system", { allowSystem: false }),
		).toThrow(/Unknown theme/);
		expect(() =>
			requireThemeId(state, "dracula", { allowSystem: true }),
		).toThrow(/Unknown theme/);
	});
});
