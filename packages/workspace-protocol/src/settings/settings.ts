import { z } from "zod";

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

/**
 * Only the read half of agent configs is in the protocol: it is what a
 * workspace needs to know which agents it can launch. Every writing
 * `settings.agentConfigs.*` procedure, plus `settings.branchPrefix.*` and
 * `settings.worktreeLocation.*`, is device-only — those configure the person's
 * machine, not a workspace.
 */
export const settingsAgentConfigsListOutput = z.array(hostAgentConfigSchema);
