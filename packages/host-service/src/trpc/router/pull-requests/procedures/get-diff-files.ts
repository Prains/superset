import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { execGh } from "../../workspace-creation/utils/exec-gh";

const getDiffFilesInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	type: z.enum(["change", "rename-changed", "rename-pure"]),
	name: z.string(),
	prevName: z.string().optional(),
});

interface PullRequestDiffFile {
	name: string;
	contents: string;
	cacheKey: string;
}

interface PullRequestDiffRefs {
	oldRepo: string;
	oldRef: string;
	newRepo: string;
	newRef: string;
}

const ghPullRefsSchema = z.object({
	baseSha: z.string(),
	headSha: z.string(),
	baseRepo: z.string().nullable(),
	headRepo: z.string().nullable(),
});

const REFS_CACHE_TTL_MS = 5 * 60_000;
const FILE_TIMEOUT_MS = 30_000;
const FILE_MAX_BUFFER_BYTES = 50 * 1024 * 1024;

const refsCache = new Map<
	string,
	{ promise: Promise<PullRequestDiffRefs>; expiresAt: number }
>();

// The PR's visible diff is head vs merge-base (GitHub's three-dot compare),
// so hydrating the old side must read the merge-base commit, not the live
// base branch tip.
async function resolvePullRequestDiffRefs(
	repoSlug: string,
	prNumber: number,
): Promise<PullRequestDiffRefs> {
	const cacheKey = `${repoSlug.toLowerCase()}#${prNumber}`;
	const cached = refsCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.promise;
	}

	const promise = (async (): Promise<PullRequestDiffRefs> => {
		const rawRefs = await execGh([
			"api",
			`repos/${repoSlug}/pulls/${prNumber}`,
			"--jq",
			"{baseSha: .base.sha, headSha: .head.sha, baseRepo: .base.repo.full_name, headRepo: .head.repo.full_name}",
		]);
		const refs = ghPullRefsSchema.parse(rawRefs);
		const baseRepo = refs.baseRepo ?? repoSlug;
		const headRepo = refs.headRepo ?? repoSlug;
		const compareRange =
			baseRepo.toLowerCase() === headRepo.toLowerCase()
				? `${refs.baseSha}...${refs.headSha}`
				: `${baseRepo.split("/")[0]}:${refs.baseSha}...${headRepo.split("/")[0]}:${refs.headSha}`;
		const mergeBaseSha = await execGh([
			"api",
			`repos/${baseRepo}/compare/${compareRange}`,
			"--jq",
			".merge_base_commit.sha",
		]);
		if (typeof mergeBaseSha !== "string" || mergeBaseSha.length === 0) {
			throw new Error(`No merge base for ${repoSlug}#${prNumber}`);
		}
		return {
			oldRepo: baseRepo,
			oldRef: mergeBaseSha,
			newRepo: headRepo,
			newRef: refs.headSha,
		};
	})();
	promise.catch(() => {
		if (refsCache.get(cacheKey)?.promise === promise) {
			refsCache.delete(cacheKey);
		}
	});
	refsCache.set(cacheKey, {
		promise,
		expiresAt: Date.now() + REFS_CACHE_TTL_MS,
	});
	return promise;
}

async function fetchFileAtRef(
	repoSlug: string,
	ref: string,
	path: string,
): Promise<PullRequestDiffFile> {
	const encodedPath = path
		.replace(/^\/+/, "")
		.split("/")
		.map(encodeURIComponent)
		.join("/");
	const contents = await execGh(
		[
			"api",
			`repos/${repoSlug}/contents/${encodedPath}?ref=${ref}`,
			"-H",
			"Accept: application/vnd.github.raw",
		],
		{ timeout: FILE_TIMEOUT_MS, maxBuffer: FILE_MAX_BUFFER_BYTES, raw: true },
	);
	if (typeof contents !== "string") {
		throw new Error(`Unexpected contents for ${path}@${ref}`);
	}
	return { name: path, contents, cacheKey: `${repoSlug}@${ref}:${path}` };
}

export const getDiffFiles = protectedProcedure
	.input(getDiffFilesInputSchema)
	.query(async ({ ctx, input }) => {
		const repo = await resolveGithubRepo(ctx, input.projectId);
		const repoSlug = `${repo.owner}/${repo.name}`;
		try {
			const refs = await resolvePullRequestDiffRefs(repoSlug, input.prNumber);
			if (input.type === "rename-pure") {
				const newFile = await fetchFileAtRef(
					refs.newRepo,
					refs.newRef,
					input.name,
				);
				return { oldFile: null, newFile };
			}
			const [oldFile, newFile] = await Promise.all([
				fetchFileAtRef(refs.oldRepo, refs.oldRef, input.prevName ?? input.name),
				fetchFileAtRef(refs.newRepo, refs.newRef, input.name),
			]);
			return { oldFile, newFile };
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to load PR #${input.prNumber} file ${input.name}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	});
