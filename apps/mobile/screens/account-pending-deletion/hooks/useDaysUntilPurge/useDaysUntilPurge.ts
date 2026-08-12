import { ACCOUNT_DELETION_GRACE_DAYS } from "@superset/shared/constants";

const DAY_MS = 24 * 60 * 60 * 1000;

export function useDaysUntilPurge(deletedAt: Date | null): number | null {
	if (!deletedAt) return null;
	const purgeAt = deletedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS;
	return Math.max(0, Math.ceil((purgeAt - Date.now()) / DAY_MS));
}
