import { Alert, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import type { TerminalRowData } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { AgentMark } from "@/screens/(authenticated)/(home)/new-session/agent";

interface TerminalTabsProps {
	rows: TerminalRowData[];
	activeTerminalId: string | null;
	onSelect: (terminalId: string) => void;
	onAdd: () => void;
	onClose: (terminalId: string) => void;
}

/**
 * The workspace's sessions as tabs — agent mark + name, active tab raised.
 * No tab count, no per-tab close target: closing is a long-press (per the
 * design's declutter call). The trailing + opens the preset menu.
 */
export function TerminalTabs({
	rows,
	activeTerminalId,
	onSelect,
	onAdd,
	onClose,
}: TerminalTabsProps) {
	const theme = useTheme();
	return (
		<View className="border-border/60 flex-row items-center border-b">
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerClassName="px-2 gap-1 items-end"
				className="flex-1"
			>
				{rows.map((row) => {
					const active = row.terminalId === activeTerminalId;
					return (
						<Pressable
							key={row.terminalId}
							onPress={() => onSelect(row.terminalId)}
							onLongPress={() =>
								Alert.alert("Close session", row.title, [
									{ text: "Cancel", style: "cancel" },
									{
										text: "Close",
										style: "destructive",
										onPress: () => onClose(row.terminalId),
									},
								])
							}
							className={cn(
								"flex-row items-center gap-1.5 rounded-t-lg px-3 py-2",
								active ? "bg-secondary/70" : "opacity-60",
							)}
						>
							<AgentMark
								agentId={row.agentId ?? ""}
								size={13}
								color={theme.mutedForeground}
							/>
							<Text
								className={cn(
									"max-w-36 text-xs font-medium",
									active ? "text-foreground" : "text-muted-foreground",
								)}
								numberOfLines={1}
							>
								{row.title}
							</Text>
							{row.attention === "permission" ? (
								<View className="bg-amber-400 size-1.5 rounded-full" />
							) : row.attention === "working" ? (
								<View className="bg-green-500 size-1.5 rounded-full" />
							) : null}
						</Pressable>
					);
				})}
			</ScrollView>
			<Pressable
				onPress={onAdd}
				accessibilityLabel="New session"
				className="border-border/60 border-l px-3.5 py-2 active:opacity-60"
			>
				<Text className="text-foreground text-base leading-5">+</Text>
			</Pressable>
		</View>
	);
}
