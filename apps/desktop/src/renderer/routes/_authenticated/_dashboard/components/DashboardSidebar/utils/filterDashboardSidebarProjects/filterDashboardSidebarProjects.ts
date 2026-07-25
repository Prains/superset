import type {
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
} from "../../types";

function matches(text: string, normalizedQuery: string): boolean {
	return text.toLowerCase().includes(normalizedQuery);
}

function filterChildren(
	children: DashboardSidebarProjectChild[],
	normalizedQuery: string,
): DashboardSidebarProjectChild[] {
	return children.flatMap((child): DashboardSidebarProjectChild[] => {
		if (child.type === "workspace") {
			return matches(child.workspace.name, normalizedQuery) ? [child] : [];
		}
		if (matches(child.section.name, normalizedQuery)) {
			return [
				{ type: "section", section: { ...child.section, isCollapsed: false } },
			];
		}
		const workspaces = child.section.workspaces.filter((workspace) =>
			matches(workspace.name, normalizedQuery),
		);
		if (workspaces.length === 0) return [];
		return [
			{
				type: "section",
				section: { ...child.section, isCollapsed: false, workspaces },
			},
		];
	});
}

/**
 * Case-insensitive substring filter over projects. A project survives when its
 * name matches (kept whole) or when any of its workspaces/sections match
 * (pruned to the matches). Surviving projects and matched sections come back
 * expanded so the matches are actually visible; the persisted collapse state
 * is never written.
 */
export function filterDashboardSidebarProjects(
	projects: DashboardSidebarProject[],
	query: string,
): DashboardSidebarProject[] {
	const normalizedQuery = query.trim().toLowerCase();
	if (normalizedQuery === "") return projects;

	return projects.flatMap((project): DashboardSidebarProject[] => {
		if (matches(project.name, normalizedQuery)) {
			return [{ ...project, isCollapsed: false }];
		}
		const children = filterChildren(project.children, normalizedQuery);
		if (children.length === 0) return [];
		return [{ ...project, isCollapsed: false, children }];
	});
}
