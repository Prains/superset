import { dbWs } from "@superset/db/client";
import {
	automations,
	automationTriggers,
	userIdentities,
} from "@superset/db/schema";
import {
	type MatchableEvent,
	triggerMatches,
} from "@superset/shared/automation-matching";
import type { LinearTriggerEvent } from "@superset/shared/automation-triggers";
import { Client } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import type { LinearDelivery } from "./recordAutomationEvent";

const qstash = new Client({
	token: env.QSTASH_TOKEN,
	baseUrl: env.QSTASH_URL,
});

function matchableFrom(delivery: LinearDelivery): MatchableEvent {
	return {
		eventType: `${delivery.type}.${delivery.action}`,
		repositoryId: null,
		ref: null,
		actorId: delivery.actor?.id ?? null,
		actorLogin: delivery.actor?.name ?? null,
		actorIsExternal: null,
		// Ids, not names: a label can be renamed and triggers must keep matching.
		labels: delivery.data.labelIds ?? [],
		body: null,
		isFork: false,
		subjectAuthorId: null,
	};
}

/**
 * Finds the Linear triggers an event satisfies and enqueues a run for each.
 * The same shape as the GitHub dispatcher: enabled automations only, `me`
 * resolved per candidate through the owner's linked Linear identities.
 */
export async function dispatchMatchingTriggers(params: {
	organizationId: string;
	eventId: string;
	names: LinearTriggerEvent[];
	delivery: LinearDelivery;
}): Promise<{ matched: number; considered: number }> {
	if (params.names.length === 0) return { matched: 0, considered: 0 };

	const candidates = await dbWs
		.select({
			triggerId: automationTriggers.id,
			config: automationTriggers.config,
			automationId: automations.id,
			ownerUserId: automations.ownerUserId,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.organizationId, params.organizationId),
				eq(automationTriggers.kind, "linear"),
				eq(automationTriggers.enabled, true),
				eq(automations.enabled, true),
			),
		);

	if (candidates.length === 0) return { matched: 0, considered: 0 };

	const identities = await dbWs
		.select({
			userId: userIdentities.userId,
			externalId: userIdentities.externalId,
		})
		.from(userIdentities)
		.where(
			and(
				eq(userIdentities.organizationId, params.organizationId),
				eq(userIdentities.provider, "linear"),
			),
		);
	const linearIdsByUser = new Map<string, string[]>();
	for (const row of identities) {
		const existing = linearIdsByUser.get(row.userId);
		if (existing) existing.push(row.externalId);
		else linearIdsByUser.set(row.userId, [row.externalId]);
	}

	const event = matchableFrom(params.delivery);
	const { data } = params.delivery;

	const matched = candidates.filter(
		(candidate) =>
			triggerMatches(candidate.config, event, {
				linear: {
					names: params.names,
					teamId: data.teamId ?? null,
					projectId: data.projectId ?? null,
					stateId: data.stateId ?? null,
					assigneeId: data.assigneeId ?? null,
					ownerIds: linearIdsByUser.get(candidate.ownerUserId) ?? [],
				},
			}).matches,
	);

	if (matched.length === 0) {
		return { matched: 0, considered: candidates.length };
	}

	await qstash.batchJSON(
		matched.map((candidate) => ({
			url: `${env.NEXT_PUBLIC_API_URL}/api/automations/dispatch/${candidate.automationId}`,
			body: {
				automationId: candidate.automationId,
				triggerId: candidate.triggerId,
				eventId: params.eventId,
			},
			// One run per trigger per event, however many times Linear redelivers.
			deduplicationId: `${candidate.triggerId}_${params.eventId}`,
			retries: 2,
			failureCallback: `${env.NEXT_PUBLIC_API_URL}/api/automations/run-failed`,
		})),
	);

	return { matched: matched.length, considered: candidates.length };
}
