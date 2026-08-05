import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getServerByName } from "partyserver";
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

app.get("/health", (c) => c.json({ ok: true, region: "cf", proto: 2 }));

function extractToken(c: Context<AppContext>): string | null {
	const header = c.req.header("Authorization");
	if (header?.startsWith("Bearer ")) return header.slice(7);
	return c.req.query("token") ?? null;
}

async function tunnelStub(c: Context<AppContext>, hostId: string) {
	return getServerByName(c.env.HostTunnel, hostId);
}

function isWsUpgrade(c: Context<AppContext>): boolean {
	return c.req.header("Upgrade")?.toLowerCase() === "websocket";
}

// The v1 relay accepts an unauthorized tunnel WS and closes 1008 with a reason
// the peer logs. Workers can't reject an upgrade with a close code via a plain
// error response, so mirror it: complete the handshake, close 1008.
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

// ── Host control channel ────────────────────────────────────────────

app.get("/v2/control", async (c) => {
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

	const stub = await tunnelStub(c, hostId);
	return stub.fetch(
		`https://relay2/register?hostId=${encodeURIComponent(hostId)}`,
		{
			headers: { Upgrade: "websocket", "x-relay-token": token },
		},
	);
});

// ── Host dial-back (stream attach) ──────────────────────────────────
// The one-time ticket is the credential: unguessable, single-use, expires in
// DIAL_TIMEOUT_MS, and only ever issued to the authenticated host over its
// control channel. No JWT re-verification on this hot path.

app.get("/v2/dial", async (c) => {
	if (!isWsUpgrade(c)) {
		return c.json({ error: "WebSocket upgrade required" }, 426);
	}
	const hostId = c.req.query("hostId");
	const ticket = c.req.query("ticket");
	if (!hostId || !ticket) return acceptAndClose("Missing hostId or ticket");
	const stub = await tunnelStub(c, hostId);
	return stub.fetch(
		`https://relay2/dial?ticket=${encodeURIComponent(ticket)}`,
		{ headers: { Upgrade: "websocket" } },
	);
});

// ── Pre-flight (clients probe before opening a WS to a host) ────────

app.get("/hosts/:hostId/_whoowns", async (c) => {
	const token = extractToken(c);
	if (!token) return c.json({ error: "Unauthorized" }, 401);
	const auth = await verifyJWT(token, c.env.NEXT_PUBLIC_API_URL);
	if (!auth) return c.json({ error: "Unauthorized" }, 401);

	const hostId = c.req.param("hostId");
	const stub = await tunnelStub(c, hostId);
	const status = await stub.fetch("https://relay2/status");
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

// ── Client-facing host proxy (wire-identical to the v1 relay) ───────

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
	const path = pathAfterHost(c) || "/";
	const query = url.search.slice(1);

	const stub = await tunnelStub(c, hostId);
	const res = await stub.fetch(
		`https://relay2/http?path=${encodeURIComponent(path)}&query=${encodeURIComponent(query)}`,
		{
			method: c.req.method,
			headers: c.req.raw.headers,
			body: c.req.raw.body,
		},
	);
	if (res.headers.get("content-type")?.includes("application/json")) {
		const peeked = res.clone();
		const data = (await peeked.json().catch(() => null)) as {
			tunnelError?: string;
		} | null;
		if (data?.tunnelError !== undefined) {
			return res.status === 503
				? trpcErrorResponse(c, "SERVICE_UNAVAILABLE", "Host is not online")
				: trpcErrorResponse(c, "BAD_GATEWAY", data.tunnelError);
		}
	}
	return res;
});

app.get("/hosts/:hostId/*", async (c) => {
	if (!isWsUpgrade(c)) {
		return c.json({ error: "WebSocket upgrade required" }, 426);
	}
	const hostId = c.get("hostId");
	const url = new URL(c.req.url);
	const path = pathAfterHost(c) || "/";
	const query = url.search.slice(1);
	const ticket = crypto.randomUUID();

	const stub = await tunnelStub(c, hostId);
	return stub.fetch(
		`https://relay2/client?ticket=${encodeURIComponent(ticket)}&path=${encodeURIComponent(path)}&query=${encodeURIComponent(query)}`,
		{ headers: { Upgrade: "websocket" } },
	);
});

export { HostTunnel };

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<RelayEnv>;
