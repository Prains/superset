import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Alert } from "react-native";

export function TerminalRowMenu({
	title,
	onKill,
	children,
}: {
	title: string;
	onKill: () => void;
	children: ReactNode;
}) {
	const confirmKill = () => {
		Alert.alert(
			"Close terminal",
			`Close "${title}"? This kills the process running in it.`,
			[
				{ style: "cancel", text: "Cancel" },
				{ onPress: onKill, style: "destructive", text: "Close" },
			],
		);
	};

	// Tap navigation lives on the row itself; the Link exists solely because
	// Link.Menu must be a direct child of Link, so tap is a no-op here.
	return (
		<Link
			href="/(authenticated)/(home)"
			onPress={(event) => event.preventDefault()}
			asChild
		>
			<Link.Trigger>{children}</Link.Trigger>
			<Link.Menu>
				<Link.MenuAction icon="xmark.circle" onPress={confirmKill}>
					Close terminal
				</Link.MenuAction>
			</Link.Menu>
		</Link>
	);
}
