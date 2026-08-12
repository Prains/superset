import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useQueryClient } from "@tanstack/react-query";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Keyboard,
	LayoutAnimation,
	Pressable,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";
import { cn } from "@/lib/utils";
import {
	getHostTerminalsQueryKey,
	useHostTerminals,
} from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import {
	TerminalComposer,
	type TerminalQuickKey,
} from "../components/TerminalComposer";
import { TerminalTabs } from "../components/TerminalTabs";
import {
	type TerminalConnectionState,
	type TerminalControlMessage,
	TerminalWebView,
	type TerminalWebViewHandle,
} from "../components/TerminalWebView";
import { useWorkspaceChangeset } from "../hooks/useWorkspaceChangeset";

const GLASS = isLiquidGlassAvailable();

// Solid themed header: the tab strip sits flush under it and must not
// render beneath glass.
const headerOptions = {
	headerShown: true,
	headerBackButtonDisplayMode: "minimal",
	headerShadowVisible: false,
	// Horizontal swipes belong to the terminal — back stays edge-only.
	fullScreenGestureEnabled: false,
} as const;

// The header pill has ~150pt to spend — five-digit counts read as 23.4k.
function compactCount(count: number): string {
	if (count < 1000) return String(count);
	const thousands = (count / 1000).toFixed(count < 10_000 ? 1 : 0);
	return `${thousands.replace(/\.0$/, "")}k`;
}

const STATE_BANNERS: Partial<Record<TerminalConnectionState, string>> = {
	connecting: "Connecting…",
	reconnecting: "Reconnecting…",
	denied: "You don't have access to this terminal.",
};

/**
 * The workspace IS the terminal: sessions render as tabs (agent mark + name),
 * the active tab is the one live attached stream, and the + menu launches a
 * new session from the host's agent presets (or a plain shell). Chrome: the
 * compact header (name → action sheet, Review pill) and the terminal composer.
 */
