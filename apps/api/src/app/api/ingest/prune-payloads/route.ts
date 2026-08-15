import { dbWs } from "@superset/db/client";
import { Receiver } from "@upstash/qstash";
import { sql } from "drizzle-orm";

import { env } from "@/env";

export const dynamic = "force-dynamic";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

/**
 * How long a raw payload is worth keeping. Nothing reads it back — its only use
 * is inspecting a delivery by hand, which is a days-old question, not a
 * months-old one. Everything identifying the event outlives it.
 */
const RETAIN_DAYS = 14;

/** Small enough that one statement is a short transaction on a 90M-row table. */
const BATCH_SIZE = 5_000;

/** Well inside the function timeout, so a run ends by choice rather than by kill. */
const TIME_BUDGET_MS = 20_000;

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const valid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/ingest/prune-payloads`,
	});
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const startedAt = Date.now();
	let pruned = 0;
	let batches = 0;
	// Pruned rows form a contiguous oldest-first prefix, so without this the scan
	// re-skips everything it already cleared on every batch. Carrying the high
	// water mark within a run means that cost is paid once, not per batch.
	let cursor: string | null = null;

	// One statement per batch, each its own transaction, so WAL stays bounded and
	// a long backlog is chewed through across runs rather than in one held-open
	// transaction.
	while (Date.now() - startedAt < TIME_BUDGET_MS) {
		const rows = await dbWs.execute(sql`
			WITH batch AS (
				SELECT id, received_at
				FROM ingest.webhook_events
				WHERE payload IS NOT NULL
				  AND received_at < now() - ${`${RETAIN_DAYS} days`}::interval
				  AND status IN ('processed', 'skipped')
				  ${cursor ? sql`AND received_at >= ${cursor}::timestamp` : sql``}
				ORDER BY received_at
				LIMIT ${BATCH_SIZE}
			)
			UPDATE ingest.webhook_events e
			SET payload = NULL
			FROM batch
			WHERE e.id = batch.id
			RETURNING batch.received_at
		`);

		const returned = rows.rows as Array<{ received_at: string }>;
		pruned += returned.length;
		batches++;
		if (returned.length < BATCH_SIZE) break;

		// Rows are ordered, so the last one is the mark to resume from.
		cursor = returned[returned.length - 1]?.received_at ?? cursor;
	}

	return Response.json({
		pruned,
		batches,
		retainDays: RETAIN_DAYS,
		elapsedMs: Date.now() - startedAt,
	});
}
