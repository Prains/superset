import { z } from "zod";

/**
 * Launch an agent in a workspace. An empty prompt launches a terminal agent
 * bare. Chat agents require a prompt and reject `resumeSessionId`.
 */
export const agentsRunInput = z.object({
	workspaceId: z.string().uuid(),
	agent: z.string().min(1),
	prompt: z.string().default(""),
	attachmentIds: z.array(z.string().uuid()).optional(),
	model: z.string().min(1).optional(),
	effort: z.string().min(1).optional(),
	/** Session id of a previous run of this agent to restore. */
	resumeSessionId: z.string().min(1).optional(),
});

/**
 * Terminal agents resolve to a terminal session id; the built-in chat agent
 * resolves to a chat session id, so callers must branch on `kind` rather than
 * assume a terminal.
 */
export const agentsRunOutput = z.union([
	z.object({
		kind: z.literal("terminal"),
		sessionId: z.string(),
		label: z.string(),
	}),
	z.object({
		kind: z.literal("chat"),
		sessionId: z.string(),
		label: z.string(),
	}),
]);
