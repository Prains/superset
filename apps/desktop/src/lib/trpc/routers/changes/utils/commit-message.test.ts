import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSimpleGitWithShellPath } from "../../workspaces/utils/git-client";
import { executeGitTask } from "../workers/git-task-handlers";
import {
	isValidCommitHash,
	readCommitMessage,
	splitCommitMessage,
} from "./commit-message";

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-commit-message-${process.pid}`,
);

const SUBJECT = "feat(changes): add commit message popover";
const BODY = [
	"The commit list only ever rendered the subject line, so a description",
	"like this one was invisible from inside the app.",
	"",
	"Refs: #6043",
].join("\n");
const FULL_MESSAGE = `${SUBJECT}\n\n${BODY}`;

function run(repoPath: string, args: string[]): string {
	return execFileSync("git", args, { cwd: repoPath, encoding: "utf8" });
}

function createRepoWithDescriptiveCommit(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	run(repoPath, ["init", "-q", "-b", "main"]);
	run(repoPath, ["config", "user.email", "test@test.com"]);
	run(repoPath, ["config", "user.name", "Test"]);
	run(repoPath, ["commit", "-q", "--allow-empty", "-m", "base"]);
	const baseHash = run(repoPath, ["rev-parse", "HEAD"]).trim();
	run(repoPath, ["update-ref", "refs/remotes/origin/main", baseHash]);
	run(repoPath, ["checkout", "-q", "-b", "feature"]);
	run(repoPath, ["commit", "-q", "--allow-empty", "-m", FULL_MESSAGE]);
	return repoPath;
}

beforeAll(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("commit list message (issue #6043)", () => {
	test("the Diffs tab commit list only carries the subject line", async () => {
		const repoPath = createRepoWithDescriptiveCommit("subject-only");

		const status = await executeGitTask("getStatus", {
			worktreePath: repoPath,
			defaultBranch: "main",
			persistedWorktree: null,
		});

		const commit = status.commits[0];
		expect(commit.message).toBe(SUBJECT);
		// The body never reaches the renderer, so no amount of UI work on the
		// existing payload can show the full message.
		expect(commit.message).not.toContain("Refs: #6043");
	});

	test("readCommitMessage recovers the subject and body for that commit", async () => {
		const repoPath = createRepoWithDescriptiveCommit("full-message");

		const status = await executeGitTask("getStatus", {
			worktreePath: repoPath,
			defaultBranch: "main",
			persistedWorktree: null,
		});
		const commit = status.commits[0];

		const git = await getSimpleGitWithShellPath(repoPath);
		const message = await readCommitMessage(git, commit.hash);

		expect(message.subject).toBe(SUBJECT);
		expect(message.body).toBe(BODY);
		expect(`${message.subject}\n\n${message.body}`).toBe(FULL_MESSAGE);
	});

	test("readCommitMessage works from the short hash the list renders", async () => {
		const repoPath = createRepoWithDescriptiveCommit("short-hash");

		const status = await executeGitTask("getStatus", {
			worktreePath: repoPath,
			defaultBranch: "main",
			persistedWorktree: null,
		});
		const commit = status.commits[0];

		const git = await getSimpleGitWithShellPath(repoPath);
		const message = await readCommitMessage(git, commit.shortHash);

		expect(message.body).toBe(BODY);
	});

	test("readCommitMessage rejects a ref that is not a hex object name", async () => {
		const repoPath = createRepoWithDescriptiveCommit("bad-ref");
		const git = await getSimpleGitWithShellPath(repoPath);

		await expect(readCommitMessage(git, "--output=/tmp/pwned")).rejects.toThrow(
			"Invalid commit hash",
		);
		await expect(readCommitMessage(git, "HEAD; rm -rf /")).rejects.toThrow(
			"Invalid commit hash",
		);
	});
});

describe("splitCommitMessage", () => {
	test("returns an empty body for a subject-only commit", () => {
		expect(splitCommitMessage("fix: typo\n")).toEqual({
			subject: "fix: typo",
			body: "",
		});
	});

	test("keeps blank lines and indentation inside the body", () => {
		const raw = "feat: thing\n\nWhy:\n\n  - one\n  - two\n\n";

		expect(splitCommitMessage(raw)).toEqual({
			subject: "feat: thing",
			body: "Why:\n\n  - one\n  - two",
		});
	});

	test("folds a wrapped subject onto one line, like git's %s", () => {
		const raw = "feat: a subject that\nwrapped onto two lines\n\nBody here.\n";

		expect(splitCommitMessage(raw)).toEqual({
			subject: "feat: a subject that wrapped onto two lines",
			body: "Body here.",
		});
	});

	test("normalizes CRLF line endings", () => {
		expect(splitCommitMessage("fix: thing\r\n\r\nDetails.\r\n")).toEqual({
			subject: "fix: thing",
			body: "Details.",
		});
	});

	test("handles an empty message", () => {
		expect(splitCommitMessage("")).toEqual({ subject: "", body: "" });
	});
});

describe("isValidCommitHash", () => {
	test("accepts short and full hex object names", () => {
		expect(isValidCommitHash("abc1")).toBe(true);
		expect(isValidCommitHash("a".repeat(40))).toBe(true);
		expect(isValidCommitHash("A1B2C3D4")).toBe(true);
	});

	test("rejects flags, revision expressions and pathspecs", () => {
		expect(isValidCommitHash("-n1")).toBe(false);
		expect(isValidCommitHash("HEAD~1")).toBe(false);
		expect(isValidCommitHash("main")).toBe(false);
		expect(isValidCommitHash("abc")).toBe(false);
		expect(isValidCommitHash("")).toBe(false);
	});
});
