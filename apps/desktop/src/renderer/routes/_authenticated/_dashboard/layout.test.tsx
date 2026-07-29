import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Reproduces #6041: "Quick Create Workspace is not working in v2".
 *
 * Two defects, both rooted in the dashboard layout:
 *
 * 1. `QUICK_CREATE_WORKSPACE` (⌘⇧N) is in the hotkey registry — it shows up
 *    in Settings → Keyboard — but no component ever binds a handler for it,
 *    so pressing it does nothing.
 * 2. `NEW_WORKSPACE` pre-selects the focused project by reading the *v1*
 *    workspace row only. On a v2 workspace route that row is always
 *    undefined, so the modal falls back to the last-used project.
 *
 * The tests render the layout with its data/host dependencies stubbed, then
 * fire the captured hotkey handlers.
 */

const openNewWorkspaceModal = mock((_projectId?: string) => {});
const navigate = mock((_options: unknown) => Promise.resolve());
const submitWorkspaceCreate = mock(
	(_args: { hostId: string; snapshot: { id: string; projectId: string } }) => ({
		workspaceId: "created",
		completed: Promise.resolve({ ok: true as const, workspaceId: "created" }),
	}),
);
const createV1Workspace = mock((_input: { projectId: string }) =>
	Promise.resolve({}),
);

type HotkeyHandler = (event: KeyboardEvent) => void;
const hotkeyHandlers = new Map<string, HotkeyHandler>();

let matchRouteImpl: (options: {
	to: string;
}) => false | Record<string, string> = () => false;
let hostWorkspaces: Array<Record<string, unknown>> = [];
let isV2CloudEnabled = true;

mock.module("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	Outlet: () => null,
	useMatchRoute: () => (options: { to: string }) => matchRouteImpl(options),
	useNavigate: () => navigate,
}));
mock.module("renderer/hotkeys", () => ({
	useHotkey: (id: string, callback: HotkeyHandler) => {
		hotkeyHandlers.set(id, callback);
		return { keys: [], text: "" };
	},
}));
mock.module("renderer/hooks/useIsV2CloudEnabled", () => ({
	useIsV2CloudEnabled: () => isV2CloudEnabled,
}));
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		workspaces: { get: { useQuery: () => ({ data: undefined }) } },
	},
}));
mock.module(
	"renderer/routes/_authenticated/providers/HostWorkspacesProvider",
	() => ({
		useHostWorkspaces: () => ({ workspaces: hostWorkspaces }),
	}),
);
mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => ({ machineId: "local-host" }),
	}),
);
mock.module(
	"renderer/routes/_authenticated/hooks/useDashboardSidebarState",
	() => ({
		useDashboardSidebarState: () => ({ removeWorkspaceFromSidebar: () => {} }),
	}),
);
mock.module("renderer/routes/_authenticated/hooks/useDevSeedV2Sidebar", () => ({
	useDevSeedV2Sidebar: () => {},
}));
mock.module("renderer/stores/new-workspace-modal", () => ({
	useOpenNewWorkspaceModal: () => openNewWorkspaceModal,
}));
mock.module("renderer/stores/workspace-creates", () => ({
	useWorkspaceCreates: () => ({ submit: submitWorkspaceCreate }),
}));
mock.module("renderer/react-query/workspaces", () => ({
	useCreateWorkspace: () => ({ mutateAsync: createV1Workspace }),
}));
mock.module("renderer/stores/workspace-sidebar-state", () => ({
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH: 48,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH: 280,
	MAX_WORKSPACE_SIDEBAR_WIDTH: 600,
	useWorkspaceSidebarStore: () => ({
		isOpen: false,
		toggleCollapsed: () => {},
		setOpen: () => {},
		width: 280,
		setWidth: () => {},
		isResizing: false,
		setIsResizing: () => {},
		isCollapsed: () => false,
	}),
}));
mock.module("@superset/ui/sonner", () => ({
	toast: { error: () => {}, promise: () => {} },
}));

// Chrome that is irrelevant to hotkey wiring — stubbed to keep the render
// free of its own provider requirements.
mock.module("renderer/commandPalette", () => ({
	CommandPaletteHost: () => null,
}));
mock.module("renderer/screens/main/components/ResizablePanel", () => ({
	ResizablePanel: () => null,
}));
mock.module("renderer/screens/main/components/WorkspaceSidebar", () => ({
	WorkspaceSidebar: () => null,
}));
mock.module(
	"renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components",
	() => ({ DeleteWorkspaceDialog: () => null }),
);
mock.module(
	"renderer/routes/_authenticated/_dashboard/components/DashboardSidebar",
	() => ({ DashboardSidebar: () => null }),
);
mock.module(
	"renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarDeleteDialog",
	() => ({ DashboardSidebarDeleteDialog: () => null }),
);
mock.module("./components/AddRepositoryModals", () => ({
	AddRepositoryModals: () => null,
}));
mock.module("./components/CrossVersionMismatchState", () => ({
	CrossVersionMismatchState: () => null,
}));
mock.module("./components/TopBar", () => ({ TopBar: () => null }));

