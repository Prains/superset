import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Which project sections are shut, keyed `machineId:projectId` — collapse is
 * per host because the same project can hold different work on each machine.
 * Absent means expanded: a project you've never touched shows its workspaces
 * rather than hiding them behind a caret.
 */
interface CollapsedProjectsStore {
	collapsed: Record<string, true>;
	toggleProject: (machineId: string, projectId: string) => void;
	setAllCollapsed: (
		machineId: string,
		projectIds: string[],
		collapsed: boolean,
	) => void;
}

export function collapsedProjectKey(machineId: string, projectId: string) {
	return `${machineId}:${projectId}`;
}

export const useCollapsedProjectsStore = create<CollapsedProjectsStore>()(
	persist(
		(set) => ({
			collapsed: {},
			toggleProject: (machineId, projectId) => {
				set((state) => {
					const key = collapsedProjectKey(machineId, projectId);
					if (state.collapsed[key]) {
						const { [key]: _removed, ...collapsed } = state.collapsed;
						return { collapsed };
					}
					return { collapsed: { ...state.collapsed, [key]: true as const } };
				});
			},
			setAllCollapsed: (machineId, projectIds, collapsed) => {
				set((state) => {
					const next = { ...state.collapsed };
					for (const projectId of projectIds) {
						const key = collapsedProjectKey(machineId, projectId);
						if (collapsed) next[key] = true;
						else delete next[key];
					}
					return { collapsed: next };
				});
			},
		}),
		{
			name: "collapsed-projects-v1",
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
);
