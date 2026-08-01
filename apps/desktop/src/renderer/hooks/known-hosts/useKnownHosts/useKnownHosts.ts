import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef, useState } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";
import {
	type KnownHostRow,
	loadKnownHostsSnapshot,
	resolveKnownHosts,
	saveKnownHostsSnapshot,
} from "./useKnownHosts.utils";

export type { KnownHostRow } from "./useKnownHosts.utils";

/**
 * Org host list for query-target derivation, decoupled from Electric's sync
 * lifecycle. The Electric `v2Hosts` collection stays the live source, but its
 * rows are persisted to IndexedDB and served from that snapshot whenever the
 * collection is empty (cold start before hydration, resync truncation).
 *
 * Without this, an Electric flicker empties the host target list and every
 * host-derived read path (workspaces, projects, PR chips, ports) drops its
 * rows — a full sidebar clear (verified 2026-08-01; see
 * apps/desktop/docs/SIDEBAR_STATE_RESILIENCE.md).
 */
export function useKnownHosts(): { hosts: KnownHostRow[] } {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: liveRows = [] } = useLiveQuery(
		(q) =>
			q.from({ hosts: collections.v2Hosts }).select(({ hosts }) => ({
				organizationId: hosts.organizationId,
				machineId: hosts.machineId,
				name: hosts.name,
				isOnline: hosts.isOnline,
			})),
		[collections],
	);

	const [snapshot, setSnapshot] = useState<KnownHostRow[] | undefined>(
		undefined,
	);
	useEffect(() => {
		if (!organizationId) return;
		let cancelled = false;
		setSnapshot(undefined);
		void loadKnownHostsSnapshot(organizationId).then((rows) => {
			if (!cancelled) setSnapshot(rows);
		});
		return () => {
			cancelled = true;
		};
	}, [organizationId]);

	// Persist live rows whenever Electric serves data, so the snapshot always
	// reflects the last full truth (including host deletions).
	const lastPersistedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!organizationId || liveRows.length === 0) return;
		const fingerprint = JSON.stringify(liveRows);
		if (lastPersistedRef.current === fingerprint) return;
		lastPersistedRef.current = fingerprint;
		saveKnownHostsSnapshot(organizationId, liveRows as KnownHostRow[]);
	}, [organizationId, liveRows]);

	const hosts = useMemo(
		() => resolveKnownHosts(liveRows as KnownHostRow[], snapshot),
		[liveRows, snapshot],
	);

	return { hosts };
}
