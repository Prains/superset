import type { SidebarProjectSortMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { DashboardSidebarProject } from "../../types";
import { getProjectChildrenWorkspaces } from "../projectChildren";

// Timestamps are typed as Date but can arrive as ISO strings at runtime
// (Electric collection rows, persisted caches). Sorting is cosmetic, so
// coerce instead of trusting the type — a bad value must never throw
// mid-render and take the sidebar down with it.
function toTime(value: Date | string | number | null | undefined): number {
	if (value == null) return Number.NaN;
	if (value instanceof Date) return value.getTime();
	return new Date(value).getTime();
}

// The host only bumps a project's own updatedAt on metadata patches (e.g.
// rename), so "recent activity" comes from the workspaces inside it.
export function getProjectActivityTimestamp(
	project: DashboardSidebarProject,
): number {
	const workspaces = getProjectChildrenWorkspaces(project.children);
	if (workspaces.length === 0) {
		const updatedAt = toTime(project.updatedAt);
		return Number.isNaN(updatedAt) ? toTime(project.createdAt) : updatedAt;
	}
	return Math.max(
		...workspaces.map((workspace) => toTime(workspace.updatedAt)),
	);
}

function compareStable(
	left: DashboardSidebarProject,
	right: DashboardSidebarProject,
	byTimestamp: (project: DashboardSidebarProject) => number,
): number {
	const diff = byTimestamp(right) - byTimestamp(left);
	if (!Number.isNaN(diff) && diff !== 0) return diff;
	const byName = left.name.localeCompare(right.name);
	if (byName !== 0) return byName;
	return left.id.localeCompare(right.id);
}

export function sortDashboardSidebarProjects(
	projects: DashboardSidebarProject[],
	mode: SidebarProjectSortMode,
): DashboardSidebarProject[] {
	if (mode === "manual") return projects;
	if (mode === "created") {
		return [...projects].sort((left, right) =>
			compareStable(left, right, (project) => toTime(project.createdAt)),
		);
	}
	return [...projects].sort((left, right) =>
		compareStable(left, right, getProjectActivityTimestamp),
	);
}
