import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { boolean, CLIError } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { loadLocalManifest } from "../lib";

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd });
	return stdout.trim();
}

async function gh(args: string[], cwd: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync("gh", args, { cwd });
		return stdout.trim();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("ENOENT")) {
			throw new CLIError(
				"GitHub CLI (gh) is required to publish. Install it and run `gh auth login`.",
			);
		}
		throw new CLIError(`gh failed: ${message.slice(0, 300)}`);
	}
}

export default command({
	description:
		"Publish this plugin to the marketplace: push to GitHub and tag the superset-plugin topic",
	skipMiddleware: true,
	options: {
		private: boolean().desc(
			"Create the repository as private (it won't appear in the public marketplace)",
		),
	},
	run: async ({ options }) => {
		const cwd = process.cwd();
		// Validates the manifest before anything is pushed.
		const { manifest } = await loadLocalManifest(cwd);

		const isRepo = await git(["rev-parse", "--is-inside-work-tree"], cwd)
			.then(() => true)
			.catch(() => false);
		if (!isRepo) {
			await git(["init"], cwd);
			await git(["add", "-A"], cwd);
			await git(["commit", "-m", `${manifest.id} v${manifest.version}`], cwd);
		} else {
			const dirty = await git(["status", "--porcelain"], cwd);
			if (dirty) {
				await git(["add", "-A"], cwd);
				await git(["commit", "-m", `${manifest.id} v${manifest.version}`], cwd);
			}
		}

		const hasOrigin = await git(["remote", "get-url", "origin"], cwd)
			.then(() => true)
			.catch(() => false);
		if (!hasOrigin) {
			const repoName = manifest.id.split(".").slice(1).join(".") || manifest.id;
			await gh(
				[
					"repo",
					"create",
					repoName,
					options.private ? "--private" : "--public",
					"--source",
					".",
					"--push",
				],
				cwd,
			);
		} else {
			const branch = await git(["branch", "--show-current"], cwd);
			await git(["push", "-u", "origin", branch], cwd);
		}

		await gh(["repo", "edit", "--add-topic", "superset-plugin"], cwd);
		const url = await gh(
			["repo", "view", "--json", "url", "--jq", ".url"],
			cwd,
		);
		return {
			data: {
				id: manifest.id,
				url,
				marketplace: options.private
					? "private repos are not listed in the marketplace"
					: "listed in the marketplace (Plugins → Browse) within minutes",
			},
		};
	},
});
