import { ChevronDown } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";

interface ScopeBarProps {
	hostName: string | null;
	hostOnline: boolean;
	sortLabel: string;
	onPressHost: () => void;
	onPressSort: () => void;
}

function Chip({
	label,
	leading,
	onPress,
}: {
	label: string;
	leading?: React.ReactNode;
	onPress: () => void;
}) {
	const theme = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityLabel={label}
			className="bg-secondary/60 flex-row items-center gap-1.5 rounded-full py-1.5 pl-3 pr-2.5 active:opacity-60"
		>
			{leading}
			<Text className="text-foreground max-w-40 text-xs" numberOfLines={1}>
				{label}
			</Text>
			<ChevronDown size={12} color={theme.mutedForeground} strokeWidth={2.5} />
		</Pressable>
	);
}

/**
 * Names the scope the list is actually under. The host and sort were only ever
 * legible from inside the filter sheet, which is why a cold start never told
 * you which machine you were looking at. It holds during search too, because
 * search is scoped to the same host — matches elsewhere are offered as a tail
 * rather than silently mixed in.
 */
export function ScopeBar({
	hostName,
	hostOnline,
	sortLabel,
	onPressHost,
	onPressSort,
}: ScopeBarProps) {
	return (
		<View className="flex-row items-center gap-2 px-4 pb-2 pt-1">
			{hostName ? (
				<Chip
					label={hostName}
					leading={<HostStatusDot isOnline={hostOnline} />}
					onPress={onPressHost}
				/>
			) : null}
			<Chip label={sortLabel} onPress={onPressSort} />
		</View>
	);
}
