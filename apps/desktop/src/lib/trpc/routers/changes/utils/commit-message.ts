import type { SimpleGit } from "simple-git";

/** A commit's full message, split the way `git log` formats `%s` and `%b`. */
export interface CommitMessage {
	subject: string;
	body: string;
}

// Hex object names only: keeps the value from ever being read as a flag or a
// revision expression when it reaches `git log`.
const COMMIT_HASH_PATTERN = /^[0-9a-f]{4,64}$/i;

export function isValidCommitHash(hash: string): boolean {
	return COMMIT_HASH_PATTERN.test(hash);
}

/**
 * Split a raw commit message (`git log --format=%B`) into subject and body.
 *
 * The subject is everything before the first blank line, folded onto one line
 * like git's own `%s`, so it matches what the commit list already renders.
 */
export function splitCommitMessage(raw: string): CommitMessage {
	const lines = raw.replace(/\r\n/g, "\n").split("\n");

	let firstBlank = 0;
	while (firstBlank < lines.length && lines[firstBlank].trim() !== "") {
		firstBlank++;
	}

	const subject = lines
		.slice(0, firstBlank)
		.map((line) => line.trim())
		.join(" ")
		.trim();
	const body = lines.slice(firstBlank).join("\n").replace(/^\n+/, "").trimEnd();

	return { subject, body };
}

export async function readCommitMessage(
	git: SimpleGit,
	commitHash: string,
): Promise<CommitMessage> {
	if (!isValidCommitHash(commitHash)) {
		throw new Error("Invalid commit hash");
	}

	const raw = await git.raw(["log", "-1", "--format=%B", commitHash, "--"]);
	return splitCommitMessage(raw);
}
