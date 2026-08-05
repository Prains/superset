import {
	CONTROL_PING_JSON,
	CONTROL_PONG_JSON,
	DIAL_TIMEOUT_MS,
	type StreamDial,
} from "@superset/shared/tunnel-v2-protocol";
import { type Connection, type ConnectionContext, Server } from "partyserver";
import {
	type HttpExchangeRequest,
	type HttpExchangeResult,
	HttpExchanges,
} from "./http-exchange";
import { writePresence } from "./presence";
import type { RelayEnv } from "./types";

const HOST_TAG = "host";
// Frames a dial may deliver before the client's deferred upgrade completes.
const MAX_EARLY_FRAMES = 256;

type ConnState =
	| { kind: "host" }
	| { kind: "client"; ticket: string; peer?: string }
	| { kind: "dial"; ticket: string; peer?: string };

export type PrepareStreamResult = "ready" | "no-host" | "timeout";

// One Durable Object per hostId: the host's control channel plus every
// spliced stream terminate here. Stream traffic is never parsed. The Worker
// talks to this object over RPC; fetch is used only for WebSocket upgrades.
// In-memory maps span at most one dial window or HTTP exchange — traffic
// keeps the object awake through them, so hibernation cannot strand an entry.
export class HostTunnel extends Server<RelayEnv> {
	static options = { hibernate: true };

	private readonly pendingDials = new Map<string, (ok: boolean) => void>();
	private readonly earlyFrames = new Map<
		string,
		(string | ArrayBuffer | ArrayBufferView)[]
	>();
	private readonly httpExchanges = new HttpExchanges();

