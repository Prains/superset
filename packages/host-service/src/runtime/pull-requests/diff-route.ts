import { spawn } from "node:child_process";
import type { Hono } from "hono";
import { stream } from "hono/streaming";
import type { HostDb } from "../../db";
import type { HostAuthProvider } from "../../providers/host-auth";
import { getStrictShellEnvironment } from "../../terminal/clean-shell-env";
import { resolveGithubRepo } from "../../trpc/router/workspace-creation/shared/project-helpers";

const PR_DIFF_TIMEOUT_MS = 120_000;
const STDERR_CAPTURE_LIMIT = 4096;

interface RegisterPullRequestDiffRouteOptions {
	app: Hono;
	db: HostDb;
	hostAuth: HostAuthProvider;
}

/**
 * Streams `gh pr diff` stdout straight to the client so the renderer can
 * parse and paint files as the patch downloads instead of waiting for the
 * full response.
 */
export function registerPullRequestDiffRoute({
	app,
	db,
	hostAuth,
}: RegisterPullRequestDiffRouteOptions) {
	app.get("/pull-requests/diff", async (c) => {
		if (!(await hostAuth.validate(c.req.raw))) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const projectId = c.req.query("projectId");
		const prNumber = Number.parseInt(c.req.query("prNumber") ?? "", 10);
		if (!projectId || !Number.isInteger(prNumber) || prNumber <= 0) {
			return c.json({ error: "projectId and prNumber are required" }, 400);
		}

		let repoSlug: string;
		try {
			const repo = await resolveGithubRepo({ db }, projectId);
			repoSlug = `${repo.owner}/${repo.name}`;
		} catch (err) {
			return c.json(
				{ error: err instanceof Error ? err.message : String(err) },
				400,
			);
		}

		const env = await getStrictShellEnvironment().catch(
			() => process.env as Record<string, string>,
		);
		const child = spawn(
			"gh",
			["pr", "diff", String(prNumber), "--repo", repoSlug],
			{ env, timeout: PR_DIFF_TIMEOUT_MS, killSignal: "SIGTERM" },
		);

		let stderr = "";
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			if (stderr.length < STDERR_CAPTURE_LIMIT) stderr += chunk;
		});
		const exited = new Promise<number | null>((resolve) => {
			child.on("close", resolve);
			child.on("error", () => resolve(null));
		});

		// Hold the response until the first stdout chunk (or exit) so early
		// gh failures still produce a real error status instead of a
		// truncated 200 stream.
		const stdout = child.stdout[Symbol.asyncIterator]();
		let first: IteratorResult<Buffer>;
		try {
			first = await stdout.next();
		} catch {
			first = { done: true, value: undefined };
		}
		if (first.done) {
			const code = await exited;
			if (code !== 0) {
				return c.json(
					{ error: stderr.trim() || `gh pr diff exited with code ${code}` },
					502,
				);
			}
			return c.body("", 200, { "Content-Type": "text/plain; charset=utf-8" });
		}

		c.header("Content-Type", "text/plain; charset=utf-8");
		c.header("Cache-Control", "no-store");
		return stream(c, async (s) => {
			s.onAbort(() => {
				child.kill("SIGTERM");
			});
			await s.write(first.value);
			for (
				let next = await stdout.next();
				!next.done;
				next = await stdout.next()
			) {
				await s.write(next.value);
			}
		});
	});
}
