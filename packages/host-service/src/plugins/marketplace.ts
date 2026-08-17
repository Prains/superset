import { parsePluginManifest } from "@superset/plugin-sdk/manifest";

export interface MarketplaceEntry {
	repo: string;
	url: string;
	description: string | null;
	stars: number;
	owner: string;
	updatedAt: string;
	/** Parsed superset-plugin.json when the repo has a valid one at its root. */
	manifest: {
		id: string;
		name: string;
		description?: string;
		icon?: string;
		permissions?: string[];
	} | null;
}

interface CacheEntry {
	at: number;
	results: MarketplaceEntry[];
}

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, CacheEntry>();

/**
 * Marketplace = the `superset-plugin` GitHub topic, herdr's zero-gatekeeping
 * move — but the index parses manifests so capability and identity are
 * visible pre-install. Discovery never executes code: this only reads the
 * search API and raw manifest files. Unauthenticated GitHub search allows
 * ~10 req/min, hence the cache.
 */
export async function searchMarketplace(
	query: string,
): Promise<MarketplaceEntry[]> {
	const key = query.trim().toLowerCase();
	const cached = cache.get(key);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results;

	const q = encodeURIComponent(
		`topic:superset-plugin is:public${key ? ` ${key}` : ""}`,
	);
	const searchResponse = await fetch(
		`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=20`,
		{ headers: { accept: "application/vnd.github+json" } },
	);
	if (!searchResponse.ok) {
		throw new Error(`GitHub search failed: ${searchResponse.status}`);
	}
	const data = (await searchResponse.json()) as {
		items?: Array<{
			full_name: string;
			html_url: string;
			description: string | null;
			stargazers_count: number;
			owner: { login: string };
			default_branch: string;
			updated_at: string;
		}>;
	};

	const results = await Promise.all(
		(data.items ?? []).map(async (item): Promise<MarketplaceEntry> => {
			let manifest: MarketplaceEntry["manifest"] = null;
			try {
				const raw = await fetch(
					`https://raw.githubusercontent.com/${item.full_name}/${item.default_branch}/superset-plugin.json`,
					{ signal: AbortSignal.timeout(5_000) },
				);
				if (raw.ok) {
					const parsed = parsePluginManifest(await raw.json());
					manifest = {
						id: parsed.manifest.id,
						name: parsed.manifest.name,
						description: parsed.manifest.description,
						icon: parsed.manifest.icon,
						permissions: parsed.manifest.permissions,
					};
				}
			} catch {
				// Repo tagged the topic without a valid manifest — listed, but
				// visibly manifest-less so the UI can de-rank it.
			}
			return {
				repo: item.full_name,
				url: item.html_url,
				description: item.description,
				stars: item.stargazers_count,
				owner: item.owner.login,
				updatedAt: item.updated_at,
				manifest,
			};
		}),
	);
	// Manifest-bearing repos first (fixes herdr's topic-pollution problem).
	results.sort(
		(a, b) => Number(Boolean(b.manifest)) - Number(Boolean(a.manifest)),
	);
	cache.set(key, { at: Date.now(), results });
	return results;
}
