import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { formatListenUrl, localDialHost } from "@superset/shared/bind-host";
import type { ApiClient } from "../api-client";
import { env } from "../env";
import {
	type HostServiceManifest,
	hostDbPath,
	writeManifest,
} from "./manifest";
import { getRelayUrl } from "./relay-url";

const HEALTH_POLL_INTERVAL_MS = 200;
const HEALTH_POLL_TIMEOUT_MS = 10_000;

export interface SpawnHostOptions {
	organizationId: string;
	sessionToken: string;
	authConfigPath?: string;
	api: ApiClient;
	port?: number;
	/**
	 * Address the host service binds. Undefined keeps the wildcard bind, which
	 * is reachable from every interface (LAN, VPN, tailnet).
	 */
	hostname?: string;
	daemon: boolean;
}

export interface SpawnHostResult {
	pid: number;
	port: number;
	secret: string;
	/** Address the service was asked to bind, or "0.0.0.0" for a wildcard bind. */
	hostname: string;
	endpoint: string;
}

async function findFreePort(probeHost: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.listen(0, probeHost, () => {
			const addr = server.address();
			if (addr && typeof addr === "object") {
				const { port } = addr;
				server.close(() => resolve(port));
			} else {
				server.close(() => reject(new Error("Could not get port")));
			}
		});
		server.on("error", reject);
	});
}

async function pollHealth(endpoint: string, secret: string): Promise<boolean> {
	const deadline = Date.now() + HEALTH_POLL_TIMEOUT_MS;
	while (Date.now() < deadline) {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 2_000);
			const res = await fetch(`${endpoint}/trpc/health.check`, {
				signal: controller.signal,
				headers: { Authorization: `Bearer ${secret}` },
			});
			clearTimeout(timeout);
			if (res.ok) return true;
		} catch {
			// not ready
		}
		await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
	}
	return false;
}

/**
 * Resolve the sibling `superset-host` wrapper binary.
 *
 * When running as a compiled binary, it's a sibling file in the same bin/
 * directory as the current executable. In dev (`bun run dev`), allow
 * override via SUPERSET_HOST_BIN env var.
 */
function resolveHostBinary(): string {
	if (process.env.SUPERSET_HOST_BIN) return process.env.SUPERSET_HOST_BIN;
	const cliBin = process.execPath;
	return join(dirname(cliBin), "superset-host");
}

function resolveMigrationsFolder(): string {
	if (process.env.HOST_MIGRATIONS_FOLDER) {
		return process.env.HOST_MIGRATIONS_FOLDER;
	}
	// Compiled layout: <bundle>/bin/superset → <bundle>/share/migrations
	const cliBin = process.execPath;
	const bundleRoot = dirname(dirname(cliBin));
	return join(bundleRoot, "share", "migrations");
}

export async function spawnHostService(
	options: SpawnHostOptions,
): Promise<SpawnHostResult> {
	const hostBin = resolveHostBinary();
	if (!existsSync(hostBin)) {
		throw new Error(
			`superset-host binary not found at ${hostBin}. Set SUPERSET_HOST_BIN to override.`,
		);
	}

	// A wildcard bind is reachable on every interface, so the free-port probe
	// has to check the same address the service will bind — a port free on
	// loopback can still be taken elsewhere.
	const dialHost = localDialHost(options.hostname);
	const port = options.port ?? (await findFreePort(options.hostname ?? "::"));
	const endpoint = formatListenUrl(dialHost, port);
	const secret = randomBytes(32).toString("hex");
	const migrationsFolder = resolveMigrationsFolder();
	const relayUrl = await getRelayUrl(options.api);

	const child = spawn(hostBin, [], {
		stdio: options.daemon ? "ignore" : "inherit",
		detached: options.daemon,
		env: {
			...process.env,
			ORGANIZATION_ID: options.organizationId,
			AUTH_TOKEN: options.sessionToken,
			...(options.authConfigPath
				? { SUPERSET_AUTH_CONFIG_PATH: options.authConfigPath }
				: {}),
			SUPERSET_API_URL: env.SUPERSET_API_URL,
			RELAY_URL: relayUrl,
			PORT: String(port),
			HOST_SERVICE_PORT: String(port),
			...(options.hostname ? { HOST_SERVICE_HOSTNAME: options.hostname } : {}),
			HOST_SERVICE_SECRET: secret,
			HOST_DB_PATH: hostDbPath(options.organizationId),
			HOST_MIGRATIONS_FOLDER: migrationsFolder,
		},
	});

	if (!child.pid) {
		throw new Error("Failed to spawn host-service");
	}

	const healthy = await pollHealth(endpoint, secret);
	if (!healthy) {
		child.kill("SIGTERM");
		throw new Error(
			`Host service failed to start within ${HEALTH_POLL_TIMEOUT_MS}ms`,
		);
	}

	const manifest: HostServiceManifest = {
		pid: child.pid,
		endpoint,
		authToken: secret,
		startedAt: Date.now(),
		organizationId: options.organizationId,
	};
	writeManifest(manifest);

	if (options.daemon) {
		child.unref();
	}

	return {
		pid: child.pid,
		port,
		secret,
		hostname: options.hostname ?? "0.0.0.0",
		endpoint,
	};
}
