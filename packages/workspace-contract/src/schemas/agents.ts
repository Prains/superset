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

export const promptTransportSchema = z.enum(["argv", "stdin"]);

/** One configured launchable agent, as served by `settings.agentConfigs.list`. */
export const hostAgentConfigSchema = z.object({
	id: z.string(),
	presetId: z.string(),
	/** Built-in icon key to render, or null to fall back to `presetId`. */
	iconId: z.string().nullable(),
	label: z.string(),
	command: z.string(),
	args: z.array(z.string()),
	promptTransport: promptTransportSchema,
	promptArgs: z.array(z.string()),
	/** Args that resume a previous session; the session id is appended after
	 * them. Empty when the agent has no id-based resume. */
	resumeArgs: z.array(z.string()),
	env: z.record(z.string(), z.string()),
	order: z.number(),
});
