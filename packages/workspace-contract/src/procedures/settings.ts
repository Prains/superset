import { z } from "zod";
import type { ContractNamespace } from "../procedure";
import { hostAgentConfigSchema } from "../schemas/agents";

/**
 * Only the read half of agent configs is in the contract: it is what a
 * workspace needs to know which agents it can launch. Every writing
 * `settings.agentConfigs.*` procedure, plus `settings.branchPrefix.*` and
 * `settings.worktreeLocation.*`, is device-only — those configure the
 * person's machine, not a workspace.
 */
export const settingsContract = {
	agentConfigs: {
		list: {
			kind: "query",
			exposure: "authenticated",
			input: z.void(),
			output: z.array(hostAgentConfigSchema),
		},
	},
} as const satisfies ContractNamespace;
