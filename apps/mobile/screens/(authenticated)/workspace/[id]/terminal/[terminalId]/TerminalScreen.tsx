import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Keyboard,
	LayoutAnimation,
	Pressable,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	TerminalComposer,
	type TerminalQuickKey,
} from "./components/TerminalComposer";
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
 * (see TerminalWebView); the TerminalComposer (home glass composer, ported)
 * owns input; this screen owns chrome: title, connection banner, and the
 * session-ended overlay.
 *
 * Keyboard handling: the composer is an absolute bottom overlay positioned at
 * the tracked keyboard height, and the WebView insets by composer + keyboard
 * height so its last rows stay visible above the composer while typing (xterm
 * reflows to the smaller box).
 */
export function TerminalScreen() {
	const params = useLocalSearchParams<{ id: string; terminalId: string }>();
	const workspaceId = params.id;
	const terminalId = params.terminalId;
	const router = useRouter();

	const insets = useSafeAreaInsets();
	const { host, isResolving } = useWorkspaceHost(workspaceId ?? null);
	const routingKey = host
		? buildHostRoutingKey(host.organizationId, host.machineId)
		: null;

	const terminalRef = useRef<TerminalWebViewHandle>(null);
	const [connectionState, setConnectionState] =
		useState<TerminalConnectionState>("connecting");
	const [title, setTitle] = useState<string | null>(null);
	const [exitCode, setExitCode] = useState<number | null>(null);
	const [composerHeight, setComposerHeight] = useState(0);
	const [keyboardHeight, setKeyboardHeight] = useState(0);

	// Position the composer deterministically above the keyboard: a native
	// header offsets the KeyboardAvoidingView frame, so its own measurement
	// leaves the bar behind the keyboard. Animating alongside the keyboard's
	// reported duration keeps the rise smooth.
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

	const handleControl = useCallback((message: TerminalControlMessage) => {
		if (message.type === "title") {
			setTitle(message.title ?? null);
		} else if (message.type === "exit") {
			setExitCode(message.exitCode ?? 0);
		}
	}, []);

	const handleSubmit = useCallback((text: string) => {
		// Multi-line input rides a bracketed paste so TUIs treat it as one
		// prompt (same framing the host applies in terminal.send).
		const framed = text.includes("\n")
			? `\u001b[200~${text}\u001b[201~\r`
			: `${text}\r`;
		terminalRef.current?.sendInput(framed);
	}, []);

	const handleQuickKey = useCallback((key: TerminalQuickKey) => {
		if (key.data) terminalRef.current?.sendInput(key.data);
	}, []);

	const banner = STATE_BANNERS[connectionState];
	const showComposer = routingKey !== null && exitCode === null;

	return (
		<View className="bg-background flex-1">
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
			<View
				className="flex-1"
				style={{
					marginBottom: showComposer ? composerHeight + composerBottom : 0,
				}}
			>
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
