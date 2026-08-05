import * as Sentry from "@sentry/electron/main";
import { IPCMode } from "@sentry/electron/main";
import { app, session } from "electron";
import { env } from "../env.main";

let sentryInitialized = false;

let lastProcessExit: Record<string, unknown> | null = null;

export function initSentry(): void {
	if (sentryInitialized) return;

	if (!env.SENTRY_DSN_DESKTOP || env.NODE_ENV !== "production") {
		return;
	}

	try {
		// Registered before Sentry.init so these listeners run ahead of the
		// SDK's own process-gone listeners: by the time childProcessIntegration
		// captures its message-only event, the processor below already has the
		// details to attach.
		app.on("render-process-gone", (_event, _contents, details) => {
			lastProcessExit = {
				process: "renderer",
				reason: details.reason,
				exit_code: details.exitCode,
				occurred_at: new Date().toISOString(),
			};
		});
		app.on("child-process-gone", (_event, details) => {
			lastProcessExit = {
				process: details.type,
				reason: details.reason,
				exit_code: details.exitCode,
				name: details.name,
				service_name: details.serviceName,
				occurred_at: new Date().toISOString(),
			};
		});

		Sentry.init({
			dsn: env.SENTRY_DSN_DESKTOP,
			environment: env.NODE_ENV,
			tracesSampleRate: 0,
			sendDefaultPii: false,
			ipcMode: IPCMode.Classic,
			// Lifts non-standard props off thrown errors (e.g. the host-service
			// coordinator's exit diagnostics) into event extras.
			integrations: [Sentry.extraErrorDataIntegration()],
			getSessions: () => [
				session.defaultSession,
				session.fromPartition("persist:superset"),
			],
		});

		Sentry.addEventProcessor((event) => {
			if (lastProcessExit && event.message?.includes(" process exited with ")) {
				event.contexts = {
					...event.contexts,
					"process-exit": lastProcessExit,
					...gpuFeatureStatusContext(),
				};
			}
			return event;
		});

		sentryInitialized = true;
		console.log("[sentry] Initialized in main process");
	} catch (error) {
		console.error("[sentry] Failed to initialize in main:", error);
	}
}

function gpuFeatureStatusContext(): Record<string, Record<string, unknown>> {
	try {
		return { "gpu-feature-status": { ...app.getGPUFeatureStatus() } };
	} catch {
		return {};
	}
}
