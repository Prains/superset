import { formatListenUrl, isWildcardHost } from "@superset/shared/bind-host";

/**
 * Human-readable description of what the server actually bound to.
 *
 * The startup log used to print "localhost" unconditionally, which hid a
 * wildcard bind — the one detail an operator checking reachability needs.
 */
export function describeListenAddress(info: {
	address: string;
	port: number;
}): string {
	const url = formatListenUrl(info.address, info.port);
	if (!isWildcardHost(info.address)) return url;
	return `${url} (all interfaces — reachable from other machines on this network; set HOST_SERVICE_HOSTNAME=127.0.0.1 or pass --host 127.0.0.1 to restrict)`;
}
