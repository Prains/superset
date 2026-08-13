import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { chatSessions } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";

// Compatibility shim for released desktop builds (<=1.20.x), which create and
// rename chat sessions over REST. The durable-streams half of this route is
// gone; only the session row survives. Delete once those builds drain.

async function requireUserId(request: Request): Promise<string | null> {
	const session = await auth.api.getSession({ headers: request.headers });
	return session?.user?.id ?? null;
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const userId = await requireUserId(request);
	if (!userId) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;
	const body = (await request.json()) as {
		organizationId?: string;
		workspaceId?: string;
	};

	if (!body.organizationId) {
		return Response.json(
			{ error: "organizationId is required" },
			{ status: 400 },
		);
	}

	const [existing] = await db
		.select({ createdBy: chatSessions.createdBy })
		.from(chatSessions)
		.where(eq(chatSessions.id, sessionId))
		.limit(1);
	if (existing && existing.createdBy !== userId) {
		return new Response("Not found", { status: 404 });
	}

	await db
		.insert(chatSessions)
		.values({
			id: sessionId,
			organizationId: body.organizationId,
			createdBy: userId,
			...(body.workspaceId ? { workspaceId: body.workspaceId } : {}),
		})
		.onConflictDoNothing();

	if (body.workspaceId) {
		await db
			.update(chatSessions)
			.set({ workspaceId: body.workspaceId })
			.where(
				and(
					eq(chatSessions.id, sessionId),
					eq(chatSessions.createdBy, userId),
					isNull(chatSessions.workspaceId),
				),
			);
	}

	return Response.json(
		{ sessionId, streamUrl: `/api/chat/${sessionId}/stream` },
		{ status: 200 },
	);
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const userId = await requireUserId(request);
	if (!userId) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;
	const body = (await request.json()) as { title?: string };

	if (body.title !== undefined) {
		const [updated] = await db
			.update(chatSessions)
			.set({ title: body.title })
			.where(
				and(eq(chatSessions.id, sessionId), eq(chatSessions.createdBy, userId)),
			)
			.returning({ id: chatSessions.id });

		if (!updated) return new Response("Not found", { status: 404 });
	}

	return Response.json({ success: true }, { status: 200 });
}
