import type { HostTunnel } from "./host-tunnel";

export interface RelayEnv {
	NEXT_PUBLIC_API_URL: string;
	/** Overrides the expected JWT issuer when it differs from the API address. */
	JWT_ISSUER?: string;
	HostTunnel: DurableObjectNamespace<HostTunnel>;
}
