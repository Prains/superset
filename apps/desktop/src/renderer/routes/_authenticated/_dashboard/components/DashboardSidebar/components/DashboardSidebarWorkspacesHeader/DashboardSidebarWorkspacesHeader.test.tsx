import { describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The header only needs its own markup here: the dropdown/tooltip primitives
// and the folder-import hook pull in Radix context and tRPC, neither of which
// exists under `bun test`.
mock.module("@superset/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
	DropdownMenuContent: () => null,
	DropdownMenuItem: () => null,
	DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
		<>{children}</>
	),
}));
mock.module("@superset/ui/tooltip", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
	TooltipContent: () => null,
	TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
mock.module("@superset/ui/sonner", () => ({ toast: { error: () => {} } }));
mock.module("@tanstack/react-router", () => ({ useNavigate: () => () => {} }));
mock.module(
	"renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport",
	() => ({ useFolderFirstImport: () => ({ start: async () => null }) }),
);

// Zustand feeds `getInitialState()` to `useSyncExternalStore` during SSR, so a
// static render always sees the store's initial value. Stand the store in with a
// plain selector call to render both disclosure states.
let isProjectsListCollapsed = false;
mock.module("renderer/stores/sidebar-workspaces-collapse", () => ({
	useSidebarWorkspacesCollapseStore: <T,>(
		selector: (state: { isCollapsed: boolean; toggle: () => void }) => T,
	) => selector({ isCollapsed: isProjectsListCollapsed, toggle: () => {} }),
}));

const { DashboardSidebarWorkspacesHeader } = await import(
	"./DashboardSidebarWorkspacesHeader"
);

function renderHeader({ collapsed }: { collapsed: boolean }) {
	isProjectsListCollapsed = collapsed;
	return renderToStaticMarkup(<DashboardSidebarWorkspacesHeader />);
}

/** The chevron is the only element carrying the disclosure state. */
function chevronClassName(markup: string) {
	return markup.match(/<svg[^>]*class="(size-3 shrink-0[^"]*)"/)?.[1] ?? "";
}

describe("DashboardSidebarWorkspacesHeader", () => {
	it("exposes its disclosure state to assistive tech", () => {
		expect(renderHeader({ collapsed: false })).toContain(
			'aria-expanded="true"',
		);
		expect(renderHeader({ collapsed: true })).toContain(
			'aria-expanded="false"',
		);
	});

	// Regression: a stray click anywhere on the header row collapses the projects
	// list, and the state is persisted — so the expanded sidebar renders the
	// "Projects" label plus the add button over an empty list. With the chevron
	// faded out until hover, nothing on screen said the list was collapsed and a
	// reload could not clear it, so the section read as permanently broken.
	it("keeps the chevron visible while the projects list is collapsed", () => {
		const className = chevronClassName(renderHeader({ collapsed: true }));

		expect(className).not.toContain("opacity-0");
		expect(className).not.toContain("group-hover:opacity-100");
		expect(className).not.toContain("rotate-90");
	});

	it("still fades the chevron in on hover while the list is expanded", () => {
		const className = chevronClassName(renderHeader({ collapsed: false }));

		expect(className).toContain("opacity-0");
		expect(className).toContain("group-hover:opacity-100");
		expect(className).toContain("rotate-90");
	});
});
