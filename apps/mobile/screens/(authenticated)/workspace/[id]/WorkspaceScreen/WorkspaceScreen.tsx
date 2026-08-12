import { useQueryClient } from "@tanstack/react-query";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";
import { cn } from "@/lib/utils";
import { NewChatWidget } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget";
import { TerminalRow } from "@/screens/(authenticated)/(home)/home/components/TerminalRow";
import {
	getHostTerminalsQueryKey,
	useHostTerminals,
} from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import { useWorkspaceChangeset } from "../hooks/useWorkspaceChangeset";

const GLASS = isLiquidGlassAvailable();

const NAVIGATION_BAR_HEIGHT = 44;

const glassHeaderOptions = {
	headerShown: true,
	headerTransparent: true,
	headerLargeTitle: false,
	headerBackButtonDisplayMode: "minimal",
	headerShadowVisible: false,
	...(GLASS ? {} : { headerBlurEffect: "systemUltraThinMaterial" as const }),
	headerStyle: { backgroundColor: "transparent" },
} as const;

export function WorkspaceScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const { height: windowHeight } = useWindowDimensions();
	const insets = useSafeAreaInsets();

	const { workspace, host } = useWorkspaceHost(id ?? null);
	const { terminalsByWorkspace, isReady } = useHostTerminals(host);
	const changeset = useWorkspaceChangeset(id ?? null);

	const terminalRows = useMemo(
		() => (id ? (terminalsByWorkspace.get(id) ?? []) : []),
		[terminalsByWorkspace, id],
	);

	const queryClient = useQueryClient();
	const killTerminal = (terminalId: string) => {
		if (!workspace || !host) return;
		const hostUrl = buildRelayHostUrl(host.organizationId, host.machineId);
		void getHostServiceClientByUrl(hostUrl)
			.terminal.killSession.mutate({ terminalId, workspaceId: workspace.id })
			.finally(() => {
				void queryClient.invalidateQueries({
					queryKey: getHostTerminalsQueryKey(host.machineId),
				});
			});
	};

	const widgetWorkspaces = useMemo<HostWorkspaceItem[]>(
		() => (workspace ? [{ ...workspace, hostReachable: true }] : []),
		[workspace],
	);

	const hasChanges = changeset.files.length > 0;

	return (
		<View className="bg-background flex-1">
			<Stack.Screen options={{ ...glassHeaderOptions, title: "Workspace" }}>
				<Stack.Title asChild>
					<PressableScale
						onPress={() =>
							router.push(`/(authenticated)/workspace/${id}/actions`)
						}
						disabled={!workspace}
					>
						<View className="max-w-64 flex-row items-center gap-1">
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
								<GlassView
									colorScheme="dark"
									glassEffectStyle="regular"
									style={{ borderRadius: 999, overflow: "hidden" }}
								>
									<View
										className={cn(
											"flex-row items-center gap-1.5 px-3 py-1.5",
											!GLASS && "bg-card border-border rounded-full border",
										)}
									>
										<Text className="font-medium text-[13px]">Review</Text>
										<Text className="text-green-500 font-semibold text-[13px]">
											+{changeset.additions.toLocaleString()}
										</Text>
										<Text className="text-red-500 font-semibold text-[13px]">
											−{changeset.deletions.toLocaleString()}
										</Text>
									</View>
								</GlassView>
							</PressableScale>
						</Stack.Toolbar.View>
					</Stack.Toolbar>
				) : null}
			</Stack.Screen>
			<ScrollView
				className="flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{
					paddingTop: 4,
					paddingBottom: 132,
					// Short content doesn't engage the scroll pan below the last row —
					// stretch the container to the viewport (same fix as HomeScreen).
					minHeight:
						windowHeight - insets.top - NAVIGATION_BAR_HEIGHT - insets.bottom,
				}}
				keyboardDismissMode="interactive"
			>
				{terminalRows.map((row, index) => (
					<View key={row.terminalId}>
						{index > 0 && <View className="border-border/40 ml-12 border-t" />}
						<TerminalRow
							row={row}
							className="px-4 py-3"
							onPress={() =>
								router.push(
									`/(authenticated)/workspace/${id}/terminal/${row.terminalId}`,
								)
							}
							onKill={() => killTerminal(row.terminalId)}
						/>
					</View>
				))}
				{terminalRows.length === 0 && isReady && (
					<View className="items-center py-20">
						<Text className="text-muted-foreground text-sm">
							No terminals in this workspace yet.
						</Text>
					</View>
				)}
			</ScrollView>
			{workspace ? (
				<NewChatWidget
					workspaces={widgetWorkspaces}
					fixedTarget={{
						workspaceId: workspace.id,
						workspaceName: workspace.name,
						branch: workspace.branch,
						hostId: workspace.hostId,
					}}
				/>
			) : null}
		</View>
	);
}
