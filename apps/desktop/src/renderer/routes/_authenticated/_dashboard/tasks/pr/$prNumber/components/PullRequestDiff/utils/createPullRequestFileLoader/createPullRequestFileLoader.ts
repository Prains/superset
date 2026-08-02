import type {
	FileDiffContentsLoader,
	FileDiffLoadedFiles,
	FileDiffMetadata,
} from "@pierre/diffs";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface CreatePullRequestFileLoaderOptions {
	hostUrl: string;
	projectId: string;
	prNumber: number;
}

// Diffs calls this when the user expands unchanged context: the patch only
// carries hunks, so full old/new contents are fetched on demand and cached
// per file for the lifetime of the viewer.
export function createPullRequestFileLoader({
	hostUrl,
	projectId,
	prNumber,
}: CreatePullRequestFileLoaderOptions): FileDiffContentsLoader {
	const loadedFilesCache = new Map<string, Promise<FileDiffLoadedFiles>>();

	return (fileDiff) => {
		switch (fileDiff.type) {
			case "new":
			case "deleted":
				return Promise.reject(
					new Error(`Cannot hydrate ${fileDiff.type} diffs.`),
				);
			case "change":
			case "rename-changed":
			case "rename-pure": {
				const cacheKey = getFileDiffCacheKey(fileDiff);
				const cached = loadedFilesCache.get(cacheKey);
				if (cached != null) {
					return cached;
				}

				const promise = loadFiles(
					hostUrl,
					projectId,
					prNumber,
					fileDiff.type,
					fileDiff.name,
					fileDiff.prevName,
				).catch((error: unknown) => {
					loadedFilesCache.delete(cacheKey);
					throw error;
				});
				loadedFilesCache.set(cacheKey, promise);
				return promise;
			}
		}
	};
}

function getFileDiffCacheKey(fileDiff: FileDiffMetadata): string {
	return [
		fileDiff.cacheKey ?? "",
		fileDiff.prevObjectId ?? "",
		fileDiff.newObjectId ?? "",
		fileDiff.type,
		fileDiff.prevName ?? "",
		fileDiff.name,
	].join("\0");
}

async function loadFiles(
	hostUrl: string,
	projectId: string,
	prNumber: number,
	type: "change" | "rename-changed" | "rename-pure",
	name: string,
	prevName: string | undefined,
): Promise<FileDiffLoadedFiles> {
	const client = getHostServiceClientByUrl(hostUrl);
	const result = await client.pullRequests.getDiffFiles.query({
		projectId,
		prNumber,
		type,
		name,
		prevName,
	});

	if (type === "rename-pure") {
		if (result.newFile == null) {
			throw new Error(`No file contents returned for ${name}.`);
		}
		return { oldFile: null, newFile: result.newFile };
	}
	if (result.oldFile == null || result.newFile == null) {
		throw new Error(`Incomplete file contents returned for ${name}.`);
	}
	return { oldFile: result.oldFile, newFile: result.newFile };
}
