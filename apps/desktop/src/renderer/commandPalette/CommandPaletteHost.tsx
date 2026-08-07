import { type ReactNode, useEffect } from "react";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { CommandContextProvider } from "./core/ContextProvider";
import { useFrameStackStore } from "./core/frames";
import { registerAllModules } from "./modules";
import { checkResourcesCommand } from "./modules/resources/commands";
import { CommandPalette } from "./ui/CommandPalette/CommandPalette";
import { DeleteWorkspaceMount } from "./ui/DeleteWorkspaceMount/DeleteWorkspaceMount";
import { FolderImportMount } from "./ui/FolderImportMount/FolderImportMount";
import { RemoveFromSidebarMount } from "./ui/RemoveFromSidebarMount/RemoveFromSidebarMount";
import { SetPreferredOpenInAppMount } from "./ui/SetPreferredOpenInAppMount/SetPreferredOpenInAppMount";

export function CommandPaletteHost({ children }: { children?: ReactNode }) {
	useEffect(() => {
		const unregister = registerAllModules();
		return unregister;
	}, []);

	return (
		<CommandContextProvider>
			<CommandPaletteTrigger />
			<CommandPalette />
			<DeleteWorkspaceMount />
			<RemoveFromSidebarMount />
			<SetPreferredOpenInAppMount />
			<FolderImportMount />
			{children}
		</CommandContextProvider>
	);
}

function CommandPaletteTrigger() {
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const reset = useFrameStackStore((s) => s.reset);
	const pushFrame = useFrameStackStore((s) => s.pushFrame);
	useHotkey("OPEN_COMMAND_PALETTE", () => setOpen(true));

	// CHECK_RESOURCES fires via the native "Resources" menu accelerator (see
	// main/lib/menu.ts) rather than a renderer-side useHotkey binding, so the
	// same Cmd+Shift+U shortcut also reaches the app when a menu accelerator
	// would otherwise shadow a DOM keydown listener.
	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type !== "check-resources") return;
			setOpen(true);
			reset();
			pushFrame(checkResourcesCommand);
		},
	});

	return null;
}
