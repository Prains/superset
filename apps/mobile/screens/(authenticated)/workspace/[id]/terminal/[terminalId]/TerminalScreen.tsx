import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	View,
} from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { QuickKeysRow } from "./components/QuickKeysRow";
import {
	type TerminalConnectionState,
	type TerminalControlMessage,
	TerminalWebView,
	type TerminalWebViewHandle,
} from "./components/TerminalWebView";

const STATE_BANNERS: Partial<Record<TerminalConnectionState, string>> = {
	connecting: "Connecting…",
	reconnecting: "Reconnecting…",
	denied: "You don't have access to this terminal.",
};

/**
 * Live terminal attached over the relay. The xterm page owns the socket
 * (see TerminalWebView); this screen owns chrome: title, connection banner,
 * quick keys, and the session-ended overlay.
 */
export function TerminalScreen() {
	const params = useLocalSearchParams<{ id: string; terminalId: string }>();
	const workspaceId = params.id;
	const terminalId = params.terminalId;
	const router = useRouter();

	const { host, isResolving } = useWorkspaceHost(workspaceId ?? null);
	const routingKey = host
		? buildHostRoutingKey(host.organizationId, host.machineId)
		: null;

	const terminalRef = useRef<TerminalWebViewHandle>(null);
	const [connectionState, setConnectionState] =
		useState<TerminalConnectionState>("connecting");
	const [title, setTitle] = useState<string | null>(null);
	const [exitCode, setExitCode] = useState<number | null>(null);

	const handleControl = useCallback((message: TerminalControlMessage) => {
		if (message.type === "title") {
			setTitle(message.title ?? null);
		} else if (message.type === "exit") {
			setExitCode(message.exitCode ?? 0);
		}
	}, []);

	const banner = STATE_BANNERS[connectionState];

	return (
		<KeyboardAvoidingView
			className="bg-background flex-1"
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<Stack.Screen options={{ title: title ?? "Terminal" }} />
			{banner ? (
				<View className="bg-muted px-3 py-1.5">
					<Text className="text-muted-foreground text-center text-xs">
						{banner}
					</Text>
				</View>
			) : null}
			{connectionState === "error" ? (
				<View className="bg-muted flex-row items-center justify-center gap-3 px-3 py-1.5">
					<Text className="text-muted-foreground text-xs">
						Connection failed.
					</Text>
					<Pressable onPress={() => terminalRef.current?.retry()}>
						<Text className="text-foreground text-xs font-medium">Retry</Text>
					</Pressable>
				</View>
			) : null}
			<View className="flex-1">
				{!workspaceId || !terminalId ? (
					<Centered>
						<Text className="text-muted-foreground text-sm">
							Terminal not found.
						</Text>
					</Centered>
				) : routingKey ? (
					<TerminalWebView
						ref={terminalRef}
						workspaceId={workspaceId}
						terminalId={terminalId}
						routingKey={routingKey}
						onStateChange={setConnectionState}
						onControl={handleControl}
					/>
				) : isResolving ? (
					<Centered>
						<ActivityIndicator />
					</Centered>
				) : (
					<Centered>
						<Text className="text-muted-foreground px-8 text-center text-sm">
							The host that owns this workspace is offline.
						</Text>
					</Centered>
				)}
				{exitCode !== null ? (
					<View className="absolute inset-0 items-center justify-center bg-background/90">
						<Text className="text-foreground text-base font-medium">
							Session ended
						</Text>
						<Text className="text-muted-foreground mt-1 text-xs">
							exit code {exitCode}
						</Text>
						<Button
							variant="secondary"
							size="sm"
							className="mt-4"
							onPress={() => router.back()}
						>
							<Text>Close</Text>
						</Button>
					</View>
				) : null}
			</View>
			{routingKey && exitCode === null ? (
				<QuickKeysRow onKey={(data) => terminalRef.current?.sendInput(data)} />
			) : null}
		</KeyboardAvoidingView>
	);
}

function Centered({ children }: { children: React.ReactNode }) {
	return <View className="flex-1 items-center justify-center">{children}</View>;
}
