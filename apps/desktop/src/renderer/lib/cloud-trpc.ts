import type { AppRouter } from "@superset/trpc";
import { httpBatchStreamLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { env } from "renderer/env.renderer";
import superjson from "superjson";
import { getAuthToken } from "./auth-client";

/**
 * React Query hooks for the cloud API. Use this for reading cloud data in
 * components; use `apiTrpcClient` for imperative calls outside React.
 * Distinct from `electronTrpc` (main-process IPC) and `workspaceTrpc`
 * (host-service).
 */
export const cloudTrpc = createTRPCReact<AppRouter>();

export const cloudTrpcClient = cloudTrpc.createClient({
	links: [
		httpBatchStreamLink({
			url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
			transformer: superjson,
			headers: () => {
				const token = getAuthToken();
				return token ? { Authorization: `Bearer ${token}` } : {};
			},
		}),
	],
});
