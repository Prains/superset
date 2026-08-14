/**
 * host-service must serve every procedure in the workspace contract.
 *
 * The contract is the shared surface between this runtime (a laptop) and the
 * cloud sandbox runtime. Both serve it; clients are written against it once.
 * If a procedure is renamed or dropped here without updating the contract,
 * the sandbox and the device silently diverge and clients break against one
 * of them — so this file fails the build instead.
 *
 * This is a *subset* assertion: host-service may serve more (the host
 * overlay — workspace/project/creation/settings management, which a sandbox
 * has no business exposing). It may not serve less.
 */

import { describe, expect, it } from "bun:test";
import {
	type ContractNode,
	isProcedureContract,
	workspaceContract,
} from "@superset/workspace-contract";
import { appRouter } from "./router/router";

/** Every `a.b.c` path in the contract, in declaration order. */
function contractPaths(node: ContractNode, prefix = ""): string[] {
	if (isProcedureContract(node)) return [prefix];
	return Object.entries(node).flatMap(([key, child]) =>
		contractPaths(child as ContractNode, prefix ? `${prefix}.${key}` : key),
	);
}

/** Resolve a dotted path against the built tRPC router's procedure record. */
function routerHas(path: string): boolean {
	const segments = path.split(".");
	let node: unknown = appRouter._def.procedures;
	// tRPC flattens nested routers into dotted keys, so try the whole path
	// first and fall back to walking, which keeps this working whichever
	// shape a future tRPC version produces.
	if (node && typeof node === "object" && path in (node as object)) return true;
	for (const segment of segments) {
		if (!node || typeof node !== "object") return false;
		node = (node as Record<string, unknown>)[segment];
	}
	return node !== undefined;
}

describe("workspace contract compliance", () => {
	const paths = contractPaths(workspaceContract);

	it("declares a non-trivial contract", () => {
		// Guards against the assertion silently passing because the contract
		// failed to compose (an empty contract trivially satisfies anything).
		expect(paths.length).toBeGreaterThan(50);
	});

	it("serves every contract procedure", () => {
		const missing = paths.filter((path) => !routerHas(path));
		expect(missing).toEqual([]);
	});
});
