import { mintUserJwt } from "@superset/auth/server";
import { dbWs } from "@superset/db/client";
import {
	factoryItems,
	factoryRuns,
	factoryStagePrompts,
	type SelectFactory,
	type SelectFactoryItem,
	users,
} from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import {
	sanitizeBranchNameWithMaxLength,
	slugifyForBranch,
} from "@superset/shared/workspace-launch";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { pickOnlineHost, resolveCandidateHosts } from "../automation/dispatch";
import { RelayDispatchError, relayMutation } from "../automation/relay-client";
import {
	type AgentStage,
	DEFAULT_STAGE_PROMPTS,
	renderStageDispatchPrompt,
} from "./stages";

type AgentRunResult =
	| { kind: "terminal"; sessionId: string; label: string }
	| { kind: "chat"; sessionId: string; label: string };

export type StageDispatchOutcome =
	| { status: "dispatched"; runId: string }
	| { status: "skipped_offline"; runId: string | null; error: string }
	| { status: "dispatch_failed"; runId: string | null; error: string }
	| { status: "conflict"; error: string };

export interface StageDispatchOptions {
	factory: SelectFactory;
	item: SelectFactoryItem;
	stage: AgentStage;
	/** items.revision the caller read; the CAS move into the stage checks it. */
	expectedRevision: number;
	relayUrl: string;
}

/**
 * Run one pipeline stage for one item: CAS-move the item into the stage,
 * create a workspace on an online host, start the stage agent. Writes a
 * factory_runs row regardless of outcome. Advancement past the stage
 * happens only via factory.report (agent) or a manual transition — never
 * here. (Mastra anti-lesson: validate agent config and fail loudly; a
 * silent stall is the worst outcome.)
 */
