import { z } from "zod";
import type { ContractNamespace } from "../procedure";
import {
	agentDefinitionIdSchema,
	terminalAgentBindingSchema,
	terminalAgentIdSchema,
} from "../schemas/agents";

export const terminalAgentsContract = {
	listByWorkspace: {
		kind: "query",
		exposure: "authenticated",
		input: z.object({
			workspaceId: z.string(),
			agentId: terminalAgentIdSchema.optional(),
			definitionId: agentDefinitionIdSchema.optional(),
		}),
		output: z.array(terminalAgentBindingSchema),
	},

	/**
	 * The resumable agent session behind a dead terminal, if any. `agent` is
	 * the value to pass to `agents.run` alongside `resumeSessionId`;
	 * `resumeSupported` is false when the matching agent config has no
	 * resume args (or the config was removed).
	 */
	resumeCandidate: {
		kind: "query",
		exposure: "authenticated",
		input: z.object({ workspaceId: z.string(), terminalId: z.string() }),
		output: z
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
			.nullable(),
	},

	/**
	 * Force the workspace's bindings (or just `terminalId`'s) to a stopped
	 * state so a wedged working/permission indicator resets. Deliberately
	 * not a lifecycle event: it must not broadcast a completion chime.
	 */
	clearWorkspaceStatuses: {
		kind: "mutation",
		exposure: "authenticated",
		input: z.object({
			workspaceId: z.string(),
			terminalId: z.string().optional(),
		}),
		output: z.object({ success: z.boolean() }),
	},

	findActive: {
		kind: "query",
		exposure: "authenticated",
		input: z.object({
			workspaceId: z.string(),
			agentId: terminalAgentIdSchema,
			definitionId: agentDefinitionIdSchema.optional(),
		}),
		output: terminalAgentBindingSchema.nullable(),
	},

	/**
	 * Reuse-or-launch primitive: returns an existing active binding for the
	 * `(workspaceId, agentId, definitionId)` triple, or spawns a terminal and
	 * waits for the agent's first lifecycle hook. Resolves on that hook, not
	 * on REPL prompt-readiness, so callers that write input immediately need
	 * their own readiness wait.
	 */
	getOrCreate: {
		kind: "mutation",
		exposure: "authenticated",
		input: z.object({
			workspaceId: z.string(),
			agentId: terminalAgentIdSchema,
			definitionId: agentDefinitionIdSchema.optional(),
			initialCommand: z.string().trim().min(1).optional(),
			cwd: z.string().optional(),
		}),
		output: z.object({
			binding: terminalAgentBindingSchema,
			created: z.boolean(),
		}),
	},
} as const satisfies ContractNamespace;