export function WorkspaceScreen() {
	const params = useLocalSearchParams<{ id: string; tab?: string }>();
	const id = params.id;
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const queryClient = useQueryClient();

	const { workspace, host, isResolving } = useWorkspaceHost(id ?? null);
	const { terminalsByWorkspace, isReady } = useHostTerminals(host);
	const changeset = useWorkspaceChangeset(id ?? null);

	const rows = useMemo(
		() => (id ? (terminalsByWorkspace.get(id) ?? []) : []),
		[terminalsByWorkspace, id],
	);

	// Active tab: the deep-linked ?tab= until the user switches, else the
	// first session. Falls back gracefully when the active terminal dies.
	const [pickedTerminalId, setPickedTerminalId] = useState<string | null>(null);
	const activeTerminalId = useMemo(() => {
		for (const candidate of [pickedTerminalId, params.tab]) {
			if (candidate && rows.some((row) => row.terminalId === candidate)) {
				return candidate;
			}
		}
		return rows[0]?.terminalId ?? null;
	}, [pickedTerminalId, params.tab, rows]);

	const hostUrl = host
		? buildRelayHostUrl(host.organizationId, host.machineId)
		: null;
	const routingKey = host
		? buildHostRoutingKey(host.organizationId, host.machineId)
		: null;

	// The + sheet lands back here via dismissTo with the new session in
	// ?tab= — adopt it over any manual pick so the fresh tab activates.
	useEffect(() => {
		if (params.tab) setPickedTerminalId(params.tab);
	}, [params.tab]);

	const invalidateTerminals = useCallback(() => {
		if (!host) return;
		void queryClient.invalidateQueries({
			queryKey: getHostTerminalsQueryKey(host.machineId),
		});
	}, [host, queryClient]);

	const openAddMenu = useCallback(() => {
		router.push(`/(authenticated)/workspace/${id}/new-session`);
	}, [router, id]);

	const killTerminal = useCallback(
		(terminalId: string) => {
			if (!workspace || !hostUrl) return;
			void getHostServiceClientByUrl(hostUrl)
				.terminal.killSession.mutate({ terminalId, workspaceId: workspace.id })
				.finally(invalidateTerminals);
		},
		[workspace, hostUrl, invalidateTerminals],
	);

	// --- active terminal connection (one live stream; tabs switch it) ---
	const terminalRef = useRef<TerminalWebViewHandle>(null);
	const [connectionState, setConnectionState] =
		useState<TerminalConnectionState>("connecting");
	const [composerHeight, setComposerHeight] = useState(0);
	const [keyboardHeight, setKeyboardHeight] = useState(0);

	useEffect(() => {
		const show = Keyboard.addListener("keyboardWillShow", (event) => {
			LayoutAnimation.configureNext({
				duration: event.duration || 250,
				update: { type: LayoutAnimation.Types.keyboard },
			});
			setKeyboardHeight(event.endCoordinates.height);
		});
		const hide = Keyboard.addListener("keyboardWillHide", (event) => {
			LayoutAnimation.configureNext({
				duration: event.duration || 250,
				update: { type: LayoutAnimation.Types.keyboard },
			});
			setKeyboardHeight(0);
		});
		return () => {
			show.remove();
			hide.remove();
		};
	}, []);

	const composerBottom = keyboardHeight > 0 ? keyboardHeight : insets.bottom;

	const handleControl = useCallback(
		(message: TerminalControlMessage) => {
			// Session ended under us — refresh the tab row; the active tab falls
			// back to the next session automatically.
			if (message.type === "exit") invalidateTerminals();
		},
		[invalidateTerminals],
	);

	const handleSubmit = useCallback((text: string) => {
		const framed = text.includes("\n")
			? `\u001b[200~${text}\u001b[201~\r`
			: `${text}\r`;
		terminalRef.current?.sendInput(framed);
	}, []);

	const handleQuickKey = useCallback((key: TerminalQuickKey) => {
		if (key.data) terminalRef.current?.sendInput(key.data);
	}, []);

	const banner = STATE_BANNERS[connectionState];
	const hasChanges = changeset.files.length > 0;
	const showComposer = activeTerminalId !== null && routingKey !== null;

	return (
		<View className="bg-background flex-1">
			<Stack.Screen options={{ ...headerOptions, title: "Workspace" }}>
				<Stack.Title asChild>
					<PressableScale
						onPress={() =>
							router.push(`/(authenticated)/workspace/${id}/actions`)
						}
						disabled={!workspace}
					>
						{/* Width budget: back capsule + Review pill leave ~180pt of bar
						    for the title on a 390pt screen — wider and it collides with
						    the back button under iOS 26's floating bar items. */}
						<View className="max-w-44 flex-row items-center gap-1">
							<Text className="font-semibold text-[17px]" numberOfLines={1}>
								{workspace?.name ?? ""}
							</Text>
							<Icon
								as={ChevronDown}
								className="text-muted-foreground size-3.5"
								strokeWidth={2.5}
							/>
						</View>
					</PressableScale>
				</Stack.Title>
				{hasChanges ? (
					<Stack.Toolbar placement="right">
						<Stack.Toolbar.View>
							<PressableScale
								onPress={() =>
									router.push(`/(authenticated)/workspace/${id}/diff`)
								}
							>
								{/* Bare content: the system already wraps toolbar views in a
								    glass capsule on iOS 26 — any surface of our own renders
								    as a pill inside a pill. */}
								<View
									className={cn(
										"flex-row items-center gap-1.5",
										!GLASS &&
											"bg-card border-border rounded-full border px-3 py-1.5",
									)}
								>
									<Text className="font-medium text-[13px]">Review</Text>
									<Text className="text-green-500 font-semibold text-[13px]">
										+{compactCount(changeset.additions)}
									</Text>
									<Text className="text-red-500 font-semibold text-[13px]">
										−{compactCount(changeset.deletions)}
									</Text>
								</View>
							</PressableScale>
						</Stack.Toolbar.View>
					</Stack.Toolbar>
				) : null}
			</Stack.Screen>

			<TerminalTabs
				rows={rows}
				activeTerminalId={activeTerminalId}
				onSelect={setPickedTerminalId}
				onAdd={openAddMenu}
				onClose={killTerminal}
			/>

			{banner && activeTerminalId ? (
				<View className="bg-muted px-3 py-1.5">
					<Text className="text-muted-foreground text-center text-xs">
						{banner}
					</Text>
				</View>
			) : null}
			{connectionState === "error" && activeTerminalId ? (
				<View className="bg-muted flex-row items-center justify-center gap-3 px-3 py-1.5">
					<Text className="text-muted-foreground text-xs">
						Connection failed.
					</Text>
					<Pressable onPress={() => terminalRef.current?.retry()}>
						<Text className="text-foreground text-xs font-medium">Retry</Text>
					</Pressable>
				</View>
			) : null}

			<View
				className="flex-1"
				style={{
					marginBottom: showComposer ? composerHeight + composerBottom : 0,
				}}
			>
				{activeTerminalId && routingKey && id ? (
					<TerminalWebView
						key={activeTerminalId}
						ref={terminalRef}
						workspaceId={id}
						terminalId={activeTerminalId}
						routingKey={routingKey}
						onStateChange={setConnectionState}
						onControl={handleControl}
					/>
				) : isResolving || (!isReady && host) ? (
					<Centered>
						<ActivityIndicator />
					</Centered>
				) : !host ? (
					<Centered>
						<Text className="text-muted-foreground px-8 text-center text-sm">
							The host that owns this workspace is offline.
						</Text>
					</Centered>
				) : (
					<Centered>
						<Text className="text-muted-foreground text-sm">
							No sessions yet.
						</Text>
						<Pressable onPress={openAddMenu} className="mt-3 active:opacity-60">
							<Text className="text-foreground text-sm font-medium">
								Start one +
							</Text>
						</Pressable>
					</Centered>
				)}
			</View>

			{showComposer ? (
				<View
					className="absolute inset-x-0"
					style={{ bottom: composerBottom }}
					onLayout={(event) =>
						setComposerHeight(event.nativeEvent.layout.height)
					}
				>
					<TerminalComposer
						onSubmit={handleSubmit}
						onQuickKey={handleQuickKey}
					/>
				</View>
			) : null}
		</View>
	);
}

function Centered({ children }: { children: React.ReactNode }) {
	return <View className="flex-1 items-center justify-center">{children}</View>;
}
