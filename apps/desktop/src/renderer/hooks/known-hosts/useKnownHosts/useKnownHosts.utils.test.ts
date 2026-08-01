import { describe, expect, it } from "bun:test";
import { type KnownHostRow, resolveKnownHosts } from "./useKnownHosts.utils";

const ORG = "org-1";

function makeHost(overrides: Partial<KnownHostRow> = {}): KnownHostRow {
	return {
		organizationId: ORG,
		machineId: "machine-a",
		name: "Machine A",
		isOnline: true,
		...overrides,
	};
}

describe("resolveKnownHosts", () => {
	it("serves the snapshot when Electric is empty", () => {
		// The failure this guards: an Electric flicker (resync, cold start)
		// returning [] must not empty the host target list — that clears every
		// host-derived sidebar row.
		const snapshot = [makeHost(), makeHost({ machineId: "machine-b" })];
		expect(resolveKnownHosts([], snapshot)).toEqual(snapshot);
	});

	it("prefers live rows outright when Electric serves data", () => {
		const live = [makeHost({ isOnline: false })];
		const snapshot = [
			makeHost({ isOnline: true }),
			makeHost({ machineId: "deleted-host" }),
		];
		// No row-level merge: a host deleted from the org must not be
		// resurrected from a stale snapshot.
		expect(resolveKnownHosts(live, snapshot)).toEqual(live);
	});

	it("returns empty when both sources are empty", () => {
		expect(resolveKnownHosts([], undefined)).toEqual([]);
		expect(resolveKnownHosts([], [])).toEqual([]);
	});
});
