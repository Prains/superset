import { z } from "zod";

/**
 * Trigger validation, shared by the editor and the API so a form can block Save
 * on exactly what the server would reject.
 *
 * Two levels, and the distinction is the point:
 *
 * - `draftTriggerSchema` accepts a half-configured trigger. The editor has to be
 *   able to hold "Draft opened in [Select Repos]" with nothing selected yet.
 * - `triggerSchema` is what may be saved. Everything the draft form left empty
 *   is required here.
 *
 * `describeTriggerProblems` returns the same messages the form shows, so the
 * client isn't reimplementing rules the server enforces.
 */

/**
 * Three states, tagged rather than inferred from shape: `null` matches nothing,
 * `{mode:"any"}` matches everything, a list matches those ids. Every id space
 * here is user-controlled — a GitHub label really can be named "any" — so a bare
 * `string[] | "any"` would collide with legal values.
 */
export const triggerScopeSchema = z.union([
	z.null(),
	z.object({ mode: z.literal("any") }),
	z.object({
		mode: z.literal("list"),
		ids: z.array(z.string().min(1)).max(200),
	}),
]);
export type TriggerScope = z.infer<typeof triggerScopeSchema>;

export const triggerActorSchema = z.union([
	z.literal("anyone"),
	z.literal("org_members"),
	z.object({ ids: z.array(z.string().min(1)).max(200) }),
]);
export type TriggerActor = z.infer<typeof triggerActorSchema>;

/** A scope that is set but selects nothing — the "Select Repos" empty state. */
export function isEmptyScope(scope: TriggerScope): boolean {
	return scope === null || (scope.mode === "list" && scope.ids.length === 0);
}

export function isEmptyActor(actor: TriggerActor): boolean {
	return typeof actor !== "string" && actor.ids.length === 0;
}

const rrule = z.string().min(1).max(500);
const iana = z.string().min(1);

/**
 * GitHub events carry different filters, so the config is a union on the event
 * rather than one flat shape: a comment has both a comment author and a PR
 * author, and a push has neither.
 */
export const githubTriggerEventValues = [
	"pull_request.opened",
	"pull_request.draft_opened",
	"pull_request.ready_for_review",
	"pull_request.closed",
	"pull_request.merged",
	"pull_request.labeled",
	"pull_request.review_submitted",
	"pull_request.comment_created",
	"issue.opened",
	"issue.comment_created",
	"push",
	"check_suite.failed",
] as const;
export type GithubTriggerEvent = (typeof githubTriggerEventValues)[number];

const githubCommon = {
	kind: z.literal("github"),
	repositories: triggerScopeSchema,
	branches: triggerScopeSchema,
	labels: triggerScopeSchema,
	// Fork payloads carry attacker-controlled content into a checkout the agent
	// runs in. A literal rather than a boolean, so enabling it is a schema change
	// with a threat model attached rather than a checkbox someone can tick.
	includeForks: z.literal(false).default(false),
};

const githubPullRequestEvent = z.object({
	...githubCommon,
	event: z.enum([
		"pull_request.opened",
		"pull_request.draft_opened",
		"pull_request.ready_for_review",
		"pull_request.closed",
		"pull_request.merged",
		"pull_request.labeled",
		"push",
		"check_suite.failed",
		"issue.opened",
	]),
	actor: triggerActorSchema,
});

/** Comments and reviews filter on two independent people. */
const githubCommentEvent = z.object({
	...githubCommon,
	event: z.enum([
		"pull_request.comment_created",
		"pull_request.review_submitted",
		"issue.comment_created",
	]),
	actor: triggerActorSchema,
	subjectAuthor: triggerActorSchema,
});

export const githubTriggerConfigSchema = z.union([
	githubPullRequestEvent,
	githubCommentEvent,
]);

export const scheduleTriggerConfigSchema = z.object({
	kind: z.literal("schedule"),
	rrule,
	dtstart: z.string().datetime(),
	timezone: iana,
});

export const webhookTriggerConfigSchema = z.object({
	kind: z.literal("webhook"),
});

