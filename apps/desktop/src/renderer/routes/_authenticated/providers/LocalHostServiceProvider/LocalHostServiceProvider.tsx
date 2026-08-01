import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
} from "react";
import { env } from "renderer/env.renderer";
import { authClient, useAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	setClientMachineId,
	setHostServiceSecret,
} from "renderer/lib/host-service-auth";
import type { HostServiceAvailabilityStatus } from "renderer/lib/host-service-unavailable";
import { MOCK_ORG_ID } from "shared/constants";

interface LocalHostServiceContextValue {
	machineId: string;
	activeHostUrl: string | null;
	activeOrganizationId: string | null;
	activeOrganizationName: string | null;
	hostServiceStatus: HostServiceAvailabilityStatus;
	/**
	 * Resolve once the local host service is live, returning its loopback URL
	 * (or null on timeout). Use this at the point of a host-backed action so
	 * local-first UI can act immediately without gating on `activeHostUrl`.
	 */
	waitForHostReady: (timeoutMs?: number) => Promise<string | null>;
}

const LocalHostServiceContext =
	createContext<LocalHostServiceContextValue | null>(null);
const MOCK_ORGANIZATION_IDS = [MOCK_ORG_ID];

export function LocalHostServiceProvider({
	children,
}: {
	children: ReactNode;
}) {
	const utils = electronTrpc.useUtils();
	const { data: session } = authClient.useSession();
	const { data: activeOrganization } = authClient.useActiveOrganization();
	const authToken = useAuthToken();
	const { mutate: persistOrganizationIds } =
		electronTrpc.auth.persistOrganizationIds.useMutation({
			networkMode: "always",
			retry: 3,
		});

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const organizationIds = env.SKIP_ENV_VALIDATION
		? MOCK_ORGANIZATION_IDS
		: session?.session?.organizationIds;

	useEffect(() => {
		if (organizationIds && authToken) {
			persistOrganizationIds({ token: authToken, organizationIds });
		}
	}, [authToken, organizationIds, persistOrganizationIds]);

	const { data: machineIdData } = electronTrpc.device.getMachineId.useQuery(
		undefined,
		{ staleTime: Number.POSITIVE_INFINITY },
	);

	useEffect(() => {
		if (machineIdData?.machineId) {
			setClientMachineId(machineIdData.machineId);
		}
	}, [machineIdData]);

	const { data: activeConnection } =
		electronTrpc.hostServiceCoordinator.getConnection.useQuery(
			{ organizationId: activeOrganizationId as string },
			{ enabled: !!activeOrganizationId, refetchInterval: 5_000 },
		);

	const { data: processStatus } =
		electronTrpc.hostServiceCoordinator.getProcessStatus.useQuery(
			{ organizationId: activeOrganizationId as string },
			{
				enabled: !!activeOrganizationId,
				refetchInterval: activeConnection?.port ? false : 1_000,
			},
		);

	const waitForHostReady = useCallback(
		async (timeoutMs = 20_000): Promise<string | null> => {
			const orgId = activeOrganizationId;
			if (!orgId) return null;
			// Resolve the live host URL if a port is up, else null. Swallows
			// transient IPC/tRPC fetch failures so a poll error never rejects the
			// nullable contract callers rely on.
			const tryGetHostUrl = async (): Promise<string | null> => {
				try {
					const connection =
						await utils.hostServiceCoordinator.getConnection.fetch({
							organizationId: orgId,
						});
					if (connection?.port) {
						const hostUrl = `http://127.0.0.1:${connection.port}`;
						if (connection.secret)
							setHostServiceSecret(hostUrl, connection.secret);
						return hostUrl;
					}
				} catch (error) {
					console.warn("[host-service] connection poll failed:", error);
				}
				return null;
			};
			const deadline = Date.now() + timeoutMs;
			while (Date.now() < deadline) {
				const hostUrl = await tryGetHostUrl();
				if (hostUrl) return hostUrl;
				await new Promise((resolve) => setTimeout(resolve, 1_000));
			}
			// Final check: the last start may have brought the host up during the
			// trailing sleep, after the deadline elapsed.
			return await tryGetHostUrl();
		},
		[activeOrganizationId, utils],
	);

	const activeOrganizationName = activeOrganization?.name ?? null;

	const value = useMemo<LocalHostServiceContextValue | null>(() => {
		if (!machineIdData) return null;
		const machineId = machineIdData.machineId;
		const hostServiceStatus: HostServiceAvailabilityStatus =
			activeConnection?.port != null
				? "running"
				: (processStatus?.status ?? "unknown");

		if (!activeConnection?.port) {
			return {
				machineId,
				activeHostUrl: null,
				activeOrganizationId: activeOrganizationId ?? null,
				activeOrganizationName,
				hostServiceStatus,
				waitForHostReady,
			};
		}

		const activeHostUrl = `http://127.0.0.1:${activeConnection.port}`;
		if (activeConnection.secret) {
			setHostServiceSecret(activeHostUrl, activeConnection.secret);
		}

		return {
			machineId,
			activeHostUrl,
			activeOrganizationId: activeOrganizationId ?? null,
			activeOrganizationName,
			hostServiceStatus,
			waitForHostReady,
		};
	}, [
		machineIdData,
		activeConnection,
		activeOrganizationId,
		activeOrganizationName,
		processStatus?.status,
		waitForHostReady,
	]);

	if (!value) return null;

	return (
		<LocalHostServiceContext.Provider value={value}>
			{children}
		</LocalHostServiceContext.Provider>
	);
}

export function useLocalHostService(): LocalHostServiceContextValue {
	const context = useContext(LocalHostServiceContext);
	if (!context) {
		throw new Error(
			"useLocalHostService must be used within LocalHostServiceProvider",
		);
	}
	return context;
}
