import { z } from "zod";

/**
 * The read half of project setup config. `config.getConfigContent` and
 * `config.updateConfig` are device-only: they read and write the repo's
 * config file through the host's project registry.
 */
export const configProjectRefSchema = z.object({
	projectId: z.string().uuid(),
});

/** True only when no source defines any setup/teardown/run commands. */
export const configShouldShowSetupCardOutput = z.boolean();

/** The resolved `run` script for the project, or null when unconfigured. */
export const configGetWorkspaceRunDefinitionOutput = z
	.object({
		source: z.literal("project-config"),
		projectId: z.string(),
		commands: z.array(z.string()),
		cwd: z.string().optional(),
	})
	.nullable();