	onStart(): void {
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair(CONTROL_PING_JSON, CONTROL_PONG_JSON),
		);
	}

	// ── RPC (called by the Worker) ────────────────────────────────────

	isConnected(): boolean {
		return this.hostConn() !== null;
	}

	async prepareStream(
		ticket: string,
		path: string,
		query: string | undefined,
	): Promise<PrepareStreamResult> {
		const host = this.hostConn();
		if (!host) return "no-host";
		const arrived = new Promise<boolean>((resolve) => {
			this.pendingDials.set(ticket, resolve);
			setTimeout(() => {
				this.pendingDials.delete(ticket);
				resolve(false);
			}, DIAL_TIMEOUT_MS);
		});
		this.sendDial(host, {
			type: "stream:dial",
			ticket,
			kind: "ws",
			path,
			query,
		});
		return (await arrived) ? "ready" : "timeout";
	}

	async proxyHttp(request: HttpExchangeRequest): Promise<HttpExchangeResult> {
		const host = this.hostConn();
		if (!host) return { ok: false, reason: "timeout" };
		const ticket = crypto.randomUUID();
		const result = this.httpExchanges.begin(ticket, request);
		this.sendDial(host, {
			type: "stream:dial",
			ticket,
			kind: "http",
			path: request.pathWithQuery,
		});
		return result;
	}

	// ── Connection lifecycle ──────────────────────────────────────────

	getConnectionTags(_conn: Connection, ctx: ConnectionContext): string[] {
		const url = new URL(ctx.request.url);
		const ticket = url.searchParams.get("ticket");
		if (url.pathname.endsWith("/register")) return [HOST_TAG];
		if (url.pathname.endsWith("/client")) return ["client", `t:${ticket}`];
		if (url.pathname.endsWith("/dial")) return ["dial", `t:${ticket}`];
		return [];
	}

	async onConnect(conn: Connection, ctx: ConnectionContext): Promise<void> {
		const url = new URL(ctx.request.url);
		const ticket = url.searchParams.get("ticket") ?? "";

		if (conn.tags.includes(HOST_TAG)) {
			// Last-write-wins: the new socket evicts any old one.
			for (const other of this.getConnections(HOST_TAG)) {
				if (other.id !== conn.id)
					closeQuietly(other, 1000, "Replaced by new tunnel");
			}
			const token = ctx.request.headers.get("x-relay-token") ?? "";
			const hostId = url.searchParams.get("hostId") ?? this.name;
			await this.ctx.storage.put("session", { hostId, token });
			conn.setState({ kind: "host" } satisfies ConnState);
			this.ctx.waitUntil(this.presence(hostId, token, true));
			console.log(`[relay2] host connected: ${hostId}`);
			return;
		}

		if (conn.tags.includes("dial")) {
			conn.setState({ kind: "dial", ticket } satisfies ConnState);
			if (this.httpExchanges.has(ticket)) {
				this.httpExchanges.onDialConnect(ticket, conn);
				return;
			}
			this.pendingDials.get(ticket)?.(true);
			this.pendingDials.delete(ticket);
			return;
		}

		if (conn.tags.includes("client")) {
			const dial = this.findByTicket(ticket, "dial");
			if (!dial) {
				conn.close(1011, "Stream expired");
				return;
			}
			conn.setState({
				kind: "client",
				ticket,
				peer: dial.id,
			} satisfies ConnState);
			dial.setState({
				kind: "dial",
				ticket,
				peer: conn.id,
			} satisfies ConnState);
			const early = this.earlyFrames.get(dial.id);
			if (early) {
				this.earlyFrames.delete(dial.id);
				for (const frame of early) conn.send(frame as string | ArrayBuffer);
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
		if (!state || state.kind === "host") return;

		if (state.kind === "dial" && this.httpExchanges.has(state.ticket)) {
			this.httpExchanges.onDialMessage(state.ticket, conn, message);
			return;
		}

		if (state.peer) {
			this.getConnection(state.peer)?.send(message as string | ArrayBuffer);
			return;
		}

		// Unpaired sender is necessarily a dial waiting for its client.
		const buffer = this.earlyFrames.get(conn.id) ?? [];
		if (buffer.length >= MAX_EARLY_FRAMES) {
			this.earlyFrames.delete(conn.id);
			conn.close(1011, "Stream never paired");
			return;
		}
		buffer.push(message);
		this.earlyFrames.set(conn.id, buffer);
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
				const otherState = other.state as ConnState | undefined;
				if (other.id === conn.id || otherState?.kind === "host") continue;
				closeQuietly(other, 1001, "Tunnel disconnected");
			}
			this.httpExchanges.abortAll();
			const session = await this.ctx.storage.get<{
				hostId: string;
				token: string;
			}>("session");
			// A replaced socket's close lands after the new one registered.
			if (session && !this.hostConn()) {
				console.log(`[relay2] host disconnected: ${session.hostId}`);
				this.ctx.waitUntil(this.presence(session.hostId, session.token, false));
			}
			return;
		}

		this.earlyFrames.delete(conn.id);
		if (state.peer) {
			const peer = this.getConnection(state.peer);
			if (peer) closeQuietly(peer, 1001, "Stream closed");
		}
	}

	// ── Internals ─────────────────────────────────────────────────────

	private hostConn(): Connection | null {
		for (const conn of this.getConnections(HOST_TAG)) {
			if (conn.readyState === WebSocket.OPEN) return conn;
		}
		return null;
	}

	private findByTicket(ticket: string, kind: "dial"): Connection | null {
		for (const conn of this.getConnections(`t:${ticket}`)) {
			const state = conn.state as ConnState | undefined;
			if (state?.kind === kind) return conn;
		}
		return null;
	}

	private sendDial(host: Connection, dial: StreamDial): void {
		host.send(JSON.stringify(dial));
	}

	private presence(
		hostId: string,
		token: string,
		isOnline: boolean,
	): Promise<void> {
		return writePresence({
			storage: this.ctx.storage,
			apiUrl: this.env.NEXT_PUBLIC_API_URL,
			hostId,
			token,
			isOnline,
		});
	}
}

function closeQuietly(conn: Connection, code: number, reason: string): void {
	try {
		conn.close(code, reason);
	} catch {}
}
