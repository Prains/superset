/**
 * Streaming parsers for the providers' own transcript files — the same
 * source ccusage and T3 Code read, so usage is complete even for turns not
 * driven through Superset.
 *
 * Correctness rules learned from prior art (see
 * plans/20260815-token-spend-twitter-feedback.md):
 * - Claude: count only `type === "assistant"` lines with usage, dedupe on
 *   `message.id + requestId` — the same message is rewritten into multiple
 *   files on resume/fork/compaction, and naive parsers over-count.
 * - Codex: read `payload.info.last_token_usage` (per-turn delta), never
 *   `total_token_usage` (cumulative). Model/cwd ride on `turn_context`
 *   events and carry forward. `input_tokens` is INCLUSIVE of cached tokens.
 * - Reasoning tokens are a subset of output — never added on top.
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { UsageProvider } from "../types";
import type { LogFile } from "./logs";

export interface UsageLogEntry {
	provider: UsageProvider;
	model: string;
	timestampMs: number;
	cwd: string | null;
	uncachedInput: number;
	cachedInput: number;
	cacheWrite5m: number;
	cacheWrite1h: number;
	output: number;
	reasoningOutput: number;
}

async function forEachLine(
	path: string,
	onLine: (line: string) => void,
): Promise<void> {
	try {
		const rl = createInterface({
			input: createReadStream(path, { encoding: "utf-8" }),
			crlfDelay: Number.POSITIVE_INFINITY,
		});
		for await (const line of rl) onLine(line);
	} catch {
		// Unreadable or vanished mid-scan — skip the file.
	}
}

function num(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

interface ClaudeLine {
	type?: string;
	requestId?: string;
	isSidechain?: boolean;
	timestamp?: string;
	cwd?: string;
	message?: {
		id?: string;
		model?: string;
		usage?: {
			input_tokens?: number;
			output_tokens?: number;
			cache_read_input_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_creation?: {
				ephemeral_5m_input_tokens?: number;
				ephemeral_1h_input_tokens?: number;
			};
			output_tokens_details?: { thinking_tokens?: number };
		};
	};
}

/**
 * Parses `~/.claude/projects/<encoded-cwd>/*.jsonl`. `entriesByMessage` is
 * shared across all files so resumed/forked sessions dedupe globally.
 *
 * Dedupe keeps the LAST occurrence per `message.id + requestId`: Claude Code
 * writes one assistant line per content block with a usage snapshot that
 * grows as the response streams, so only the final line carries the request's
 * complete usage (verified token-exact against ccusage; first-wins
 * undercounts output ~10%).
 */
export async function parseClaudeLogFile(
	file: LogFile,
	entriesByMessage: Map<string, UsageLogEntry>,
	cutoffMs: number,
	out: UsageLogEntry[],
): Promise<void> {
	await forEachLine(file.path, (line) => {
		if (!line.includes('"assistant"')) return;
		let parsed: ClaudeLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (parsed.type !== "assistant") return;
		const usage = parsed.message?.usage;
		const model = parsed.message?.model;
		if (!usage || !model || model === "<synthetic>") return;

		const timestampMs = parsed.timestamp
			? Date.parse(parsed.timestamp)
			: file.mtimeMs;
		if (!Number.isFinite(timestampMs) || timestampMs < cutoffMs) return;

		const cacheWriteTotal = num(usage.cache_creation_input_tokens);
		const write5m = num(usage.cache_creation?.ephemeral_5m_input_tokens);
		const write1h = num(usage.cache_creation?.ephemeral_1h_input_tokens);
		const entry: UsageLogEntry = {
			provider: "claude",
			model,
			timestampMs,
			cwd: typeof parsed.cwd === "string" ? parsed.cwd : null,
			// Anthropic's input_tokens excludes cache reads and writes.
			uncachedInput: num(usage.input_tokens),
			cachedInput: num(usage.cache_read_input_tokens),
			// Older logs lack the 5m/1h split; treat the total as 5m writes.
			cacheWrite5m: write5m + write1h > 0 ? write5m : cacheWriteTotal,
			cacheWrite1h: write1h,
			output: num(usage.output_tokens),
			reasoningOutput: num(usage.output_tokens_details?.thinking_tokens),
		};

		const dedupeKey = `${parsed.message?.id ?? ""}|${parsed.requestId ?? ""}`;
		if (dedupeKey === "|") {
			out.push(entry);
		} else {
			entriesByMessage.set(dedupeKey, entry);
		}
	});
}

interface CodexLine {
	type?: string;
	timestamp?: string;
	payload?: {
		type?: string;
		model?: string;
		cwd?: string;
		info?: {
			last_token_usage?: {
				input_tokens?: number;
				cached_input_tokens?: number;
				cache_write_input_tokens?: number;
				output_tokens?: number;
				reasoning_output_tokens?: number;
			};
		};
	};
}

/** Parses `$CODEX_HOME/sessions/**\/*.jsonl` rollout files. */
export async function parseCodexLogFile(
	file: LogFile,
	cutoffMs: number,
	out: UsageLogEntry[],
): Promise<void> {
	let currentModel: string | null = null;
	let currentCwd: string | null = null;
	// Codex occasionally re-emits the same token_count event back-to-back;
	// skipping consecutive identical deltas brings summed deltas within ~1%
	// of the session's own cumulative total_token_usage counter.
	let previousDeltaSignature: string | null = null;

	await forEachLine(file.path, (line) => {
		const isContext =
			line.includes('"turn_context"') || line.includes('"session_meta"');
		if (!isContext && !line.includes('"token_count"')) return;
		let parsed: CodexLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}

		if (parsed.type === "turn_context" || parsed.type === "session_meta") {
			if (typeof parsed.payload?.model === "string") {
				currentModel = parsed.payload.model;
			}
			if (typeof parsed.payload?.cwd === "string") {
				currentCwd = parsed.payload.cwd;
			}
			return;
		}

		if (parsed.payload?.type !== "token_count") return;
		const usage = parsed.payload.info?.last_token_usage;
		if (!usage) return;

		const signature = JSON.stringify(usage);
		if (signature === previousDeltaSignature) return;
		previousDeltaSignature = signature;

		const timestampMs = parsed.timestamp
			? Date.parse(parsed.timestamp)
			: file.mtimeMs;
		if (!Number.isFinite(timestampMs) || timestampMs < cutoffMs) return;

		const input = num(usage.input_tokens);
		const cached = num(usage.cached_input_tokens);
		out.push({
			provider: "codex",
			model: currentModel ?? "unknown",
			timestampMs,
			cwd: currentCwd,
			// OpenAI's input_tokens includes cached tokens; split them out.
			uncachedInput: Math.max(0, input - cached),
			cachedInput: cached,
			cacheWrite5m: num(usage.cache_write_input_tokens),
			cacheWrite1h: 0,
			output: num(usage.output_tokens),
			reasoningOutput: num(usage.reasoning_output_tokens),
		});
	});
}
