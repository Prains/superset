import { describe, expect, test } from "bun:test";
import {
	formatListenUrl,
	isWildcardHost,
	localDialHost,
	toUrlHost,
} from "./bind-host";

describe("isWildcardHost", () => {
	test("recognises the addresses Node reports for an all-interface bind", () => {
		for (const host of ["0.0.0.0", "::", "::0", "[::]", "*"]) {
			expect(isWildcardHost(host)).toBe(true);
		}
	});

	test("treats loopback and specific addresses as pinned", () => {
		for (const host of ["127.0.0.1", "::1", "localhost", "100.64.0.2"]) {
			expect(isWildcardHost(host)).toBe(false);
		}
	});
});

describe("toUrlHost", () => {
	test("brackets bare IPv6 literals", () => {
		expect(toUrlHost("::1")).toBe("[::1]");
		expect(toUrlHost("fe80::1")).toBe("[fe80::1]");
	});

	test("leaves already-bracketed and IPv4 hosts alone", () => {
		expect(toUrlHost("[::1]")).toBe("[::1]");
		expect(toUrlHost("127.0.0.1")).toBe("127.0.0.1");
	});
});

describe("formatListenUrl", () => {
	test("builds a dialable URL for IPv4 and IPv6", () => {
		expect(formatListenUrl("127.0.0.1", 4879)).toBe("http://127.0.0.1:4879");
		expect(formatListenUrl("::", 4879)).toBe("http://[::]:4879");
	});
});

describe("localDialHost", () => {
	test("falls back to loopback for wildcard and unset binds", () => {
		expect(localDialHost(undefined)).toBe("127.0.0.1");
		expect(localDialHost("0.0.0.0")).toBe("127.0.0.1");
		expect(localDialHost("::")).toBe("127.0.0.1");
	});

	test("keeps a pinned address so the client dials what was bound", () => {
		expect(localDialHost("127.0.0.1")).toBe("127.0.0.1");
		expect(localDialHost("100.64.0.2")).toBe("100.64.0.2");
	});
});
