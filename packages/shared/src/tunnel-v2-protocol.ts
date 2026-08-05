// Tunnel v2: one small JSON control channel per host + one raw WebSocket per
// proxied stream ("dial-back"). The relay asks the host to dial a fresh socket
// for each stream via a one-time ticket; after pairing, the relay splices
// bytes verbatim — no envelopes, no base64, no per-frame parsing.

// ── Relay → host (control channel) ──────────────────────────────────

export interface StreamDial {
	type: "stream:dial";
	ticket: string;
	kind: "ws" | "http";
	/** Host-local path, e.g. "/terminal/<id>" or "/events". */
	path: string;
	/** Raw query string without leading "?", if any. */
	query?: string;
}

export interface ControlDrain {
	type: "drain";
	reason?: string;
}

export type ControlServerMessage = StreamDial | ControlDrain;

// ── Host → relay (control channel) ──────────────────────────────────

export interface ControlHello {
	type: "hello";
	protoVersion: 2;
	hostServiceVersion?: string;
}

/** Answered by the relay's hibernation auto-response; never wakes the DO. */
export interface ControlPing {
	type: "ping";
}

export type ControlClientMessage = ControlHello | ControlPing;

export const CONTROL_PING_JSON = '{"type":"ping"}';
export const CONTROL_PONG_JSON = '{"type":"pong"}';

// ── HTTP-over-dial frames ───────────────────────────────────────────
// A kind:"http" dial carries exactly one exchange: relay sends a request
// header frame, then the body as binary frames, then an end frame; the host
// replies symmetrically. Text frames are JSON control frames; binary frames
// are raw body bytes.

export interface HttpRequestHeader {
	type: "http:request";
	method: string;
	path: string;
	headers: Record<string, string>;
}

export interface HttpResponseHeader {
	type: "http:response";
	status: number;
	headers: Record<string, string>;
}

export interface HttpEnd {
	type: "http:end";
}

export type HttpDialFrame = HttpRequestHeader | HttpResponseHeader | HttpEnd;

/** How long the host has to dial back before the relay abandons the stream. */
export const DIAL_TIMEOUT_MS = 10_000;
