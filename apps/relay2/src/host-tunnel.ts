import {
	CONTROL_PING_JSON,
	CONTROL_PONG_JSON,
	DIAL_TIMEOUT_MS,
	type HttpDialFrame,
	type HttpResponseHeader,
	type StreamDial,
} from "@superset/shared/tunnel-v2-protocol";
import { type Connection, type ConnectionContext, Server } from "partyserver";
import { createApiClient } from "./api-client";
import type { RelayEnv } from "./types";

const HOST_TAG = "host";
const SET_ONLINE_RETRY_BASE_MS = 500;
const SET_ONLINE_MAX_ATTEMPTS = 3;
const HTTP_EXCHANGE_TIMEOUT_MS = 30_000;
// Frames a client may send before the host's dial-back pairs the stream
// (e.g. a terminal attach message). Bounded; overflow closes the stream.
const MAX_PENDING_FRAMES = 256;

type ConnState =
	| { kind: "host" }
	| { kind: "client"; ticket: string; peer?: string }
	| { kind: "dial"; ticket: string; peer?: string };

interface OutboundHttpRequest {
	method: string;
	pathWithQuery: string;
	headers: Record<string, string>;
	body: Uint8Array<ArrayBuffer>;
}

interface PendingHttp {
	request: OutboundHttpRequest;
	resolve: (response: Response) => void;
	header?: HttpResponseHeader;
	chunks: Uint8Array<ArrayBuffer>[];
	timer: ReturnType<typeof setTimeout>;
}

// One DO per hostId. The host keeps a small JSON control channel here; every
// proxied stream (terminal WS, event bus, one HTTP exchange) is its own
// WebSocket pair spliced verbatim — the DO never parses stream traffic.
// partyserver owns hibernation, connection identity, and tag bookkeeping;
// session facts that must survive hibernation live in DO storage.
export class HostTunnel extends Server<RelayEnv> {
	static options = { hibernate: true };

	// In-memory only: each entry protects a window of at most DIAL_TIMEOUT_MS
	// (or one HTTP exchange), during which live traffic keeps the DO awake, so
	// hibernation loss is not a correctness concern — a lost entry degrades to
	// "stream never pairs" and the timeout closes it.
	private readonly dialTimers = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();
	private readonly preDialFrames = new Map<
		string,
		(string | ArrayBuffer | ArrayBufferView)[]
	>();
	private readonly pendingHttp = new Map<string, PendingHttp>();

