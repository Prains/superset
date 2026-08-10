import type { RouterOutputs } from "@superset/trpc";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/trpc/client";

export type ActivePlan = RouterOutputs["billing"]["activePlan"];

/** The active organization's plan; `plan` is "free" when nothing is subscribed. */
export function useActivePlan(): ActivePlan | undefined {
	const query = useQuery({
		queryKey: ["cloud", "billing", "activePlan"],
		queryFn: () => apiClient.billing.activePlan.query(),
		staleTime: 30_000,
	});

	return query.data;
}
