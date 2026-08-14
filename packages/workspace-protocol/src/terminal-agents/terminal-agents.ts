import { BUILTIN_AGENT_IDS } from "@superset/shared/agent-catalog";
import { z } from "zod";

/**
 * Wrapper-level agent id reported by the in-shell lifecycle hook. Sourced
 * from `@superset/shared/agent-catalog` rather than re-listed here so a new
 * built-in agent can never be accepted by one implementation and rejected by
 * the other.
 */
export const terminalAgentIdSchema = z.enum(BUILTIN_AGENT_IDS);

/**
 * A built-in agent id or a user-authored `custom:<name>` definition.
 * Mirrors host-service's `agentDefinitionIdSchema`, including the cast to
 * `AgentDefinitionId` (zod cannot express the template-literal arm on its
 * own without widening every builtin id to `string`).
 */
export const agentDefinitionIdSchema = z.union([
	z.enum(BUILTIN_AGENT_IDS),
	z.string().regex(/^custom:.+$/, "must be a builtin id or `custom:<name>`"),
]) as z.ZodType<
	(typeof BUILTIN_AGENT_IDS)[number] | `custom:${string}`,
	string
>;

export const agentIdentityIdSchema = z.string();

export const agentIdentitySchema = z.object({
	agentId: agentIdentityIdSchema,
	sessionId: z.string().optional(),
	definitionId: agentDefinitionIdSchema.optional(),
});

export const agentLifecycleEventTypeSchema = z.enum([
	"Start",
	"Stop",
	"PermissionRequest",
	"Failed",
	"Attached",
	"Detached",
]);

export const terminalAgentEndReasonSchema = z.enum([
	"detached",
	"terminal-exited",
]);

export const terminalAgentBindingSchema = z.object({
	terminalId: z.string(),
	workspaceId: z.string(),
	agentId: agentIdentityIdSchema,
	agentSessionId: z.string().optional(),
	definitionId: agentDefinitionIdSchema.optional(),
	startedAt: z.number(),
	lastEventAt: z.number(),
	lastEventType: z.string(),
	endedAt: z.number().optional(),
	endReason: terminalAgentEndReasonSchema.optional(),
});

export const terminalAgentsListByWorkspaceInput = z.object({
	workspaceId: z.string(),
	agentId: terminalAgentIdSchema.optional(),
	definitionId: agentDefinitionIdSchema.optional(),
});

export const terminalAgentsListByWorkspaceOutput = z.array(
	terminalAgentBindingSchema,
);

export const terminalAgentsResumeCandidateInput = z.object({
	workspaceId: z.string(),
	terminalId: z.string(),
});

/**
 * The resumable agent session behind a dead terminal, if any. `agent` is the
 * value to pass to `agents.run` alongside `resumeSessionId`;
 * `resumeSupported` is false when the matching agent config has no resume
 * args (or the config was removed).
 */
export const terminalAgentsResumeCandidateOutput = z
	.object({
		terminalId: z.string(),
		agentId: z.string(),
		definitionId: agentDefinitionIdSchema.nullable(),
		agentSessionId: z.string(),
		endedAt: z.number().nullable(),
		agent: z.string(),
		agentLabel: z.string(),
		resumeSupported: z.boolean(),
	})
	.nullable();

/**
 * Force the workspace's bindings (or just `terminalId`'s) to a stopped state
 * so a wedged working/permission indicator resets. Deliberately not a
 * lifecycle event: it must not broadcast a completion chime.
 */
export const terminalAgentsClearWorkspaceStatusesInput = z.object({
	workspaceId: z.string(),
	terminalId: z.string().optional(),
});

export const terminalAgentsClearWorkspaceStatusesOutput = z.object({
	success: z.boolean(),
});

export const terminalAgentsFindActiveInput = z.object({
	workspaceId: z.string(),
	agentId: terminalAgentIdSchema,
	definitionId: agentDefinitionIdSchema.optional(),
});

export const terminalAgentsFindActiveOutput =
	terminalAgentBindingSchema.nullable();

/**
 * Reuse-or-launch primitive: returns an existing active binding for the
 * `(workspaceId, agentId, definitionId)` triple, or spawns a terminal and
 * waits for the agent's first lifecycle hook. Resolves on that hook, not on
 * REPL prompt-readiness, so callers that write input immediately need their
 * own readiness wait.
 */
export const terminalAgentsGetOrCreateInput = z.object({
	workspaceId: z.string(),
	agentId: terminalAgentIdSchema,
	definitionId: agentDefinitionIdSchema.optional(),
	initialCommand: z.string().trim().min(1).optional(),
	cwd: z.string().optional(),
});

export const terminalAgentsGetOrCreateOutput = z.object({
	binding: terminalAgentBindingSchema,
	created: z.boolean(),
});
