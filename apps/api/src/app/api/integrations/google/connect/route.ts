import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import { GOOGLE_SCOPES } from "@superset/trpc/integrations/google";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import { createSignedState } from "@/lib/oauth-state";

export async function GET(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const organizationId = url.searchParams.get("organizationId");
	if (!organizationId) {
		return Response.json(
			{ error: "Missing organizationId parameter" },
			{ status: 400 },
		);
	}

	const membership = await findOrgMembership({
		userId: session.user.id,
		organizationId,
	});
	if (!membership) {
		return Response.json(
			{ error: "User is not a member of this organization" },
			{ status: 403 },
		);
	}

	// One connection per organization for now, and it is personal: whoever
	// connected it (or an admin) may replace it, anyone else would be
	// silently swapping a colleague's calendars for their own.
	const existing = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "google"),
		),
		columns: { connectedByUserId: true },
	});
	const isAdmin = membership.role === "admin" || membership.role === "owner";
	if (existing && existing.connectedByUserId !== session.user.id && !isAdmin) {
		return Response.json(
			{ error: "Google is already connected by another member" },
			{ status: 403 },
		);
	}

	const state = createSignedState({ organizationId, userId: session.user.id });

	const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
	authUrl.searchParams.set(
		"redirect_uri",
		`${env.NEXT_PUBLIC_API_URL}/api/integrations/google/callback`,
	);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
	// A refresh token is only issued with offline access, and only on a
	// consent screen — a silent re-authorization returns none.
	authUrl.searchParams.set("access_type", "offline");
	authUrl.searchParams.set("prompt", "consent");
	authUrl.searchParams.set("include_granted_scopes", "true");
	authUrl.searchParams.set("state", state);

	return Response.redirect(authUrl.toString());
}
