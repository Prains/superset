import { z } from "zod";
import { usageHistoryTask } from "../../../workers/tasks/usage";
import { queryProcedure, router } from "../../index";
import { offLoop } from "../../off-loop";
import { fetchClaudeAccounts } from "./claude";
import { fetchCodexAccounts } from "./codex";
import type { UsageAccount } from "./types";

/**
 * Provider quota endpoints are undocumented and rate-limit-sensitive, so
 * results are cached briefly and concurrent callers share one in-flight
 * request. The cached promise is evicted on rejection so a failure does not
 * replay for the whole TTL.
 */
const QUOTA_CACHE_TTL_MS = 60 * 1000;

let cachedQuota: { promise: Promise<UsageAccount[]>; cachedAt: number } | null =
	null;

function loadAccounts(): Promise<UsageAccount[]> {
	return Promise.all([fetchClaudeAccounts(), fetchCodexAccounts()]).then(
		(groups) => groups.flat(),
	);
}

function getQuota(forceRefresh: boolean): Promise<UsageAccount[]> {
	if (
		!forceRefresh &&
		cachedQuota &&
		Date.now() - cachedQuota.cachedAt < QUOTA_CACHE_TTL_MS
	) {
		return cachedQuota.promise;
	}

	const promise = loadAccounts();
	const entry = { promise, cachedAt: Date.now() };
	cachedQuota = entry;
	promise.catch(() => {
		if (cachedQuota === entry) cachedQuota = null;
	});
	return promise;
}

export const usageRouter = router({
	quota: queryProcedure
		.meta({ timeoutMs: 15_000 })
		.input(z.object({ forceRefresh: z.boolean().optional() }).optional())
		.query(({ input }) => getQuota(input?.forceRefresh ?? false)),

	/**
	 * Token/cost history estimated from the providers' own transcript logs,
	 * priced at API list rates. Runs in the worker pool — the transcript
	 * trees reach multiple GB. Coalesced per window so concurrent callers
	 * (and the renderer's poll) share one scan.
	 */
	history: queryProcedure
		.meta({ timeoutMs: 120_000 })
		.input(z.object({ days: z.number().int().min(1).max(90) }))
		.query(
			offLoop({
				task: usageHistoryTask,
				prepare: ({ input }) => ({ days: input.days }),
				options: ({ input }) => ({
					dedupeKey: `usage-history:${input.days}`,
					timeoutMs: 110_000,
				}),
			}),
		),
});

export type {
	UsageDailyBucket,
	UsageHistory,
	UsageModelBreakdown,
	UsageProjectBreakdown,
} from "./history/aggregate";
export type { UsageAccount, UsageProvider, UsageQuotaWindow } from "./types";
