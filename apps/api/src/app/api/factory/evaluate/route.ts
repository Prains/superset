import { db, dbWs } from "@superset/db/client";
import {
	factories,
	factoryItems,
	githubInstallations,
} from "@superset/db/schema";
import { sweepFactory } from "@superset/trpc/factory-sweep";
import { Receiver } from "@upstash/qstash";
import { eq } from "drizzle-orm";

import { env } from "@/env";
import { githubApp } from "../../github/octokit";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

/**
 * The factory heartbeat (QStash schedule, like /api/automations/evaluate):
 * per enabled factory — poll open issues via the GitHub App (intake works
 * with no webhooks at all), then sweep (expire stale runs, auto-dispatch
 * runnable stages).
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}
	const valid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/factory/evaluate`,
	});
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const enabled = await db
		.select()
		.from(factories)
		.where(eq(factories.enabled, true))
		.limit(200);

	const results: Array<Record<string, unknown>> = [];
	for (const factory of enabled) {
		const polled = await pollOpenIssues(factory.organizationId, factory).catch(
			(err) => {
				console.error("[factory/evaluate] issue poll failed:", err);
				return 0;
			},
		);
		const sweep = await sweepFactory(factory).catch((err) => {
			console.error("[factory/evaluate] sweep failed:", err);
			return { expired: 0, dispatched: 0 };
		});
		results.push({ factoryId: factory.id, polled, ...sweep });
	}
	return Response.json({ factories: results.length, results });
}

async function pollOpenIssues(
	organizationId: string,
	factory: typeof factories.$inferSelect,
): Promise<number> {
	const [installation] = await db
		.select()
		.from(githubInstallations)
		.where(eq(githubInstallations.organizationId, organizationId))
		.limit(1);
	if (!installation || installation.suspended) return 0;

	const [owner, repo] = factory.repoFullName.split("/");
	if (!owner || !repo) return 0;
	const octokit = await githubApp.getInstallationOctokit(
		Number(installation.installationId),
	);
	const { data: issues } = await octokit.rest.issues.listForRepo({
		owner,
		repo,
		state: "open",
		per_page: 50,
	});

	let created = 0;
	for (const issue of issues) {
		if (issue.pull_request) continue; // PRs come back from this endpoint too
		const inserted = await dbWs
			.insert(factoryItems)
			.values({
				factoryId: factory.id,
				organizationId,
				source: "github_issue",
				externalNumber: issue.number,
				externalUrl: issue.html_url,
				title: issue.title,
				authorLogin: issue.user?.login ?? null,
				materializationKey: `repo:${factory.repoFullName}:github_issue:${issue.number}`,
			})
			.onConflictDoNothing({
				target: [factoryItems.factoryId, factoryItems.materializationKey],
			})
			.returning({ id: factoryItems.id });
		created += inserted.length;
	}
	return created;
}
