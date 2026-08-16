import { homedir } from "node:os";
import { basename, join } from "node:path";
import { discoverClaudeProfiles, discoverCodexHomes } from "../profiles";
import type { UsageProvider } from "../types";
import { collectLogFiles } from "./logs";
import type { UsageLogEntry } from "./parse";
import { parseClaudeLogFile, parseCodexLogFile } from "./parse";
import {
	cacheSavingsUsd,
	costUsd,
	matchModelRate,
	PRICING_TABLE_UPDATED,
} from "./pricing";

export interface UsageDailyBucket {
	/** Local calendar day, `YYYY-MM-DD` in the host's timezone. */
	day: string;
	providers: Partial<Record<UsageProvider, { usd: number; tokens: number }>>;
	usd: number;
	tokens: number;
}

export interface UsageModelBreakdown {
	provider: UsageProvider;
	model: string;
	usd: number;
	tokens: number;
	approximate: boolean;
}

/** Maps a filesystem prefix to a display label for cwd attribution. */
export interface CwdLabel {
	prefix: string;
	label: string;
	kind: "workspace" | "project";
}

export interface UsageProjectBreakdown {
	/** Workspace/project name when the cwd matched a known worktree or repo
	 * path; otherwise a directory-derived fallback. */
	project: string;
	kind: "workspace" | "project" | "other";
	usd: number;
	tokens: number;
}

export interface UsageHistory {
	days: number;
	buckets: UsageDailyBucket[];
	models: UsageModelBreakdown[];
	projects: UsageProjectBreakdown[];
	totals: {
		usd: number;
		tokens: number;
		uncachedInput: number;
		cachedInput: number;
		cacheWrite: number;
		output: number;
		reasoningOutput: number;
		cacheSavingsUsd: number;
		/** True when any usage was priced with a fallback rate. */
		approximate: boolean;
	};
	scannedFiles: number;
	pricingTableUpdated: string;
}

