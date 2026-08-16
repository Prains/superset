/**
 * Browser bridge — loopback control surface for the in-app browser panes.
 *
 * The host-service child is the only client: it learns the endpoint and
 * secret via BROWSER_BRIDGE_URL / BROWSER_BRIDGE_SECRET at spawn and proxies
 * its own authenticated `browser.*` tRPC procedures (and the raw CDP
 * WebSocket route) here. Nothing else should hold the secret, so it is never
 * written to disk.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import log from "electron-log";
import express from "express";
import { type WebSocket, WebSocketServer } from "ws";
import { setBrowserBridgeInfo } from "./browser-bridge-info";
import { type BrowserOpenRequest, browserManager } from "./browser-manager";

const OPEN_PANE_TIMEOUT_MS = 15_000;
const CDP_PATH = /^\/panes\/([^/]+)\/cdp$/;

let server: Server | null = null;

function isAuthorized(secret: string, req: IncomingMessage): boolean {
	const url = new URL(req.url ?? "/", "http://127.0.0.1");
	const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
	const candidate = bearer ?? url.searchParams.get("token") ?? "";
	const a = Buffer.from(candidate);
	const b = Buffer.from(secret);
	return a.length === b.length && timingSafeEqual(a, b);
}

export async function startBrowserBridge(): Promise<void> {
	if (server) return;
	const secret = randomBytes(32).toString("hex");
	const app = express();
	app.use(express.json({ limit: "2mb" }));

	app.use((req, res, next) => {
		if (!isAuthorized(secret, req)) {
			res.status(401).json({ error: "Unauthorized" });
			return;
		}
		next();
	});

	app.get("/panes", (req, res) => {
		const workspaceId =
			typeof req.query.workspaceId === "string"
				? req.query.workspaceId
				: undefined;
		res.json({ panes: browserManager.listPanes(workspaceId) });
	});

	app.post("/open", (req, res) => {
		const { workspaceId, url, target } = req.body ?? {};
		if (typeof workspaceId !== "string" || typeof url !== "string") {
			res.status(400).json({ error: "workspaceId and url are required" });
			return;
		}
		const resolvedTarget = target === "new-tab" ? "new-tab" : "current-tab";
		const requestId = randomBytes(8).toString("hex");
		const known = new Set(
			browserManager.listPanes(workspaceId).map((p) => p.paneId),
		);

		const timer = setTimeout(() => {
			browserManager.off("pane-registered", onRegistered);
			res.status(504).json({
				error:
					"No browser pane appeared for this workspace. Is the desktop app running and signed in?",
			});
		}, OPEN_PANE_TIMEOUT_MS);

		const onRegistered = (event: {
			paneId: string;
			workspaceId: string | null;
		}) => {
			if (event.workspaceId !== workspaceId) return;
			if (known.has(event.paneId)) return;
			clearTimeout(timer);
			browserManager.off("pane-registered", onRegistered);
			const info = browserManager
				.listPanes(workspaceId)
				.find((p) => p.paneId === event.paneId);
			res.json({
				paneId: event.paneId,
				url: info?.url ?? url,
				title: info?.title ?? "",
			});
		};
		browserManager.on("pane-registered", onRegistered);

		browserManager.requestOpen({
			workspaceId,
			url,
			target: resolvedTarget,
			requestId,
		} satisfies BrowserOpenRequest);
	});

	app.post("/panes/:paneId/navigate", (req, res) => {
		const url = req.body?.url;
		if (typeof url !== "string") {
			res.status(400).json({ error: "url is required" });
			return;
		}
		try {
			browserManager.navigate(req.params.paneId, url);
			res.json({ ok: true });
		} catch (err) {
			res.status(404).json({ error: errorMessage(err) });
		}
	});

	app.post("/panes/:paneId/back", (req, res) => {
		const wc = browserManager.getWebContents(req.params.paneId);
		if (!wc) {
			res.status(404).json({ error: `No live pane ${req.params.paneId}` });
			return;
		}
		if (wc.canGoBack()) wc.goBack();
		res.json({ ok: true });
	});

	app.post("/panes/:paneId/forward", (req, res) => {
		const wc = browserManager.getWebContents(req.params.paneId);
		if (!wc) {
			res.status(404).json({ error: `No live pane ${req.params.paneId}` });
			return;
		}
		if (wc.canGoForward()) wc.goForward();
		res.json({ ok: true });
	});

	app.post("/panes/:paneId/reload", (req, res) => {
		const wc = browserManager.getWebContents(req.params.paneId);
		if (!wc) {
			res.status(404).json({ error: `No live pane ${req.params.paneId}` });
			return;
		}
		if (req.body?.hard) {
			wc.reloadIgnoringCache();
		} else {
			wc.reload();
		}
		res.json({ ok: true });
	});

	app.post("/panes/:paneId/screenshot", (req, res) => {
		browserManager
			.capturePng(req.params.paneId)
			.then((base64) => res.json({ base64 }))
			.catch((err) => res.status(404).json({ error: errorMessage(err) }));
	});

	app.post("/panes/:paneId/eval", (req, res) => {
		const code = req.body?.code;
		if (typeof code !== "string") {
			res.status(400).json({ error: "code is required" });
			return;
		}
		browserManager
			.evaluateJS(req.params.paneId, code)
			.then((result) => res.json({ result: result ?? null }))
			.catch((err) => res.status(500).json({ error: errorMessage(err) }));
	});

	app.get("/panes/:paneId/console", (req, res) => {
		const wc = browserManager.getWebContents(req.params.paneId);
		if (!wc) {
			res.status(404).json({ error: `No live pane ${req.params.paneId}` });
			return;
		}
		res.json({ entries: browserManager.getConsoleLogs(req.params.paneId) });
	});

	const wss = new WebSocketServer({ noServer: true });

	const httpServer = await new Promise<Server>((resolve, reject) => {
		const s = app.listen(0, "127.0.0.1", () => resolve(s));
		s.on("error", reject);
	});

	httpServer.on("upgrade", (req, socket, head) => {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const match = CDP_PATH.exec(url.pathname);
		if (!match || !isAuthorized(secret, req)) {
			socket.destroy();
			return;
		}
		const paneId = match[1] as string;
		wss.handleUpgrade(req, socket, head, (ws) => {
			handleCdpSocket(paneId, ws);
		});
	});

	const address = httpServer.address();
	if (!address || typeof address === "string") {
		throw new Error("Browser bridge failed to bind a port");
	}
	server = httpServer;
	const endpoint = `http://127.0.0.1:${address.port}`;
	setBrowserBridgeInfo({ endpoint, secret });
	log.info(`[browser-bridge] listening on ${endpoint}`);
}

function handleCdpSocket(paneId: string, ws: WebSocket): void {
	let session: ReturnType<typeof browserManager.attachCdp>;
	try {
		session = browserManager.attachCdp(
			paneId,
			(payload) => {
				if (ws.readyState === ws.OPEN) ws.send(payload);
			},
			(reason) => {
				ws.close(1011, `debugger detached: ${reason}`.slice(0, 100));
			},
		);
	} catch (err) {
		ws.close(1011, errorMessage(err).slice(0, 100));
		return;
	}
	ws.on("message", (data) => {
		session.send(data.toString());
	});
	ws.on("close", () => {
		session.detach();
	});
	ws.on("error", () => {
		session.detach();
	});
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
