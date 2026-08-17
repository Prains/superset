/**
 * Mints a git credential for a sandbox, on demand, for one operation.
 *
 * A sandbox holds no durable git credential. When git inside it needs one,
 * host-service asks here, proving which sandbox it is with the secret it was
 * handed at provision. The answer is minted fresh, scoped to the workspace's
 * repo, and short-lived — the same shape Coder uses (`GIT_ASKPASS` → agent →
 * control plane), which is the production design for exactly this.
 *
 * Whose identity: the workspace's creating user. If they have granted GitHub
 * `repo` access, the credential is their OAuth token and the commit lands as
 * them — that is what people actually want from a workspace. Otherwise the
 * GitHub App's installation token, so push works from day one, at the cost of
 * appearing as the App. Multi-user in one sandbox uses the owner's credential;
 * that is a documented posture, not an accident.
 *
 * Push scope: a credential is refused for any branch other than the
 * workspace's own. The recurring incident across every product in this space
 * is not token theft but a prompt-injected agent pushing somewhere it
 * shouldn't, and the token's permissions can't stop that — only refusing to
 * mint for the wrong target can.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db, dbWs } from "@superset/db/client";
import {
	accounts,
	cloudWorkspaces,
	githubInstallations,
	githubRepositories,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { installationOctokit } from "../../lib/blaxel/clone-token";
import { repoForProject } from "../../lib/blaxel/repo-for-project";

/** How long a minted credential is good for; git caches it exactly this long. */
export const GIT_CREDENTIAL_TTL_S = 50 * 60;

export function generateSandboxSecret(): string {
	return randomBytes(32).toString("hex");
}

export function hashSandboxSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("hex");
}

function secretMatches(secret: string, storedHash: string): boolean {
	const a = Buffer.from(hashSandboxSecret(secret));
	const b = Buffer.from(storedHash);
	return a.length === b.length && timingSafeEqual(a, b);
}

export interface GitCredential {
	username: string;
	password: string;
	/** Unix seconds; emitted to git as `password_expiry_utc` so it caches correctly. */
	expiresAt: number;
	/** Which identity the credential carries — surfaced, never silent. */
	identity: { kind: "user"; login: string } | { kind: "app" };
}

async function userGithubToken(
	userId: string,
): Promise<{ token: string; login: string } | null> {
	const account = await db.query.accounts.findFirst({
		where: and(eq(accounts.userId, userId), eq(accounts.providerId, "github")),
	});
	if (!account?.accessToken) return null;
	// GitHub returns scopes space- or comma-separated depending on the flow.
	const scopes = (account.scope ?? "").split(/[\s,]+/);
	if (!scopes.includes("repo")) return null;
	return { token: account.accessToken, login: account.accountId };
}

async function appInstallationToken(projectId: string): Promise<string | null> {
	const repo = await repoForProject(projectId);
	if (!repo) return null;
	const row = await db.query.githubRepositories.findFirst({
		where: and(
			eq(githubRepositories.owner, repo.owner),
			eq(githubRepositories.name, repo.name),
		),
	});
	if (!row) return null;
	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.id, row.installationId),
	});
	if (!installation) return null;
	const octokit = await installationOctokit(installation.installationId);
	const { token } = (await octokit.auth({ type: "installation" })) as {
		token: string;
	};
	return token;
}

/**
 * The push-scope rule, on its own so it can be reasoned about without a
 * database. Returns the refusal message, or null to allow.
 */
export function pushRefusal(args: {
	target: string;
	workspaceBranch: string;
	defaultBranch: string | undefined;
}): string | null {
	const { target, workspaceBranch, defaultBranch } = args;
	if (!defaultBranch) return null;
	if (target === defaultBranch && workspaceBranch !== defaultBranch) {
		return `This workspace was created on ${workspaceBranch} and may not push to ${defaultBranch}`;
	}
	return null;
}

export async function mintGitCredential(input: {
	workspaceId: string;
	sandboxSecret: string;
	host: string;
	/** The branch git is about to push to, when known. */
	branch?: string;
}): Promise<GitCredential> {
	if (input.host !== "github.com") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `No credential for ${input.host}`,
		});
	}

	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, input.workspaceId),
	});
	if (
		!row?.sandboxSecretHash ||
		!secretMatches(input.sandboxSecret, row.sandboxSecretHash)
	) {
		// Same answer for "no such workspace" and "wrong secret": a caller that
		// can distinguish them can enumerate workspaces.
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
	}
	if (row.status !== "ready") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `Cloud workspace is ${row.status}`,
		});
	}
	// Push scope. The threat is a prompt-injected agent pushing somewhere it
	// shouldn't — and the somewhere that matters is the default branch. So: a
	// workspace may push to any branch *except* the repo's default, unless the
	// default is the branch it was created on and is therefore its own. That
	// leaves the normal flow untouched (agent on main cuts feat/x, pushes it)
	// and closes the one that hurts (agent on feat/x force-pushes main).
	// Branch protection on the repo is the second wall behind this one.
	if (input.branch) {
		const repo = await repoForProject(row.projectId);
		const refusal = pushRefusal({
			target: input.branch,
			workspaceBranch: row.branch,
			defaultBranch: repo?.defaultBranch,
		});
		if (refusal) throw new TRPCError({ code: "FORBIDDEN", message: refusal });
	}

	const expiresAt = Math.floor(Date.now() / 1000) + GIT_CREDENTIAL_TTL_S;

	if (row.createdByUserId) {
		const user = await userGithubToken(row.createdByUserId);
		if (user) {
			return {
				username: "x-access-token",
				password: user.token,
				expiresAt,
				identity: { kind: "user", login: user.login },
			};
		}
	}

	const app = await appInstallationToken(row.projectId);
	if (!app) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "No GitHub credential available for this workspace",
		});
	}
	return {
		username: "x-access-token",
		password: app,
		expiresAt,
		identity: { kind: "app" },
	};
}

/** Rotates the secret a sandbox proves itself with; returned once, stored hashed. */
export async function issueSandboxSecret(workspaceId: string): Promise<string> {
	const secret = generateSandboxSecret();
	await dbWs
		.update(cloudWorkspaces)
		.set({ sandboxSecretHash: hashSandboxSecret(secret) })
		.where(eq(cloudWorkspaces.id, workspaceId));
	return secret;
}
