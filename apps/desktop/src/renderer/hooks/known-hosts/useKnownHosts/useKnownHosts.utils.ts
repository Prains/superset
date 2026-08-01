import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";

/** Host identity fields the target-derivation read paths need. */
export interface KnownHostRow {
	organizationId: string;
	machineId: string;
	name: string;
	isOnline: boolean;
}

const SNAPSHOT_KEY_PREFIX = "known-hosts:v1";

function snapshotKey(organizationId: string): string {
	return `${SNAPSHOT_KEY_PREFIX}:${organizationId}`;
}

/**
 * Pick the host list to derive query targets from. Live (Electric) rows win
 * outright; the last-seen snapshot only fills in when Electric serves
 * nothing — cold start before hydration, or a resync window where the
 * collection is transiently empty. Never merged row-by-row: when live data
 * exists it is the full truth, so a host deleted from the org can't be
 * resurrected by a stale snapshot.
 */
export function resolveKnownHosts(
	liveRows: KnownHostRow[],
	snapshotRows: KnownHostRow[] | undefined,
): KnownHostRow[] {
	if (liveRows.length > 0) return liveRows;
	return snapshotRows ?? [];
}

export async function loadKnownHostsSnapshot(
	organizationId: string,
): Promise<KnownHostRow[] | undefined> {
	if (!organizationId) return undefined;
	try {
		const rows = await idbGet<KnownHostRow[]>(snapshotKey(organizationId));
		// Guard against a snapshot written under a different key scheme or a
		// corrupted value — bad persistence must degrade to "no snapshot".
		if (!Array.isArray(rows)) return undefined;
		return rows.filter(
			(row) =>
				row &&
				typeof row.machineId === "string" &&
				row.organizationId === organizationId,
		);
	} catch {
		return undefined;
	}
}

export function saveKnownHostsSnapshot(
	organizationId: string,
	rows: KnownHostRow[],
): void {
	if (!organizationId) return;
	void idbSet(snapshotKey(organizationId), rows).catch(() => {});
}

export function clearKnownHostsSnapshot(organizationId: string): void {
	if (!organizationId) return;
	void idbDel(snapshotKey(organizationId)).catch(() => {});
}
