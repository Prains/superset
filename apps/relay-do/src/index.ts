import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { accessDenialMessage, checkHostAccess } from "./access";
import { type AuthContext, verifyJWT } from "./auth";
import { HostTunnel } from "./host-tunnel";
import { isTrpcPath, trpcErrorResponse } from "./trpc-error";
import type { RelayEnv } from "./types";

type AppContext = {
	Bindings: RelayEnv;
	Variables: {
		auth: AuthContext;
		token: string;
		hostId: string;
	};
};

const app = new Hono<AppContext>();

app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, region: "cf" }));

function extractToken(c: Context<AppContext>): string | null {
	const header = c.req.header("Authorization");
	if (header?.startsWith("Bearer ")) return header.slice(7);
	return c.req.query("token") ?? null;
}

function tunnelStub(c: Context<AppContext>, hostId: string) {
	return c.env.HOST_TUNNEL.get(c.env.HOST_TUNNEL.idFromName(hostId));
}

function isWsUpgrade(c: Context<AppContext>): boolean {
	return c.req.header("Upgrade")?.toLowerCase() === "websocket";
}

// The Fly relay accepts the tunnel WS and then closes 1008 with a reason the
// host-service logs. Workers can't reject an upgrade with a close code via a
// plain error response, so mirror it: complete the handshake, close 1008.
function acceptAndClose(reason: string): Response {
	const pair = new WebSocketPair();
	pair[1].accept();
	pair[1].close(1008, reason);
	return new Response(null, { status: 101, webSocket: pair[0] });
}

function pathAfterHost(c: Context<AppContext>): string {
	const hostId = c.req.param("hostId") ?? "";
	const path = new URL(c.req.url).pathname;
	return path.slice(`/hosts/${hostId}`.length);
}

// ── Tunnel (host-service control socket) ────────────────────────────

app.get("/tunnel", async (c) => {
	if (!isWsUpgrade(c)) {
		return c.json({ error: "WebSocket upgrade required" }, 426);
	}
	const hostId = c.req.query("hostId");
	const token = extractToken(c);
	if (!hostId || !token) return acceptAndClose("Missing hostId or token");

	const auth = await verifyJWT(token, c.env.NEXT_PUBLIC_API_URL);
	if (!auth) return acceptAndClose("Unauthorized");

	const access = await checkHostAccess(
		auth,
		token,
		hostId,
		c.env.NEXT_PUBLIC_API_URL,
	);
	if (!access.ok) {
		return acceptAndClose(`Forbidden: ${accessDenialMessage(access.reason)}`);
	}

	return tunnelStub(c, hostId).fetch(
		`https://relay-do/register?hostId=${encodeURIComponent(hostId)}`,
		{
			headers: {
				Upgrade: "websocket",
				"x-relay-token": token,
			},
		},
	);
});

// ── Pre-flight (clients probe before opening a WS to a host) ────────

app.get("/hosts/:hostId/_whoowns", async (c) => {
	const token = extractToken(c);
	if (!token) return c.json({ error: "Unauthorized" }, 401);
	const auth = await verifyJWT(token, c.env.NEXT_PUBLIC_API_URL);
	if (!auth) return c.json({ error: "Unauthorized" }, 401);

	const hostId = c.req.param("hostId");
	const status = await tunnelStub(c, hostId).fetch("https://relay-do/status");
	const { connected } = (await status.json()) as { connected: boolean };
	if (!connected) return c.json({ error: "Host not connected" }, 503);

	const access = await checkHostAccess(
		auth,
		token,
		hostId,
		c.env.NEXT_PUBLIC_API_URL,
	);
	if (!access.ok) {
		const detail = `Forbidden: ${accessDenialMessage(access.reason)}`;
		// "error" means the access check itself failed (API unreachable), not
		// a denial — don't 403, or clients would stop retrying permanently.
		return access.reason === "error"
			? c.json({ error: detail }, 500)
			: c.json({ error: detail }, 403);
	}
	return c.json({ ok: true, region: "cf" });
});

// ── Host proxy (auth required) ──────────────────────────────────────

const authMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
	const wantsTrpc = isTrpcPath(pathAfterHost(c));

	const token = extractToken(c);
	if (!token)
		return wantsTrpc
			? trpcErrorResponse(c, "UNAUTHORIZED", "Unauthorized")
			: c.json({ error: "Unauthorized" }, 401);

	const auth = await verifyJWT(token, c.env.NEXT_PUBLIC_API_URL);
	if (!auth)
		return wantsTrpc
			? trpcErrorResponse(c, "UNAUTHORIZED", "Unauthorized")
			: c.json({ error: "Unauthorized" }, 401);

	const hostId = c.req.param("hostId");
	if (!hostId) return c.json({ error: "Missing hostId" }, 400);

	const access = await checkHostAccess(
		auth,
		token,
		hostId,
		c.env.NEXT_PUBLIC_API_URL,
	);
	if (!access.ok) {
		const detail = `Forbidden: ${accessDenialMessage(access.reason)}`;
		return wantsTrpc
			? trpcErrorResponse(c, "FORBIDDEN", detail)
			: c.json({ error: detail }, 403);
	}

	c.set("auth", auth);
	c.set("token", token);
	c.set("hostId", hostId);
	return next();
};

app.use("/hosts/:hostId/*", authMiddleware);

app.all("/hosts/:hostId/trpc/*", async (c) => {
	const hostId = c.get("hostId");
	const url = new URL(c.req.url);
	const path = `${pathAfterHost(c) || "/"}${url.search}`;
	const body = (await c.req.text().catch(() => "")) || undefined;

	const headers: Record<string, string> = {};
	for (const [key, value] of c.req.raw.headers.entries()) {
		if (key !== "host" && key !== "authorization") headers[key] = value;
	}

	const res = await tunnelStub(c, hostId).fetch("https://relay-do/http", {
		method: "POST",
		body: JSON.stringify({ method: c.req.method, path, headers, body }),
	});
	const data = (await res.json()) as {
		tunnelError?: string;
		status?: number;
		headers?: Record<string, string>;
		body?: string | null;
	};
	if (data.tunnelError !== undefined) {
		return res.status === 503
			? trpcErrorResponse(c, "SERVICE_UNAVAILABLE", "Host is not online")
			: trpcErrorResponse(c, "BAD_GATEWAY", data.tunnelError);
	}
	return new Response(data.body ?? null, {
		status: data.status,
		headers: data.headers,
	});
});

app.get("/hosts/:hostId/*", async (c) => {
	if (!isWsUpgrade(c)) {
		return c.json({ error: "WebSocket upgrade required" }, 426);
	}
	const hostId = c.get("hostId");
	const url = new URL(c.req.url);
	const path = pathAfterHost(c) || "/";
	const query = url.search.slice(1);

	return tunnelStub(c, hostId).fetch(
		`https://relay-do/connect?path=${encodeURIComponent(path)}&query=${encodeURIComponent(query)}`,
		{ headers: { Upgrade: "websocket" } },
	);
});

export { HostTunnel };

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<RelayEnv>;
