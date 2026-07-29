import { describe, expect, test } from "bun:test";
import type { AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import { serve } from "@hono/node-server";
import { isWildcardHost } from "@superset/shared/bind-host";
import { Hono } from "hono";

/**
 * Reproduction for #6054. `serve.ts` used to call `serve({ fetch, port })` with
 * no `hostname`, so the host service bound the wildcard address — reachable
 * from every interface (LAN, VPN, tailnet) — while logging "localhost".
 */
async function listen(options: {
	port: number;
	hostname?: string;
}): Promise<{ info: AddressInfo; close: () => Promise<void> }> {
	const app = new Hono();
	app.get("/", (c) => c.text("ok"));

	return new Promise((resolve, reject) => {
		const server = serve({ fetch: app.fetch, ...options }, (info) => {
			resolve({
				info,
				close: () =>
					new Promise<void>((done) => {
						server.close(() => done());
					}),
			});
		});
		server.on("error", reject);
	});
}

describe("host-service bind address", () => {
	test("omitting hostname binds every interface, not loopback", async () => {
		const { info, close } = await listen({ port: 0 });
		try {
			expect(isWildcardHost(info.address)).toBe(true);
			expect(info.address).not.toBe("127.0.0.1");
		} finally {
			await close();
		}
	});

	test("HOST_SERVICE_HOSTNAME pins the listener to loopback", async () => {
		const { info, close } = await listen({ port: 0, hostname: "127.0.0.1" });
		try {
			expect(info.address).toBe("127.0.0.1");
			expect(isWildcardHost(info.address)).toBe(false);
		} finally {
			await close();
		}
	});

	// The actual reachability claim in #6054: a wildcard bind answers on other
	// interfaces (LAN/VPN/tailnet), a loopback bind does not. Needs a
	// non-loopback IPv4 interface to observe, so it self-skips without one.
	const externalIp =
		Object.values(networkInterfaces())
			.flat()
			.find((n) => n && n.family === "IPv4" && !n.internal)?.address ?? "";

	test.skipIf(externalIp === "")(
		"only a pinned bind is unreachable from another interface",
		async () => {
			const wildcard = await listen({ port: 0 });
			try {
				expect(await isReachableAt(externalIp, wildcard.info.port)).toBe(true);
			} finally {
				await wildcard.close();
			}

			const loopback = await listen({ port: 0, hostname: "127.0.0.1" });
			try {
				expect(await isReachableAt(externalIp, loopback.info.port)).toBe(false);
			} finally {
				await loopback.close();
			}
		},
	);
});

async function isReachableAt(host: string, port: number): Promise<boolean> {
	try {
		const res = await fetch(`http://${host}:${port}/`, {
			signal: AbortSignal.timeout(2_000),
		});
		return res.ok;
	} catch {
		return false;
	}
}
