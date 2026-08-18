import { dbWs } from "@superset/db/client";
import { automations, automationTriggers } from "@superset/db/schema";
import {
	findGoogleConnection,
	googleConfigOf,
	listUpcomingInstances,
} from "@superset/trpc/integrations/google";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
	loadFirePlan,
	scheduleFires,
	sweepWindow,
} from "../../lib/scheduleCalendarFires";
import { verifyQstashRequest } from "../../lib/verifyQstash";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Every fifteen minutes: for each org with an enabled `starting_soon` or
 * `ended` trigger, list the instances due inside the fire horizon on every
 * watched calendar and hand their fires to QStash. This is what catches
 * triggers created after the event was synced, and recurring instances the
 * incremental sync never sees individually.
 */
export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/integrations/google/jobs/sweep-schedules",
	);
	if (rejected) return rejected;

	const organizations = await dbWs
		.selectDistinct({ organizationId: automationTriggers.organizationId })
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.kind, "google_calendar"),
				eq(automationTriggers.enabled, true),
				eq(automations.enabled, true),
				inArray(sql`${automationTriggers.config}->>'event'`, [
					"event.starting_soon",
					"event.ended",
				]),
			),
		);

	const now = new Date();
	const results = [];
	for (const { organizationId } of organizations) {
		try {
			const connection = await findGoogleConnection(organizationId);
			const plan = await loadFirePlan(organizationId);
			if (!connection || !plan) continue;
			const window = sweepWindow(plan, now);
			let scheduled = 0;
			for (const calendarId of Object.keys(
				googleConfigOf(connection.config).calendars ?? {},
			)) {
				if (!plan.allows(calendarId)) continue;
				const instances = await listUpcomingInstances(
					connection.id,
					calendarId,
					window,
				);
				scheduled += await scheduleFires({
					connectionId: connection.id,
					calendarId,
					instances,
					plan,
					now,
				});
			}
			results.push({ organizationId, scheduled });
		} catch (error) {
			console.error(
				`[google/sweep-schedules] ${organizationId} failed:`,
				error,
			);
			results.push({
				organizationId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return Response.json({ organizations: organizations.length, results });
}
