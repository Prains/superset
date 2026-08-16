import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface LogFile {
	path: string;
	mtimeMs: number;
}

/**
 * Recursively collects `.jsonl` files under `root` modified within
 * `maxAgeDays`. The mtime cutoff keeps the scan bounded on heavy users —
 * transcript dirs grow to multiple GB, but old files never change.
 */
export async function collectLogFiles(
	root: string,
	maxAgeDays: number,
): Promise<LogFile[]> {
	const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
	const results: LogFile[] = [];

	async function walk(dir: string): Promise<void> {
		let entries: string[];
		try {
			entries = await readdir(dir);
		} catch {
			return;
		}
		for (const name of entries) {
			const path = join(dir, name);
			let info: Awaited<ReturnType<typeof stat>>;
			try {
				info = await stat(path);
			} catch {
				continue;
			}
			if (info.isDirectory()) {
				await walk(path);
			} else if (name.endsWith(".jsonl") && info.mtimeMs >= cutoffMs) {
				results.push({ path, mtimeMs: info.mtimeMs });
			}
		}
	}

	await walk(root);
	return results;
}
