import { SquareTerminal } from "lucide-react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { ClaudeLogo } from "@/screens/(authenticated)/(home)/components/ClaudeLogo";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import type { TerminalRowData } from "../../hooks/useHostTerminals";
import { TerminalRowMenu } from "./components/TerminalRowMenu";
import { compactTime } from "./utils/compactTime";

export function TerminalRow({
	row,
	onPress,
	onKill,
	className,
}: {
	row: TerminalRowData;
	onPress: () => void;
	onKill: () => void;
	className?: string;
}) {
	const theme = useTheme();
	return (
		<TerminalRowMenu title={row.title} onKill={onKill}>
			<PressableScale
				className={cn("flex-row items-center gap-3 px-1 py-3.5", className)}
				onPress={onPress}
			>
				<View className="size-6 items-center justify-center">
					{row.agentId === "claude" ? (
						<ClaudeLogo size={16} />
					) : (
						<SquareTerminal size={16} color={theme.mutedForeground} />
					)}
				</View>
				<Text
					className="text-foreground/80 flex-1 text-[15px]"
					numberOfLines={1}
				>
					{row.title}
				</Text>
				{row.attention ? (
					<View
						className={cn(
							"size-2 rounded-full",
							row.attention === "permission"
								? "bg-amber-500"
								: "bg-emerald-500",
						)}
					/>
				) : null}
				<Text className="text-muted-foreground text-xs">
					{compactTime(row.ts)}
				</Text>
			</PressableScale>
		</TerminalRowMenu>
	);
}
