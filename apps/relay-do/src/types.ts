export type {
	TunnelHttpRequest,
	TunnelHttpResponse,
	TunnelPing,
	TunnelPong,
	TunnelRequest,
	TunnelResponse,
	TunnelWsClose,
	TunnelWsFrame,
	TunnelWsOpen,
} from "@superset/shared/tunnel-protocol";

export interface RelayEnv {
	NEXT_PUBLIC_API_URL: string;
	HOST_TUNNEL: DurableObjectNamespace;
}
