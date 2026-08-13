import { db, dbWs } from "@superset/db/client";
import {
	factoryItems,
	factoryRuns,
	type SelectFactory,
	type SelectFactoryItem,
} from "@superset/db/schema";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { dispatchStageQueued } from "./queue";
import {
	AGENT_STAGES,
	type AgentStage,
	isAgentStage,
	STAGE_FLOW,
} from "./stages";

/** A run stuck in "dispatching" this long never reached the host. */
const DISPATCHING_EXPIRY_MS = 15 * 60 * 1000;
/** A dispatched agent that hasn't reported after this long is presumed dead. */
const DISPATCHED_EXPIRY_MS = 8 * 60 * 60 * 1000;
/** Live agent runs a factory may have at once (sweep-dispatched). */
const MAX_CONCURRENT_RUNS = 3;
/** Sweep stops retrying a stage after this many attempts; humans take over. */
const MAX_ATTEMPTS = 3;

export interface SweepResult {
	expired: number;
	dispatched: number;
}

/**
 * The factory's heartbeat — makes the pipeline work without events:
 * 1. Expire stale runs (never-reached-host, or agent died without
 *    reporting) so items surface in needs-attention instead of limbo.
 * 2. With autoAdvance: dispatch intake items and re-dispatch wedged agent
 *    stages (dispatch failures, expired runs) under a concurrency cap and
 *    attempt limit. Agent-reported "blocked" stays human-gated — the sweep
 *    never overrides a deliberate stop.
 * Called by the QStash cron (apps/api /api/factory/evaluate) and the
 * factory.sweepNow procedure.
 */
export async function sweepFactory(
	factory: SelectFactory,
): Promise<SweepResult> {
	const result: SweepResult = { expired: 0, dispatched: 0 };
	if (!factory.enabled) return result;

	const now = Date.now();
	const expired = await dbWs
		.update(factoryRuns)
		.set({
			status: "dispatch_failed",
			error: "expired: agent never reported",
		})
		.where(
			and(
				eq(factoryRuns.factoryId, factory.id),
				or(
					and(
						eq(factoryRuns.status, "dispatching"),
						lt(factoryRuns.createdAt, new Date(now - DISPATCHING_EXPIRY_MS)),
					),
					and(
						eq(factoryRuns.status, "dispatched"),
						lt(factoryRuns.dispatchedAt, new Date(now - DISPATCHED_EXPIRY_MS)),
					),
				),
			),
		)
		.returning({ itemId: factoryRuns.itemId, stage: factoryRuns.stage });
	result.expired = expired.length;
	for (const run of expired) {
		await dbWs
			.update(factoryItems)
			.set({
				blockedReason: `${run.stage} agent never reported — expired by sweep`,
				revision: sql`${factoryItems.revision} + 1`,
			})
			.where(eq(factoryItems.id, run.itemId));
	}

	if (!factory.autoAdvance) return result;

	const [{ active }] = (await db
		.select({ active: sql<number>`count(*)::int` })
		.from(factoryRuns)
		.where(
			and(
				eq(factoryRuns.factoryId, factory.id),
				inArray(factoryRuns.status, ["dispatching", "dispatched"]),
			),
		)) as [{ active: number }];
	let budget = MAX_CONCURRENT_RUNS - active;
	if (budget <= 0) return result;

	const candidates = await db
		.select()
		.from(factoryItems)
		.where(
			and(
				eq(factoryItems.factoryId, factory.id),
				isNull(factoryItems.archivedAt),
				isNull(factoryItems.blockedReason),
				inArray(factoryItems.stage, ["intake", ...AGENT_STAGES]),
			),
		)
		.orderBy(factoryItems.stageEnteredAt);

	for (const item of candidates) {
		if (budget <= 0) break;
		const stage = dispatchableStage(item);
		if (!stage) continue;
		const [attemptRow] = await db
			.select({ n: sql<number>`count(*)::int` })
			.from(factoryRuns)
			.where(
				and(eq(factoryRuns.itemId, item.id), eq(factoryRuns.stage, stage)),
			);
		const attempts = attemptRow?.n ?? 0;
		// An unreported live run means an agent is (or may be) working —
		// leave it alone. Expired ones were already flipped above.
		const [live] = await db
			.select({ id: factoryRuns.id })
			.from(factoryRuns)
			.where(
				and(
					eq(factoryRuns.itemId, item.id),
					inArray(factoryRuns.status, ["dispatching", "dispatched"]),
				),
			)
			.limit(1);
		if (live) continue;
		if (attempts >= MAX_ATTEMPTS) continue;

		const outcome = await dispatchStageQueued({
			factory,
			item,
			stage,
			expectedRevision: item.revision,
		});
		if (outcome !== "failed") {
			result.dispatched += 1;
			budget -= 1;
		}
	}
	return result;
}

function dispatchableStage(item: SelectFactoryItem): AgentStage | null {
	if (item.stage === "intake") {
		const next = STAGE_FLOW.intake;
		return next && isAgentStage(next) ? next : null;
	}
	return isAgentStage(item.stage) ? item.stage : null;
}
