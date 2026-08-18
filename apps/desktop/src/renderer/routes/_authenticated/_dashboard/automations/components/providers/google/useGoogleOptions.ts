import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ProviderOptions } from "../types";

/**
 * The pickable values the Google sentences need: the connected account's
 * calendars and mail labels, and the org's linked Google addresses for the
 * attendee filter. Empty until an account is connected.
 */
export function useGoogleOptions(organizationId: string): ProviderOptions {
	const enabled = Boolean(organizationId);
	const calendars = cloudTrpc.integration.google.listCalendars.useQuery(
		{ organizationId },
		{ enabled },
	);
	const labels = cloudTrpc.integration.google.listLabels.useQuery(
		{ organizationId },
		{ enabled },
	);
	const people = cloudTrpc.integration.google.listLinkedPeople.useQuery(
		{ organizationId },
		{ enabled },
	);

	return useMemo(
		() => ({
			google: {
				calendars: calendars.data ?? [],
				gmailLabels: labels.data ?? [],
				people: people.data ?? [],
			},
		}),
		[calendars.data, labels.data, people.data],
	);
}
