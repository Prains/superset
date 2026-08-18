import { createHash } from "node:crypto";
import { db } from "@superset/db/client";
import {
	automationEvents,
	automations,
	automationTriggers,
} from "@superset/db/schema";
import {
	type MatchableEvent,
	triggerMatches,
} from "@superset/shared/automation-matching";
import {
	bearerToken,
	webhookTokenMatches,
} from "@superset/trpc/automation-webhook-secret";
import { Client } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { stripNullChars } from "@/lib/strip-null-chars";

export const dynamic = "force-dynamic";

const qstash = new Client({
	token: env.QSTASH_TOKEN,
	baseUrl: env.QSTASH_URL,
});

const EVENT_TYPE = "webhook.received";

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

function parseBody(body: string): unknown {
	if (body.trim() === "") return {};
	return JSON.parse(body);
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

	const authenticated = triggers.some((t) =>
		webhookTokenMatches(token, t.secretHash),
	);
	if (!authenticated) {
		return Response.json({ error: "Invalid bearer token" }, { status: 401 });
	}
	const organizationId = triggers[0]?.organizationId;
	if (!organizationId) {
		return Response.json({ error: "Invalid bearer token" }, { status: 401 });
	}

	const body = await request.text();
	let payload: unknown;
	try {
		payload = parseBody(body);
	} catch {
		return Response.json({ error: "Body must be JSON" }, { status: 400 });
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

	const event: MatchableEvent = {
		eventType: EVENT_TYPE,
		repositoryId: null,
		ref: null,
		actorId: null,
		actorLogin: null,
		actorIsExternal: null,
		labels: [],
		body: null,
		isFork: false,
		subjectAuthorId: null,
	};
	const matched = triggers.filter(
		(t) => t.automationEnabled && triggerMatches(t.config, event, {}).matches,
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
			return Response.json(
				{ error: "Dispatch failed", eventId: inserted.id },
				{ status: 500 },
			);
		}
	}

	return Response.json({
		ok: true,
		eventId: inserted.id,
		runs: matched.length,
	});
}