	onStart(): void {
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair(CONTROL_PING_JSON, CONTROL_PONG_JSON),
		);
	}

	getConnectionTags(_conn: Connection, ctx: ConnectionContext): string[] {
		const url = new URL(ctx.request.url);
		const ticket = url.searchParams.get("ticket");
		if (url.pathname.endsWith("/register")) return [HOST_TAG];
		if (url.pathname.endsWith("/client")) return ["client", `t:${ticket}`];
		if (url.pathname.endsWith("/dial")) return ["dial", `t:${ticket}`];
		return [];
	}

	private hostConn(): Connection | null {
		for (const conn of this.getConnections(HOST_TAG)) {
			if (conn.readyState === WebSocket.OPEN) return conn;
		}
		return null;
	}

	private findByTicket(
		ticket: string,
		kind: "client" | "dial",
	): Connection | null {
		for (const conn of this.getConnections(`t:${ticket}`)) {
			const state = conn.state as ConnState | undefined;
			if (state?.kind === kind) return conn;
		}
		return null;
	}

	async onConnect(conn: Connection, ctx: ConnectionContext): Promise<void> {
		const url = new URL(ctx.request.url);

		if (conn.tags.includes(HOST_TAG)) {
			// Last-write-wins, same as the v1 relay: a flaky host's new socket
			// evicts the dead-but-undetected old one.
			for (const other of this.getConnections(HOST_TAG)) {
				if (other.id !== conn.id) {
					try {
						other.close(1000, "Replaced by new tunnel");
					} catch {}
				}
			}
			const token = ctx.request.headers.get("x-relay-token") ?? "";
			const hostId = url.searchParams.get("hostId") ?? this.name;
			await this.ctx.storage.put("session", { hostId, token });
			conn.setState({ kind: "host" } satisfies ConnState);
			this.ctx.waitUntil(this.setOnline(hostId, token, true));
			console.log(`[relay2] host connected: ${hostId}`);
			return;
		}

		if (conn.tags.includes("client")) {
			const ticket = url.searchParams.get("ticket") ?? "";
			const host = this.hostConn();
			console.log(
				`[relay2] client stream open ticket=${ticket.slice(0, 8)} host=${host ? "present" : "absent"}`,
			);
			if (!host) {
				conn.close(1011, "Host not connected");
				return;
			}
			conn.setState({ kind: "client", ticket } satisfies ConnState);
			const dial: StreamDial = {
				type: "stream:dial",
				ticket,
				kind: "ws",
				path: url.searchParams.get("path") ?? "/",
				query: url.searchParams.get("query") ?? undefined,
			};
			host.send(JSON.stringify(dial));
			this.dialTimers.set(
				ticket,
				setTimeout(() => {
					this.dialTimers.delete(ticket);
					this.preDialFrames.delete(conn.id);
					try {
						conn.close(1011, "Host did not answer");
					} catch {}
				}, DIAL_TIMEOUT_MS),
			);
			return;
		}

		if (conn.tags.includes("dial")) {
			const ticket = url.searchParams.get("ticket") ?? "";
			console.log(`[relay2] dial-back arrived ticket=${ticket.slice(0, 8)}`);
			const timer = this.dialTimers.get(ticket);
			if (timer) {
				clearTimeout(timer);
				this.dialTimers.delete(ticket);
			}
			conn.setState({ kind: "dial", ticket } satisfies ConnState);

			// HTTP exchange: no client socket — push the request immediately.
			const pending = this.pendingHttp.get(ticket);
			if (pending) {
				conn.send(
					JSON.stringify({
						type: "http:request",
						method: pending.request.method,
						path: pending.request.pathWithQuery,
						headers: pending.request.headers,
					}),
				);
				if (pending.request.body.byteLength > 0) {
					conn.send(pending.request.body);
				}
				conn.send('{"type":"http:end"}');
				return;
			}

			const client = this.findByTicket(ticket, "client");
			if (!client) {
				conn.close(1011, "Unknown ticket");
				return;
			}
			conn.setState({
				kind: "dial",
				ticket,
				peer: client.id,
			} satisfies ConnState);
			client.setState({
				kind: "client",
				ticket,
				peer: conn.id,
			} satisfies ConnState);
			const buffered = this.preDialFrames.get(client.id);
			if (buffered) {
				this.preDialFrames.delete(client.id);
				for (const frame of buffered) conn.send(frame as string | ArrayBuffer);
			}
			return;
		}

		conn.close(1008, "Unknown endpoint");
	}

	onMessage(
		conn: Connection,
		message: string | ArrayBuffer | ArrayBufferView,
	): void {
		const state = conn.state as ConnState | undefined;
		if (!state) return;

		if (state.kind === "host") {
			// Control channel carries only small JSON from the host ("hello";
			// "ping" is answered by the auto-response without reaching here).
			return;
		}

		if (state.kind === "client") {
			if (state.peer) {
				this.getConnection(state.peer)?.send(message as string | ArrayBuffer);
				return;
			}
			const buffer = this.preDialFrames.get(conn.id) ?? [];
			if (buffer.length >= MAX_PENDING_FRAMES) {
				this.preDialFrames.delete(conn.id);
				conn.close(1011, "Stream never paired");
				return;
			}
			buffer.push(message);
			this.preDialFrames.set(conn.id, buffer);
			return;
		}

		// state.kind === "dial"
		const pending = this.pendingHttp.get(state.ticket);
		if (pending) {
			this.onHttpFrame(state.ticket, pending, message);
			return;
		}
		if (state.peer) {
			this.getConnection(state.peer)?.send(message as string | ArrayBuffer);
		}
	}

	async onClose(conn: Connection): Promise<void> {
		await this.handleGone(conn);
	}

	async onError(conn: Connection): Promise<void> {
		await this.handleGone(conn);
	}

	private async handleGone(conn: Connection): Promise<void> {
		const state = conn.state as ConnState | undefined;
		if (!state) return;

		if (state.kind === "host") {
			for (const other of this.getConnections()) {
				if (other.id === conn.id) continue;
				const otherState = other.state as ConnState | undefined;
				if (otherState?.kind === "host") continue;
				try {
					other.close(1001, "Tunnel disconnected");
				} catch {}
			}
			for (const [, pending] of this.pendingHttp) clearTimeout(pending.timer);
			this.pendingHttp.clear();
			const session = await this.ctx.storage.get<{
				hostId: string;
				token: string;
			}>("session");
			// Only mark offline when no replacement socket is already up: the
			// last-write-wins close of an old socket lands here after the new
			// host registered.
			if (session && !this.hostConn()) {
				console.log(`[relay2] host disconnected: ${session.hostId}`);
				this.ctx.waitUntil(
					this.setOnline(session.hostId, session.token, false),
				);
			}
			return;
		}

		this.preDialFrames.delete(conn.id);
		if (state.peer) {
			try {
				this.getConnection(state.peer)?.close(1001, "Stream closed");
			} catch {}
		}
	}

	// ── HTTP proxying (one exchange per dial) ─────────────────────────

	async onRequest(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname.endsWith("/status")) {
			return Response.json({ connected: this.hostConn() !== null });
		}
		if (url.pathname.endsWith("/http")) {
			return this.proxyHttp(request, url);
		}
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	private async proxyHttp(request: Request, url: URL): Promise<Response> {
		const host = this.hostConn();
		if (!host) {
			return Response.json(
				{ tunnelError: "Host not connected" },
				{ status: 503 },
			);
		}
		const path = url.searchParams.get("path") ?? "/";
		const query = url.searchParams.get("query") ?? undefined;
		const ticket = crypto.randomUUID();
		const body = new Uint8Array(await request.arrayBuffer());

		const headers: Record<string, string> = {};
		for (const [key, value] of request.headers.entries()) {
			if (key !== "host" && key !== "authorization") headers[key] = value;
		}

		const responsePromise = new Promise<Response>((resolve) => {
			this.pendingHttp.set(ticket, {
				request: {
					method: request.method,
					pathWithQuery: query ? `${path}?${query}` : path,
					headers,
					body: body as Uint8Array<ArrayBuffer>,
				},
				resolve,
				chunks: [],
				timer: setTimeout(() => {
					this.pendingHttp.delete(ticket);
					this.findByTicket(ticket, "dial")?.close(1011, "Request timed out");
					resolve(
						Response.json(
							{ tunnelError: "Request timed out" },
							{ status: 502 },
						),
					);
				}, HTTP_EXCHANGE_TIMEOUT_MS),
			});
		});

		const dial: StreamDial = {
			type: "stream:dial",
			ticket,
			kind: "http",
			path,
			query,
		};
		host.send(JSON.stringify(dial));
		return responsePromise;
	}

	private onHttpFrame(
		ticket: string,
		pending: PendingHttp,
		message: string | ArrayBuffer | ArrayBufferView,
	): void {
		if (typeof message === "string") {
			let frame: HttpDialFrame;
			try {
				frame = JSON.parse(message) as HttpDialFrame;
			} catch {
				return;
			}
			if (frame.type === "http:response") {
				pending.header = frame;
			} else if (frame.type === "http:end") {
				clearTimeout(pending.timer);
				this.pendingHttp.delete(ticket);
				const size = pending.chunks.reduce((n, c) => n + c.byteLength, 0);
				const body = new Uint8Array(size);
				let offset = 0;
				for (const chunk of pending.chunks) {
					body.set(chunk, offset);
					offset += chunk.byteLength;
				}
				pending.resolve(
					new Response(size > 0 ? body : null, {
						status: pending.header?.status ?? 502,
						headers: pending.header?.headers,
					}),
				);
				this.findByTicket(ticket, "dial")?.close(1000, "Exchange complete");
			}
			return;
		}
		const bytes =
			message instanceof ArrayBuffer
				? new Uint8Array(message)
				: new Uint8Array(
						message.buffer,
						message.byteOffset,
						message.byteLength,
					);
		pending.chunks.push(bytes as Uint8Array<ArrayBuffer>);
	}

	private async setOnline(
		hostId: string,
		token: string,
		isOnline: boolean,
	): Promise<void> {
		// Monotonic per-host version, persisted across hibernation, so a late
		// offline write from a dying socket can never clobber a newer online
		// write (the gray-dot race demonstrated in prod on 2026-08-04). The
		// version is authoritative inside this DO: any attempt superseded by a
		// newer one aborts between retries.
		const version =
			((await this.ctx.storage.get<number>("onlineVersion")) ?? 0) + 1;
		await this.ctx.storage.put("onlineVersion", version);
		for (let attempt = 0; attempt < SET_ONLINE_MAX_ATTEMPTS; attempt++) {
			const current = await this.ctx.storage.get<number>("onlineVersion");
			if (current !== version) return;
			try {
				await createApiClient(
					token,
					this.env.NEXT_PUBLIC_API_URL,
				).host.setOnline.mutate({ hostId, isOnline });
				return;
			} catch (err) {
				if (attempt === SET_ONLINE_MAX_ATTEMPTS - 1) {
					console.error(
						`[relay2] setOnline(${isOnline}) failed for ${hostId}`,
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