export const slackTriggerConfigSchema = z.object({
	kind: z.literal("slack"),
	events: z.array(z.string().min(1)).max(50),
	channels: triggerScopeSchema,
	emoji: triggerScopeSchema,
	actor: triggerActorSchema,
	keyword: z.string().min(1).max(200).optional(),
});

export const linearTriggerConfigSchema = z.object({
	kind: z.literal("linear"),
	events: z.array(z.string().min(1)).max(50),
	teams: triggerScopeSchema,
	projects: triggerScopeSchema,
});

export const sentryTriggerConfigSchema = z.object({
	kind: z.literal("sentry"),
	events: z.array(z.string().min(1)).max(50),
	projects: triggerScopeSchema,
	level: triggerScopeSchema,
});

/**
 * Structurally valid — the shape is right, but a scope may still select nothing.
 * This is what the editor holds while someone is still filling a trigger in.
 */
export const draftTriggerSchema = z.object({
	// Absent on a row that has not been saved yet. Present rows keep their id so
	// a save updates in place rather than deleting and recreating, which would
	// otherwise roll a webhook trigger's key and lose a schedule's next run.
	id: z.string().uuid().optional(),
	enabled: z.boolean().default(true),
	config: z.union([
		scheduleTriggerConfigSchema,
		webhookTriggerConfigSchema,
		githubTriggerConfigSchema,
		slackTriggerConfigSchema,
		linearTriggerConfigSchema,
		sentryTriggerConfigSchema,
	]),
});
export type DraftTrigger = z.infer<typeof draftTriggerSchema>;
export type TriggerConfigInput = DraftTrigger["config"];

/** One problem, addressed to a specific trigger so the form can mark that row. */
export type TriggerProblem = {
	index: number;
	field: string;
	message: string;
};

/**
 * The rules a draft must satisfy before it can be saved. Kept as explicit checks
 * rather than schema refinements so each one carries a message the form can put
 * next to the field it belongs to.
 */
export function describeTriggerProblems(
	triggers: DraftTrigger[],
): TriggerProblem[] {
	const problems: TriggerProblem[] = [];
	const add = (index: number, field: string, message: string) =>
		problems.push({ index, field, message });

	if (triggers.length === 0) {
		add(-1, "triggers", "Add at least one trigger.");
	}

	// A partial unique index enforces this in the database; catching it here
	// turns a save-time constraint violation into a message next to the row.
	const scheduleIndexes = triggers.flatMap((t, i) =>
		t.config.kind === "schedule" ? [i] : [],
	);
	for (const index of scheduleIndexes.slice(1)) {
		add(index, "config", "An automation can only have one schedule.");
	}

	triggers.forEach((trigger, index) => {
		const config = trigger.config;
		switch (config.kind) {
			case "github": {
				if (isEmptyScope(config.repositories)) {
					add(index, "repositories", "Specify at least one repository.");
				}
				if (isEmptyActor(config.actor)) {
					add(index, "actor", "Specify at least one person, or choose Anyone.");
				}
				if ("subjectAuthor" in config && isEmptyActor(config.subjectAuthor)) {
					add(
						index,
						"subjectAuthor",
						"Specify at least one person, or choose Anyone.",
					);
				}
				break;
			}
			case "slack": {
				if (config.events.length === 0) {
					add(index, "events", "Choose at least one Slack event.");
				}
				if (isEmptyScope(config.channels)) {
					add(index, "channels", "Specify at least one channel.");
				}
				break;
			}
			case "linear": {
				if (config.events.length === 0) {
					add(index, "events", "Choose at least one Linear event.");
				}
				break;
			}
			case "sentry": {
				if (config.events.length === 0) {
					add(index, "events", "Choose at least one Sentry event.");
				}
				break;
			}
			case "schedule":
			case "webhook":
				break;
		}
	});

	return problems;
}

/** The banner shown above the trigger list, or null when there is nothing wrong. */
export function summarizeTriggerProblems(
	problems: TriggerProblem[],
): string | null {
	if (problems.length === 0) return null;
	const missingTriggers = problems.find((p) => p.field === "triggers");
	if (missingTriggers) return missingTriggers.message;
	return "Some triggers need additional configuration";
}
