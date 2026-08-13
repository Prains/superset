import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { chatSessions } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

// Compatibility shim for released desktop builds (<=1.20.x): only the session
// delete survives. The durable-streams transport this path used to proxy is
// gone, so GET/POST are not restored. Delete once those builds drain.

export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await auth.api.getSession({ headers: request.headers });
	const userId = session?.user?.id;
	if (!userId) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;
	await db
		.delete(chatSessions)
		.where(
			and(eq(chatSessions.id, sessionId), eq(chatSessions.createdBy, userId)),
		);

	return Response.json({ success: true }, { status: 200 });
}
