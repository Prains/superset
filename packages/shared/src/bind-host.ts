/**
 * Helpers for reasoning about the address a local service is bound to.
 *
 * The standalone host service binds the wildcard address by default, which
 * means every interface on the machine — including VPN/tailnet interfaces —
 * can reach it. Callers need to tell a wildcard bind from a pinned one so
 * they can report it honestly and still dial it from the same machine.
 */

const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "::0", "[::]", "*"]);

export function isWildcardHost(host: string): boolean {
	return WILDCARD_HOSTS.has(host.trim().toLowerCase());
}

/** Wrap bare IPv6 literals so they're valid inside a URL authority. */
export function toUrlHost(host: string): string {
	if (host.startsWith("[")) return host;
	return host.includes(":") ? `[${host}]` : host;
}

export function formatListenUrl(host: string, port: number): string {
	return `http://${toUrlHost(host)}:${port}`;
}

/**
 * Address a client on the same machine should dial to reach a server bound to
 * `bindHost`. A wildcard bind also accepts on loopback, so loopback is the
 * safe choice there; any other bind only accepts on that exact address.
 */
export function localDialHost(bindHost: string | undefined): string {
	if (!bindHost || isWildcardHost(bindHost)) return "127.0.0.1";
	return bindHost;
}