/** Local-timezone calendar day, matching what the user's clock says. */
function dayKey(timestampMs: number): string {
	const date = new Date(timestampMs);
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

function entryTokens(entry: UsageLogEntry): number {
	return (
		entry.uncachedInput +
		entry.cachedInput +
		entry.cacheWrite5m +
		entry.cacheWrite1h +
		entry.output
	);
}

/**
 * Attributes a transcript cwd to a workspace/project. Known prefixes (the
 * host's own workspace worktrees and project repos) win via longest-prefix
 * match; unknown paths fall back to the worktree-name segment or basename.
 */
function attributeCwd(
	cwd: string,
	labelsByLength: CwdLabel[],
): { label: string; kind: UsageProjectBreakdown["kind"] } {
	for (const { prefix, label, kind } of labelsByLength) {
		if (
			cwd === prefix ||
			(cwd.startsWith(prefix) && cwd[prefix.length] === "/")
		) {
			return { label, kind };
		}
	}
	// `…/worktrees/<container>/<workspace-name>/…` → the workspace name.
	const segments = cwd.split("/");
	const worktreesIndex = segments.lastIndexOf("worktrees");
	if (worktreesIndex >= 0 && segments.length > worktreesIndex + 2) {
		const name = segments[worktreesIndex + 2];
		if (name) return { label: name, kind: "other" };
	}
	return { label: basename(cwd), kind: "other" };
}

export async function computeUsageHistory(
	days: number,
	cwdLabels: CwdLabel[] = [],
): Promise<UsageHistory> {
	const home = homedir();
	const labelsByLength = [...cwdLabels].sort(
		(a, b) => b.prefix.length - a.prefix.length,
	);
	const cutoffMs = (() => {
		// Align to local midnight `days - 1` days ago, so totals equal the sum
		// of the daily buckets shown.
		const start = new Date();
		start.setHours(0, 0, 0, 0);
		start.setDate(start.getDate() - (days - 1));
		return start.getTime();
	})();

	// Same homes the quota discovery covers: the default locations, any
	// CLAUDE_CONFIG_DIR entries (comma-list), and auto-discovered profile /
	// CODEX_HOME dirs — a custom config dir keeps its transcripts INSIDE the
	// dir, so multi-account history means scanning every profile's projects/.
	const claudeHomes = new Set<string>([
		join(home, ".claude"),
		join(home, ".config", "claude"),
	]);
	for (const dir of (process.env.CLAUDE_CONFIG_DIR ?? "").split(",")) {
		if (dir.trim()) claudeHomes.add(dir.trim());
	}
	const [claudeProfiles, codexHomes] = await Promise.all([
		discoverClaudeProfiles(),
		discoverCodexHomes(),
	]);
	for (const profile of claudeProfiles) claudeHomes.add(profile.configDir);

	const [claudeFileGroups, codexFileGroups] = await Promise.all([
		Promise.all(
			[...claudeHomes].map((root) =>
				collectLogFiles(join(root, "projects"), days + 1),
			),
		),
		Promise.all(
			codexHomes.map((codexHome) =>
				collectLogFiles(join(codexHome.home, "sessions"), days + 1),
			),
		),
	]);
	const claudeFiles = claudeFileGroups.flat();
	const codexFiles = codexFileGroups.flat();

	const entries: UsageLogEntry[] = [];
	const claudeEntriesByMessage = new Map<string, UsageLogEntry>();
	for (const file of claudeFiles) {
		await parseClaudeLogFile(file, claudeEntriesByMessage, cutoffMs, entries);
	}
	entries.push(...claudeEntriesByMessage.values());
	for (const file of codexFiles) {
		await parseCodexLogFile(file, cutoffMs, entries);
	}

	const bucketsByDay = new Map<string, UsageDailyBucket>();
	const modelsByKey = new Map<string, UsageModelBreakdown>();
	const projectsByKey = new Map<string, UsageProjectBreakdown>();
	const totals = {
		usd: 0,
		tokens: 0,
		uncachedInput: 0,
		cachedInput: 0,
		cacheWrite: 0,
		output: 0,
		reasoningOutput: 0,
		cacheSavingsUsd: 0,
		approximate: false,
	};

	for (const entry of entries) {
		const rate = matchModelRate(entry.provider, entry.model);
		const usd = costUsd(rate, entry);
		const tokens = entryTokens(entry);

		const day = dayKey(entry.timestampMs);
		let bucket = bucketsByDay.get(day);
		if (!bucket) {
			bucket = { day, providers: {}, usd: 0, tokens: 0 };
			bucketsByDay.set(day, bucket);
		}
		const providerSlot = (bucket.providers[entry.provider] ??= {
			usd: 0,
			tokens: 0,
		});
		providerSlot.usd += usd;
		providerSlot.tokens += tokens;
		bucket.usd += usd;
		bucket.tokens += tokens;

		const modelKey = `${entry.provider}|${entry.model}`;
		let model = modelsByKey.get(modelKey);
		if (!model) {
			model = {
				provider: entry.provider,
				model: entry.model,
				usd: 0,
				tokens: 0,
				approximate: rate.approximate,
			};
			modelsByKey.set(modelKey, model);
		}
		model.usd += usd;
		model.tokens += tokens;

		if (entry.cwd) {
			const { label, kind } = attributeCwd(entry.cwd, labelsByLength);
			let projectRow = projectsByKey.get(label);
			if (!projectRow) {
				projectRow = { project: label, kind, usd: 0, tokens: 0 };
				projectsByKey.set(label, projectRow);
			}
			projectRow.usd += usd;
			projectRow.tokens += tokens;
		}

		totals.usd += usd;
		totals.tokens += tokens;
		totals.uncachedInput += entry.uncachedInput;
		totals.cachedInput += entry.cachedInput;
		totals.cacheWrite += entry.cacheWrite5m + entry.cacheWrite1h;
		totals.output += entry.output;
		totals.reasoningOutput += entry.reasoningOutput;
		totals.cacheSavingsUsd += cacheSavingsUsd(rate, entry);
		totals.approximate ||= rate.approximate;
	}

	// Emit a contiguous day series so charts show gaps as zero, not missing.
	const buckets: UsageDailyBucket[] = [];
	for (let i = 0; i < days; i++) {
		const date = new Date(cutoffMs);
		date.setDate(date.getDate() + i);
		const key = dayKey(date.getTime());
		buckets.push(
			bucketsByDay.get(key) ?? { day: key, providers: {}, usd: 0, tokens: 0 },
		);
	}

	return {
		days,
		buckets,
		models: [...modelsByKey.values()].sort((a, b) => b.usd - a.usd),
		projects: [...projectsByKey.values()].sort((a, b) => b.usd - a.usd),
		totals,
		scannedFiles: claudeFiles.length + codexFiles.length,
		pricingTableUpdated: PRICING_TABLE_UPDATED,
	};
}