export async function dispatchFactoryStage(
	opts: StageDispatchOptions,
): Promise<StageDispatchOutcome> {
	const { factory, item, stage, expectedRevision, relayUrl } = opts;

	const stageConfig = factory.stageConfig[stage];
	const agent = stageConfig?.agent ?? factory.defaultAgent;
	if (!agent) {
		return {
			status: "dispatch_failed",
			runId: null,
			error: "no agent configured for stage",
		};
	}

	// An item's workspace lives on one host; once pinned, every stage runs
	// there. Unpinned items pick any online host of the owner's.
	const candidates = item.workspaceHostId
		? await resolveCandidateHosts({
				organizationId: factory.organizationId,
				ownerUserId: factory.ownerUserId,
				targetHostId: item.workspaceHostId,
			})
		: await resolveCandidateHosts(factory);
	const host =
		candidates.length > 0
			? await pickOnlineHost(factory, relayUrl, candidates)
			: null;
	if (!host) {
		const error =
			candidates.length === 0 ? "no host available" : "target host offline";
		// Record the attempt so the ledger shows why nothing happened.
		const [skipped] = await dbWs
			.insert(factoryRuns)
			.values({
				itemId: item.id,
				factoryId: factory.id,
				organizationId: factory.organizationId,
				stage,
				attempt: await nextAttempt(item.id, stage),
				hostId: candidates[0]?.machineId ?? null,
				status: "skipped_offline",
				error,
			})
			.onConflictDoNothing({
				target: [factoryRuns.itemId, factoryRuns.stage, factoryRuns.attempt],
			})
			.returning({ id: factoryRuns.id });
		return { status: "skipped_offline", runId: skipped?.id ?? null, error };
	}

	const prompt = await resolveActiveStagePrompt(factory.id, stage);
	const attempt = await nextAttempt(item.id, stage);

	const [run] = await dbWs
		.insert(factoryRuns)
		.values({
			itemId: item.id,
			factoryId: factory.id,
			organizationId: factory.organizationId,
			stage,
			attempt,
			promptVersionId: prompt.versionId,
			hostId: host.machineId,
			status: "dispatching",
		})
		.onConflictDoNothing({
			target: [factoryRuns.itemId, factoryRuns.stage, factoryRuns.attempt],
		})
		.returning();
	if (!run) {
		return {
			status: "conflict",
			error: "a run for this stage is already being dispatched",
		};
	}

	// Move the item into the stage. The revision check makes a concurrent
	// human transition (or double-click) lose cleanly instead of racing.
	const [moved] = await dbWs
		.update(factoryItems)
		.set({
			stage,
			revision: sql`${factoryItems.revision} + 1`,
			stageEnteredAt: new Date(),
			blockedReason: null,
		})
		.where(
			and(
				eq(factoryItems.id, item.id),
				eq(factoryItems.revision, expectedRevision),
			),
		)
		.returning({ revision: factoryItems.revision });
	if (!moved) {
		const error = "item changed since you read it";
		await markRunFailed(run.id, error);
		return { status: "conflict", error };
	}

	let workspaceId: string | null = null;
	try {
		const [owner] = await dbWs
			.select({ email: users.email })
			.from(users)
			.where(eq(users.id, factory.ownerUserId))
			.limit(1);

		const jwt = await mintUserJwt({
			userId: factory.ownerUserId,
			email: owner?.email,
			organizationIds: [factory.organizationId],
			scope: "factory-run",
			runId: run.id,
			ttlSeconds: 300,
		});
		const routingKey = buildHostRoutingKey(
			factory.organizationId,
			host.machineId,
		);

		const priorResults = await successfulPriorResults(item.id);
		const fullPrompt = renderStageDispatchPrompt({
			stagePrompt: prompt.content,
			stage,
			runId: run.id,
			itemId: item.id,
			expectedRevision: moved.revision,
			repoFullName: factory.repoFullName,
			externalNumber: item.externalNumber,
			externalUrl: item.externalUrl,
			title: item.title,
			priorResults,
		});

		workspaceId = await ensureItemWorkspace({
			relayUrl,
			hostId: routingKey,
			jwt,
			projectId: factory.v2ProjectId,
			item,
			hostMachineId: host.machineId,
		});

		const runAgent = (targetWorkspaceId: string) =>
			relayMutation<
				{
					workspaceId: string;
					agent: string;
					prompt: string;
					model?: string;
				},
				AgentRunResult
			>({ relayUrl, hostId: routingKey, jwt }, "agents.run", {
				workspaceId: targetWorkspaceId,
				agent,
				prompt: fullPrompt,
				...(stageConfig?.model ? { model: stageConfig.model } : {}),
			});

		let result: AgentRunResult;
		try {
			result = await runAgent(workspaceId);
		} catch (err) {
			// Stale pin: the host says the pinned workspace is gone. Clear the
			// pin (CAS so a concurrent repin is never erased) and recreate.
			const stalePin =
				item.v2WorkspaceId !== null &&
				item.v2WorkspaceId === workspaceId &&
				err instanceof RelayDispatchError &&
				err.status === 404 &&
				err.message.includes(workspaceId);
			if (!stalePin) throw err;
			await dbWs
				.update(factoryItems)
				.set({ v2WorkspaceId: null, workspaceHostId: null })
				.where(
					and(
						eq(factoryItems.id, item.id),
						eq(factoryItems.v2WorkspaceId, workspaceId),
					),
				);
			workspaceId = await ensureItemWorkspace({
				relayUrl,
				hostId: routingKey,
				jwt,
				projectId: factory.v2ProjectId,
				item: { ...item, v2WorkspaceId: null },
				hostMachineId: host.machineId,
			});
			result = await runAgent(workspaceId);
		}

		await dbWs
			.update(factoryRuns)
			.set({
				status: "dispatched",
				sessionKind: result.kind,
				chatSessionId: result.kind === "chat" ? result.sessionId : null,
				terminalSessionId: result.kind === "terminal" ? result.sessionId : null,
				v2WorkspaceId: workspaceId,
				dispatchedAt: new Date(),
			})
			.where(eq(factoryRuns.id, run.id));
	} catch (err) {
		const error = describeError(err);
		await markRunFailed(run.id, error, workspaceId);
		// Surface on the board; the item stays in the stage it wedged in.
		await dbWs
			.update(factoryItems)
			.set({
				blockedReason: `dispatch failed: ${error}`,
				revision: sql`${factoryItems.revision} + 1`,
			})
			.where(eq(factoryItems.id, item.id));
		return { status: "dispatch_failed", runId: run.id, error };
	}

	return { status: "dispatched", runId: run.id };
}

