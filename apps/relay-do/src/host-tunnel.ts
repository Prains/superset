import { createApiClient } from "./api-client";
import type {
	RelayEnv,
	TunnelHttpResponse,
	TunnelRequest,
	TunnelResponse,
} from "./types";

const PING_INTERVAL_MS = 30_000;
// 3 missed pings, same liveness window as the Fly relay's missedPings counter.
const PONG_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PENDING_REQUESTS = 1_000;
const SET_ONLINE_RETRY_BASE_MS = 500;
const SET_ONLINE_MAX_ATTEMPTS = 3;

const HOST_TAG = "host";
const CHANNEL_TAG_PREFIX = "channel:";

interface HostSession {
	hostId: string;
	token: string;
}

interface PendingRequest {
	resolve: (response: TunnelHttpResponse) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

interface ProxyHttpPayload {
	method: string;
	path: string;
	headers: Record<string, string>;
	body?: string;
}

type Attachment = { kind: "host" } | { kind: "channel"; id: string };

function base64ToArrayBuffer(data: string): ArrayBuffer {
	const binary = atob(data);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

// One DO per hostId. The host-service's control WebSocket and every client
// channel WebSocket terminate on this object, so frame routing is a local map
// lookup — no cross-machine directory, replay, or bridging. All sockets use
// the hibernation API; session state lives in DO storage because in-memory
// state is lost when the object hibernates between events. pendingRequests
// stays in memory deliberately: an awaited proxyHttp call keeps the object
// pinned, so the map can't be lost while a request is in flight.
export class HostTunnel implements DurableObject {
	private readonly ctx: DurableObjectState;
	private readonly env: RelayEnv;
	private readonly pendingRequests = new Map<string, PendingRequest>();

	constructor(ctx: DurableObjectState, env: RelayEnv) {
		this.ctx = ctx;
		this.env = env;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		switch (url.pathname) {
			case "/register":
				return this.register(url, request);
			case "/connect":
				return this.openChannel(url, request);
			case "/http":
				return this.proxyHttp(request);
			case "/status":
				return Response.json({ connected: this.hostWs() !== null });
			default:
				return Response.json({ error: "Not found" }, { status: 404 });
		}
	}

	private hostWs(): WebSocket | null {
		for (const ws of this.ctx.getWebSockets(HOST_TAG)) {
			if (ws.readyState === 1) return ws;
		}
		return null;
	}

	private channelWs(id: string): WebSocket | null {
		return this.ctx.getWebSockets(`${CHANNEL_TAG_PREFIX}${id}`)[0] ?? null;
	}

	private async register(url: URL, request: Request): Promise<Response> {
		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return Response.json(
				{ error: "WebSocket upgrade required" },
				{
					status: 426,
				},
			);
		}
		const hostId = url.searchParams.get("hostId");
		const token = request.headers.get("x-relay-token");
		if (!hostId || !token) {
			return Response.json(
				{ error: "Missing hostId or token" },
				{
					status: 400,
				},
			);
		}

		// Last-write-wins, like the Fly relay: close the old socket so flaky
		// clients don't get stuck behind a dead-but-not-yet-detected WS. A
		// server-initiated close does not fire our own webSocketClose handler,
		// so tear the old session down inline (without the setOnline(false)
		// write — we're about to write true for the new socket).
		this.teardownSession("Replaced by new tunnel");
		for (const ws of this.ctx.getWebSockets(HOST_TAG)) {
			try {
				ws.close(1000, "Replaced by new tunnel");
			} catch {}
		}

		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1], [HOST_TAG]);
		pair[1].serializeAttachment({ kind: "host" } satisfies Attachment);

		const session: HostSession = { hostId, token };
		await this.ctx.storage.put("session", session);
		await this.ctx.storage.put("lastPongAt", Date.now());
		await this.ctx.storage.setAlarm(Date.now() + PING_INTERVAL_MS);
		this.ctx.waitUntil(this.setOnline(session, true));

		console.log(`[relay-do] tunnel registered: ${hostId}`);
		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	private openChannel(url: URL, request: Request): Response {
		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return Response.json(
				{ error: "WebSocket upgrade required" },
				{
					status: 426,
				},
			);
		}
		const host = this.hostWs();
		if (!host) {
			return Response.json({ error: "Host not connected" }, { status: 503 });
		}

