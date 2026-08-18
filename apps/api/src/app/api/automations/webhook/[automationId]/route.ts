import { createHash } from "node:crypto";
import { db } from "@superset/db/client";
import {
	automationEvents,
	automations,
	automationTriggers,
} from "@superset/db/schema";
import {
	triggerMatches,
	type WebhookMatchableEvent,
} from "@superset/shared/automation-matching";
import {
	bearerToken,
	WEBHOOK_TOKEN_PREFIX,
	webhookTokenMatches,
} from "@superset/trpc/automation-webhook-secret";
import { Client } from "@upstash/qstash";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { stripNullChars } from "@/lib/strip-null-chars";

export const dynamic = "force-dynamic";

const qstash = new Client({
	token: env.QSTASH_TOKEN,
	baseUrl: env.QSTASH_URL,
});

const rateLimit = new Ratelimit({
	redis: new Redis({
		url: env.KV_REST_API_URL,
		token: env.KV_REST_API_TOKEN,
	}),
	limiter: Ratelimit.slidingWindow(300, "1 m"),
	prefix: "ratelimit:automations:webhook",
});

const EVENT_TYPE = "webhook.received";
const MAX_BODY_BYTES = 1024 * 1024;

function externalEventIdFor(
	automationId: string,
	idempotencyKey: string | null,
	body: string,
): string {
	const hash = createHash("sha256");
	if (idempotencyKey) {
		hash.update(`key:${automationId}:${idempotencyKey}`);
	} else {
		const minute = Math.floor(Date.now() / 60_000);
		hash.update(`body:${automationId}:${minute}:`).update(body);
	}
	return hash.digest("hex");
}

function parseBody(body: string): Record<string, unknown> | unknown[] {
	if (body.trim() === "") return {};
	const parsed: unknown = JSON.parse(body);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("not an object");
	}
	return parsed as Record<string, unknown> | unknown[];
}

/**
 * Inbound raw webhook: `POST /api/automations/webhook/{automationId}` with
 * `Authorization: Bearer <token>`. Any authenticated delivery fires every
 * enabled webhook trigger on the automation; there are no filters.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ automationId: string }> },
): Promise<Response> {
	const { automationId } = await params;
	if (!z.string().uuid().safeParse(automationId).success) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	const token = bearerToken(request.headers.get("authorization"));
	if (!token) {
		return Response.json({ error: "Missing bearer token" }, { status: 401 });
	}
	if (!token.startsWith(WEBHOOK_TOKEN_PREFIX)) {
		return Response.json({ error: "Invalid bearer token" }, { status: 401 });
	}

	const { success: withinLimit } = await rateLimit.limit(automationId);
	if (!withinLimit) {
		return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
	}

	const triggers = await db
		.select({
			triggerId: automationTriggers.id,
			config: automationTriggers.config,
			secretHash: automationTriggers.secretHash,
			organizationId: automations.organizationId,
			automationEnabled: automations.enabled,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.automationId, automationId),
				eq(automationTriggers.kind, "webhook"),
				eq(automationTriggers.enabled, true),
			),
		);

	const authenticating = triggers.find((t) =>
		webhookTokenMatches(token, t.secretHash),
	);
	if (!authenticating) {
		return Response.json({ error: "Invalid bearer token" }, { status: 401 });
	}
	const { organizationId } = authenticating;

	const body = await request.text();
	if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
		return Response.json({ error: "Body too large" }, { status: 413 });
	}
	let payload: Record<string, unknown> | unknown[];
	try {
		payload = parseBody(body);
	} catch {
		return Response.json(
			{ error: "Body must be a JSON object" },
			{ status: 400 },
		);
	}

	const externalEventId = externalEventIdFor(
		automationId,
		request.headers.get("idempotency-key"),
		body,
	);

	const [inserted] = await db
		.insert(automationEvents)
		.values({
			organizationId,
			integrationConnectionId: null,
			provider: "webhook",
			eventType: EVENT_TYPE,
			externalEventId,
			resourceKey: null,
			title: "Webhook",
			url: null,
			repositoryId: null,
			ref: null,
			actorLogin: null,
			actorIsExternal: null,
			payload: stripNullChars(payload),
			webhookEventId: null,
		})
		.onConflictDoNothing({
			target: [
				automationEvents.integrationConnectionId,
				automationEvents.provider,
				automationEvents.externalEventId,
			],
		})
		.returning({ id: automationEvents.id });

	if (!inserted) {
		return Response.json({ ok: true, duplicate: true, runs: 0 });
	}

	const event: WebhookMatchableEvent = {
		provider: "webhook",
		eventType: EVENT_TYPE,
		actorId: null,
		actorLogin: null,
		body: null,
	};
	const matched = triggers.filter(
		(t) =>
			t.automationEnabled &&
			triggerMatches(t.config, event, { ownerIds: [] }).matches,
	);

	console.log(
		`[automations/webhook] ${matched.length}/${triggers.length} triggers matched:`,
		inserted.id,
	);

	if (matched.length > 0) {
		try {
			await qstash.batchJSON(
				matched.map((t) => ({
					url: `${env.NEXT_PUBLIC_API_URL}/api/automations/dispatch/${automationId}`,
					body: {
						automationId,
						triggerId: t.triggerId,
						eventId: inserted.id,
					},
					deduplicationId: `${t.triggerId}_${inserted.id}`,
					retries: 2,
					failureCallback: `${env.NEXT_PUBLIC_API_URL}/api/automations/run-failed`,
				})),
			);
		} catch (error) {
			console.error("[automations/webhook] dispatch failed:", error);
			await db
				.delete(automationEvents)
				.where(eq(automationEvents.id, inserted.id));
			return Response.json({ error: "Dispatch failed" }, { status: 500 });
		}
	}

	return Response.json({
		ok: true,
		eventId: inserted.id,
		runs: matched.length,
	});
}