export async function resolveActiveStagePrompt(
	factoryId: string,
	stage: AgentStage,
): Promise<{ content: string; versionId: string | null }> {
	const [active] = await dbWs
		.select({
			id: factoryStagePrompts.id,
			content: factoryStagePrompts.content,
		})
		.from(factoryStagePrompts)
		.where(
			and(
				eq(factoryStagePrompts.factoryId, factoryId),
				eq(factoryStagePrompts.stage, stage),
				eq(factoryStagePrompts.status, "active"),
			),
		)
		.limit(1);
	if (active) return { content: active.content, versionId: active.id };
	return { content: DEFAULT_STAGE_PROMPTS[stage], versionId: null };
}

async function nextAttempt(itemId: string, stage: AgentStage): Promise<number> {
	const [latest] = await dbWs
		.select({ attempt: factoryRuns.attempt })
		.from(factoryRuns)
		.where(and(eq(factoryRuns.itemId, itemId), eq(factoryRuns.stage, stage)))
		.orderBy(desc(factoryRuns.attempt))
		.limit(1);
	return (latest?.attempt ?? 0) + 1;
}

/** Latest successful result per stage, oldest stage first, for prompt context. */
async function successfulPriorResults(
	itemId: string,
): Promise<Array<{ stage: string; resultJson: unknown }>> {
	const rows = await dbWs
		.select({
			stage: factoryRuns.stage,
			resultJson: factoryRuns.resultJson,
			createdAt: factoryRuns.createdAt,
		})
		.from(factoryRuns)
		.where(
			and(eq(factoryRuns.itemId, itemId), eq(factoryRuns.outcome, "success")),
		)
		.orderBy(factoryRuns.createdAt);
	const latestByStage = new Map<
		string,
		{ stage: string; resultJson: unknown }
	>();
	for (const row of rows) {
		latestByStage.set(row.stage, {
			stage: row.stage,
			resultJson: row.resultJson,
		});
	}
	return [...latestByStage.values()];
}

async function markRunFailed(
	runId: string,
	error: string,
	workspaceId?: string | null,
): Promise<void> {
	await dbWs
		.update(factoryRuns)
		.set({
			status: "dispatch_failed",
			error,
			...(workspaceId ? { v2WorkspaceId: workspaceId } : {}),
		})
		.where(eq(factoryRuns.id, runId));
}

/**
 * One workspace per item: reuse the pin when present, else create it once
 * on a stable branch (factory/issue-N — retries and later stages converge
 * on it; the host's create dedupes by branch) and CAS-claim the pin.
 */
async function ensureItemWorkspace(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	projectId: string;
	item: SelectFactoryItem;
	hostMachineId: string;
}): Promise<string> {
	if (args.item.v2WorkspaceId) return args.item.v2WorkspaceId;

	const slug = slugifyForBranch(args.item.title, 30);
	const branch = sanitizeBranchNameWithMaxLength(
		`factory/issue-${args.item.externalNumber}${slug ? `-${slug}` : ""}`,
		60,
	);
	const name = `Factory #${args.item.externalNumber}: ${args.item.title}`.slice(
		0,
		100,
	);

	const result = await relayMutation<
		{ projectId: string; name: string; branch: string },
		{ workspace: { id: string } }
	>(
		{
			relayUrl: args.relayUrl,
			hostId: args.hostId,
			jwt: args.jwt,
			// Worktree setup on big repos takes real time.
			timeoutMs: 90_000,
		},
		"workspaces.create",
		{ projectId: args.projectId, name, branch },
	);
	const workspaceId = result.workspace.id;

	// First claimer wins; a concurrent dispatch that lost uses the winner's
	// pin on its next attempt (this run still uses the workspace it made —
	// same branch, so the host dedupe usually returns the same workspace).
	await dbWs
		.update(factoryItems)
		.set({ v2WorkspaceId: workspaceId, workspaceHostId: args.hostMachineId })
		.where(
			and(
				eq(factoryItems.id, args.item.id),
				isNull(factoryItems.v2WorkspaceId),
			),
		);
	return workspaceId;
}

function describeError(err: unknown): string {
	if (err instanceof RelayDispatchError) return err.message;
	if (err instanceof Error) return err.message;
	return "unknown error";
}