		const id = crypto.randomUUID();
		const path = url.searchParams.get("path") ?? "/";
		const query = url.searchParams.get("query") || undefined;

		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1], [`${CHANNEL_TAG_PREFIX}${id}`]);
		pair[1].serializeAttachment({ kind: "channel", id } satisfies Attachment);

		this.sendToHost(host, { type: "ws:open", id, path, query });
		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	private async proxyHttp(request: Request): Promise<Response> {
		const payload = (await request.json()) as ProxyHttpPayload;
		const host = this.hostWs();
		if (!host) {
			return Response.json(
				{ tunnelError: "Host not connected" },
				{ status: 503 },
			);
		}
		if (this.pendingRequests.size >= MAX_PENDING_REQUESTS) {
			return Response.json(
				{ tunnelError: "Host overloaded (pending request queue full)" },
				{ status: 502 },
			);
		}

		const id = crypto.randomUUID();
		try {
			const response = await new Promise<TunnelHttpResponse>(
				(resolve, reject) => {
					const timer = setTimeout(() => {
						this.pendingRequests.delete(id);
						reject(new Error("Request timed out"));
					}, REQUEST_TIMEOUT_MS);
					this.pendingRequests.set(id, { resolve, reject, timer });
					this.sendToHost(host, {
						type: "http",
						id,
						method: payload.method,
						path: payload.path,
						headers: payload.headers,
						body: payload.body,
					});
				},
			);
			return Response.json({
				status: response.status,
				headers: response.headers,
				body: response.body ?? null,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Tunnel send failed";
			return Response.json({ tunnelError: message }, { status: 502 });
		}
	}

	async webSocketMessage(
		ws: WebSocket,
		message: string | ArrayBuffer,
	): Promise<void> {
		const attachment = this.attachmentOf(ws);
		if (!attachment) return;
		const text =
			typeof message === "string" ? message : new TextDecoder().decode(message);

		if (attachment.kind === "channel") {
			const host = this.hostWs();
			if (!host) return;
			this.sendToHost(host, {
				type: "ws:frame",
				id: attachment.id,
				data: text,
			});
			return;
		}

		let msg: TunnelResponse;
		try {
			msg = JSON.parse(text) as TunnelResponse;
		} catch {
			return;
		}

		if (msg.type === "pong") {
			await this.ctx.storage.put("lastPongAt", Date.now());
		} else if (msg.type === "http:response") {
			const pending = this.pendingRequests.get(msg.id);
			if (pending) {
				clearTimeout(pending.timer);
				this.pendingRequests.delete(msg.id);
				pending.resolve(msg);
			}
		} else if (msg.type === "ws:frame") {
			if (typeof msg.data !== "string") return;
			const client = this.channelWs(msg.id);
			if (client?.readyState === 1) {
				if (msg.encoding === "base64") {
					client.send(base64ToArrayBuffer(msg.data));
				} else {
					client.send(msg.data);
				}
			}
		} else if (msg.type === "ws:close") {
			const client = this.channelWs(msg.id);
			if (client) {
				try {
					client.close(msg.code ?? 1000);
				} catch {}
			}
		}
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		await this.handleSocketGone(ws);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		await this.handleSocketGone(ws);
	}

	private async handleSocketGone(ws: WebSocket): Promise<void> {
		const attachment = this.attachmentOf(ws);
		if (!attachment) return;

		if (attachment.kind === "channel") {
			const host = this.hostWs();
			if (host) {
				this.sendToHost(host, { type: "ws:close", id: attachment.id });
			}
			return;
		}

		const session = await this.ctx.storage.get<HostSession>("session");
		this.teardownSession("Tunnel disconnected");
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.delete("session");
		if (session) {
			console.log(`[relay-do] tunnel unregistered: ${session.hostId}`);
			this.ctx.waitUntil(this.setOnline(session, false));
		}
	}

	async alarm(): Promise<void> {
		const host = this.hostWs();
		if (!host) return;

		const lastPongAt = (await this.ctx.storage.get<number>("lastPongAt")) ?? 0;
		if (Date.now() - lastPongAt > PONG_TIMEOUT_MS) {
			const session = await this.ctx.storage.get<HostSession>("session");
			try {
				host.close(1001, "Ping timeout");
			} catch {}
			this.teardownSession("Ping timeout");
			await this.ctx.storage.delete("session");
			if (session) {
				console.log(`[relay-do] ping timeout: ${session.hostId}`);
				this.ctx.waitUntil(this.setOnline(session, false));
			}
			return;
		}

		this.sendToHost(host, { type: "ping" });
		await this.ctx.storage.setAlarm(Date.now() + PING_INTERVAL_MS);
	}

	// Rejects in-flight proxied requests and closes every client channel.
	// Callers own the host socket itself plus the session/alarm storage keys,
	// because the right handling differs per path (replace vs disconnect).
	private teardownSession(reason: string): void {
		for (const [, pending] of this.pendingRequests) {
			clearTimeout(pending.timer);
			pending.reject(new Error(reason));
		}
		this.pendingRequests.clear();

		for (const ws of this.ctx.getWebSockets()) {
			const attachment = this.attachmentOf(ws);
			if (attachment?.kind === "channel") {
				try {
					ws.close(1001, reason);
				} catch {}
			}
		}
	}

	private attachmentOf(ws: WebSocket): Attachment | null {
		try {
			return ws.deserializeAttachment() as Attachment | null;
		} catch {
			return null;
		}
	}

	private sendToHost(host: WebSocket, message: TunnelRequest): void {
		try {
			host.send(JSON.stringify(message));
		} catch {
			// Socket died between hostWs() and send; close/error handler cleans up.
		}
	}

	private async setOnline(
		session: HostSession,
		isOnline: boolean,
	): Promise<void> {
		for (let attempt = 0; attempt < SET_ONLINE_MAX_ATTEMPTS; attempt++) {
			try {
				await createApiClient(
					session.token,
					this.env.NEXT_PUBLIC_API_URL,
				).host.setOnline.mutate({ hostId: session.hostId, isOnline });
				return;
			} catch (err) {
				if (attempt === SET_ONLINE_MAX_ATTEMPTS - 1) {
					console.error(
						`[relay-do] setOnline(${isOnline}) failed for ${session.hostId} after ${SET_ONLINE_MAX_ATTEMPTS} attempts`,
						err,
					);
					return;
				}
				await new Promise((r) =>
					setTimeout(r, SET_ONLINE_RETRY_BASE_MS * 2 ** attempt),
				);
			}
		}
	}
}
