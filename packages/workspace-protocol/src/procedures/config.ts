import { z } from "zod";
import type { ProtocolNamespace } from "../procedure";

const projectIdSchema = z.object({ projectId: z.string().uuid() });

/**
 * The read half of project setup config. `config.getConfigContent` and
 * `config.updateConfig` are device-only: they read and write the repo's
 * config file through the host's project registry.
 */
export const configContract = {
	/** True only when no source defines any setup/teardown/run commands. */
	shouldShowSetupCard: {
		kind: "query",
		exposure: "authenticated",
		input: projectIdSchema,
		output: z.boolean(),
	},

	/** The resolved `run` script for the project, or null when unconfigured. */
	getWorkspaceRunDefinition: {
		kind: "query",
		exposure: "authenticated",
		input: projectIdSchema,
		output: z
			.object({
				source: z.literal("project-config"),
				projectId: z.string(),
				commands: z.array(z.string()),
				cwd: z.string().optional(),
			})
			.nullable(),
	},
} as const satisfies ProtocolNamespace;
