import { db } from "@superset/db/client";
import { automationEvents, githubInstallations } from "@superset/db/schema";
import { eq } from "drizzle-orm";

/**
 * Records an incoming GitHub delivery as an `automation_events` row.
 *
 * This is the normalized event stream triggers are matched against. It keeps
 * its own copy of the payload because `ingest.webhook_events` is pruned, and
 * flattens the handful of fields matching and prompting actually need out of
 * payloads whose shape differs per event.
 *
 * Recording is deliberately separate from matching: nothing reads these rows
 * yet, so a mistake here shows up as a wrong row rather than an agent running
 * on the wrong pull request.
 */

export type GithubPayload = {
	action?: string;
	installation?: { id?: number | string };
	repository?: { id?: number | string; full_name?: string };
	sender?: { login?: string; type?: string };
	pull_request?: {
		number?: number;
		title?: string;
		html_url?: string;
		head?: { ref?: string };
		user?: { login?: string };
		draft?: boolean;
	};
	issue?: {
		number?: number;
		title?: string;
		html_url?: string;
		user?: { login?: string };
	};
	comment?: { body?: string; html_url?: string; user?: { login?: string } };
	review?: { state?: string; html_url?: string; user?: { login?: string } };
	ref?: string;
	workflow_run?: { conclusion?: string; html_url?: string; name?: string };
	check_suite?: { conclusion?: string };
	label?: { name?: string };
};

/**
 * The subject a run would act on — a pull request, an issue, a branch. Runs key
 * debounce and in-flight limits off this, so two comments on one PR are the
 * same resource rather than two.
 */
export function resourceKeyFor(
	payload: GithubPayload,
	eventType: string,
): string | null {
	const repo = payload.repository?.full_name;
	if (!repo) return null;
	const pr = payload.pull_request?.number ?? payload.issue?.number;
	if (pr !== undefined) return `github:${repo}#${pr}`;
	if (eventType === "push" && payload.ref) {
		return `github:${repo}@${payload.ref}`;
	}
	return `github:${repo}`;
}

export function titleFor(payload: GithubPayload, eventType: string): string {
	const subject = payload.pull_request?.title ?? payload.issue?.title;
	if (subject) return subject;
	if (payload.workflow_run?.name) return payload.workflow_run.name;
	if (eventType === "push" && payload.ref) return payload.ref;
	return payload.repository?.full_name ?? eventType;
}

export function urlFor(payload: GithubPayload): string | null {
	return (
		payload.comment?.html_url ??
		payload.review?.html_url ??
		payload.pull_request?.html_url ??
		payload.issue?.html_url ??
		payload.workflow_run?.html_url ??
		null
	);
}

export async function recordAutomationEvent(params: {
	eventType: string;
	deliveryId: string;
	payload: unknown;
	webhookEventId: string;
}): Promise<{ recorded: boolean; reason?: string }> {
	const payload = params.payload as GithubPayload;

	const installationId = payload.installation?.id;
	if (installationId === undefined) {
		// Pings and a few org-level events carry no installation, so there is no
		// organization to attribute them to.
		return { recorded: false, reason: "no installation" };
	}

	const [installation] = await db
		.select({ organizationId: githubInstallations.organizationId })
		.from(githubInstallations)
		.where(eq(githubInstallations.installationId, String(installationId)))
		.limit(1);

	if (!installation) {
		return { recorded: false, reason: "unknown installation" };
	}

	// `action` is what distinguishes opened from closed from labeled; the bare
	// event name is too coarse to match on.
	const qualified = payload.action
		? `${params.eventType}.${payload.action}`
		: params.eventType;

	await db
		.insert(automationEvents)
		.values({
			organizationId: installation.organizationId,
			// GitHub installs are their own connection record, not an
			// integration_connections row, so provenance is the delivery below.
			integrationConnectionId: null,
			provider: "github",
			eventType: qualified,
			externalEventId: params.deliveryId,
			resourceKey: resourceKeyFor(payload, params.eventType),
			title: titleFor(payload, params.eventType),
			url: urlFor(payload),
			repositoryId: payload.repository?.full_name ?? null,
			ref: payload.pull_request?.head?.ref ?? payload.ref ?? null,
			actorLogin: payload.sender?.login ?? null,
			// Bots and outside contributors are the payloads worth treating with
			// suspicion; recorded now so matching can filter on it later.
			actorIsExternal: payload.sender?.type
				? payload.sender.type !== "User"
				: null,
			payload: payload as Record<string, unknown>,
			webhookEventId: params.webhookEventId,
		})
		// A redelivery of the same GitHub delivery id is the same event.
		.onConflictDoNothing({
			target: [
				automationEvents.integrationConnectionId,
				automationEvents.provider,
				automationEvents.externalEventId,
			],
		});

	return { recorded: true };
}
