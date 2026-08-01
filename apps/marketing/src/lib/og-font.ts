const INTER_BOLD_URL =
	"https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf";

let interBoldPromise: Promise<ArrayBuffer> | null = null;

/**
 * Lazy so a transient fetch failure surfaces as a handled route error for
 * that one OG-image request instead of a module-scope unhandled rejection,
 * and retries on the next request rather than poisoning the warm instance.
 */
export function getInterBold(): Promise<ArrayBuffer> {
	if (!interBoldPromise) {
		interBoldPromise = fetch(INTER_BOLD_URL).then((res) => {
			if (!res.ok) {
				throw new Error(`Font fetch failed: ${res.status}`);
			}
			return res.arrayBuffer();
		});
		interBoldPromise.catch(() => {
			interBoldPromise = null;
		});
	}
	return interBoldPromise;
}
