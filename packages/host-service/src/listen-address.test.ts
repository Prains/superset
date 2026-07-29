import { describe, expect, test } from "bun:test";
import { describeListenAddress } from "./listen-address";

describe("describeListenAddress", () => {
	// Regression for #6054: the startup log printed "http://localhost:<port>"
	// unconditionally, hiding the fact that the server was on every interface.
	test("does not claim localhost for a wildcard bind", () => {
		for (const address of ["::", "0.0.0.0"]) {
			const message = describeListenAddress({ address, port: 4879 });
			expect(message).not.toContain("localhost");
			expect(message).toContain("all interfaces");
		}
	});

	test("reports the IPv6 wildcard as a bracketed URL", () => {
		expect(describeListenAddress({ address: "::", port: 4879 })).toStartWith(
			"http://[::]:4879",
		);
	});

	test("reports a loopback bind without a reachability warning", () => {
		expect(describeListenAddress({ address: "127.0.0.1", port: 4879 })).toBe(
			"http://127.0.0.1:4879",
		);
	});

	test("reports a pinned non-loopback address verbatim", () => {
		expect(describeListenAddress({ address: "100.64.0.2", port: 4879 })).toBe(
			"http://100.64.0.2:4879",
		);
	});
});