const { Route } = (await import("./layout")) as unknown as {
	Route: { component: ComponentType };
};

function renderLayout() {
	hotkeyHandlers.clear();
	renderToStaticMarkup(<Route.component />);
}

const keyEvent = undefined as unknown as KeyboardEvent;

describe("DashboardLayout workspace hotkeys (#6041)", () => {
	beforeEach(() => {
		openNewWorkspaceModal.mockClear();
		navigate.mockClear();
		submitWorkspaceCreate.mockClear();
		createV1Workspace.mockClear();
		isV2CloudEnabled = true;
		hostWorkspaces = [
			{
				id: "workspace-v2",
				projectId: "project-focused",
				hostId: "host-2",
				name: "feature",
				branch: "feature",
				type: "worktree",
			},
		];
		matchRouteImpl = ({ to }) =>
			to === "/v2-workspace/$workspaceId"
				? { workspaceId: "workspace-v2" }
				: false;
	});

	test("NEW_WORKSPACE pre-selects the focused v2 workspace's project", () => {
		renderLayout();

		hotkeyHandlers.get("NEW_WORKSPACE")?.(keyEvent);

		expect(openNewWorkspaceModal).toHaveBeenCalledWith("project-focused");
	});

	test("NEW_WORKSPACE still pre-selects the focused v1 workspace's project", () => {
		hostWorkspaces = [];
		matchRouteImpl = ({ to }) =>
			to === "/workspace/$workspaceId"
				? { workspaceId: "workspace-v1" }
				: false;
		mock.module("renderer/lib/electron-trpc", () => ({
			electronTrpc: {
				workspaces: {
					get: {
						useQuery: () => ({ data: { projectId: "project-v1" } }),
					},
				},
			},
		}));

		renderLayout();
		hotkeyHandlers.get("NEW_WORKSPACE")?.(keyEvent);

		expect(openNewWorkspaceModal).toHaveBeenCalledWith("project-v1");

		mock.module("renderer/lib/electron-trpc", () => ({
			electronTrpc: {
				workspaces: { get: { useQuery: () => ({ data: undefined }) } },
			},
		}));
	});

	test("QUICK_CREATE_WORKSPACE creates a workspace in the focused project", () => {
		renderLayout();

		const quickCreate = hotkeyHandlers.get("QUICK_CREATE_WORKSPACE");
		expect(quickCreate).toBeDefined();

		quickCreate?.(keyEvent);

		expect(submitWorkspaceCreate).toHaveBeenCalledTimes(1);
		const args = submitWorkspaceCreate.mock.calls[0][0];
		expect(args.hostId).toBe("host-2");
		expect(args.snapshot.projectId).toBe("project-focused");
		expect(navigate).toHaveBeenCalledWith({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: args.snapshot.id },
		});
	});

	test("QUICK_CREATE_WORKSPACE uses the v1 create path when v2 is off", () => {
		isV2CloudEnabled = false;
		hostWorkspaces = [];
		matchRouteImpl = ({ to }) =>
			to === "/workspace/$workspaceId"
				? { workspaceId: "workspace-v1" }
				: false;
		mock.module("renderer/lib/electron-trpc", () => ({
			electronTrpc: {
				workspaces: {
					get: { useQuery: () => ({ data: { projectId: "project-v1" } }) },
				},
			},
		}));

		renderLayout();
		hotkeyHandlers.get("QUICK_CREATE_WORKSPACE")?.(keyEvent);

		expect(createV1Workspace).toHaveBeenCalledWith({ projectId: "project-v1" });
		expect(submitWorkspaceCreate).not.toHaveBeenCalled();

		mock.module("renderer/lib/electron-trpc", () => ({
			electronTrpc: {
				workspaces: { get: { useQuery: () => ({ data: undefined }) } },
			},
		}));
	});

	test("QUICK_CREATE_WORKSPACE does nothing without a focused project", () => {
		hostWorkspaces = [];
		matchRouteImpl = () => false;

		renderLayout();
		hotkeyHandlers.get("QUICK_CREATE_WORKSPACE")?.(keyEvent);

		expect(submitWorkspaceCreate).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});
});
