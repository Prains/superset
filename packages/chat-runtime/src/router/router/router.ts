import {
	cancelTurnInputSchema,
	getItemsInputSchema,
	getSessionInputSchema,
	listSessionsInputSchema,
	promptInputSchema,
	respondToApprovalInputSchema,
	setModeInputSchema,
} from "@superset/chat/protocol";
import { initTRPC } from "@trpc/server";
import { createSessionCommandSchema } from "../../commands";
import type { ChatRuntime } from "../../index";

const t = initTRPC.create();

export const createChatCallerFactory = t.createCallerFactory;

export function createChatRouter(runtime: ChatRuntime) {
	return t.router({
		createSession: t.procedure
			.input(createSessionCommandSchema)
			.mutation(({ input }) => runtime.commands.createSession(input)),

		prompt: t.procedure
			.input(promptInputSchema)
			.mutation(({ input }) => runtime.commands.prompt(input)),

		cancelTurn: t.procedure
			.input(cancelTurnInputSchema)
			.mutation(({ input }) => runtime.commands.cancelTurn(input)),

		respondToApproval: t.procedure
			.input(respondToApprovalInputSchema)
			.mutation(({ input }) => runtime.commands.respondToApproval(input)),

		setMode: t.procedure
			.input(setModeInputSchema)
			.mutation(({ input }) => runtime.commands.setMode(input)),

		getSession: t.procedure
			.input(getSessionInputSchema)
			.query(({ input }) => runtime.commands.getSession(input)),

		listSessions: t.procedure
			.input(listSessionsInputSchema)
			.query(({ input }) => runtime.commands.listSessions(input)),

		getItems: t.procedure
			.input(getItemsInputSchema)
			.query(({ input }) => runtime.commands.getItems(input)),
	});
}

export type ChatRouter = ReturnType<typeof createChatRouter>;
