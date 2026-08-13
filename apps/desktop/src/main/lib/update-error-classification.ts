const ENVIRONMENT_ERRNO_CODES = [
	"ENOENT",
	"EACCES",
	"EPERM",
	"EBUSY",
	"ENOSPC",
];
const UPDATER_PATH_MARKERS = ["-updater", "shipit"];

// Staging an update downloads a ~600MB archive into the user's cache directory
// and unpacks it alongside itself, so a volume with less than this free cannot
// hold one however we behave.
export const UPDATE_STAGING_MIN_FREE_BYTES = 1024 * 1024 * 1024;

// Update failures owned by the user's machine, not by us. A full volume is the
// common one, and neither staging tool gives us a code to match: `ditto` prints
// an errno-free line and Squirrel forwards NSError text localised to the user's
// language, so ask the filesystem how much room is left rather than reading the
// words. The rest — a corrupt or half-removed updater cache, an app bundle that
// can't be written, stalled requests — arrive as plain messages without errno
// properties, so those still match on the text.
export function isEnvironmentUpdateError(
	message: string,
	freeStagingBytes: number | null,
): boolean {
	if (
		freeStagingBytes !== null &&
		freeStagingBytes < UPDATE_STAGING_MIN_FREE_BYTES
	) {
		return true;
	}
	const lowerMessage = message.toLowerCase();
	if (
		lowerMessage.includes("read-only volume") ||
		lowerMessage.includes("the request timed out")
	) {
		return true;
	}
	return (
		ENVIRONMENT_ERRNO_CODES.some((code) => message.includes(`${code}:`)) &&
		UPDATER_PATH_MARKERS.some((marker) => lowerMessage.includes(marker))
	);
}
