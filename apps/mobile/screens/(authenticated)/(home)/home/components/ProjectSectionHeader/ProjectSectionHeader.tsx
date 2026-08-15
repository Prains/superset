import { ChevronDown, ChevronRight, Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { ProjectAvatar } from "@/screens/(authenticated)/(home)/filter/components/ProjectAvatar";

interface ProjectSectionHeaderProps {
	name: string;
	iconUrl?: string | null;
	count: number;
	collapsed: boolean;
	onToggle: () => void;
	onAdd: () => void;
}

/**
 * A project's band in the list. The count is what makes a collapsed section
 * still informative — you can tell what's inside without opening it.
 */
export function ProjectSectionHeader({
	name,
	iconUrl,
	count,
	collapsed,
	onToggle,
	onAdd,
}: ProjectSectionHeaderProps) {
	const theme = useTheme();
	return (
		<View className="flex-row items-center gap-2 px-4 pb-1.5 pt-4">
			<Pressable
				onPress={onToggle}
				accessibilityLabel={`${name}, ${count} workspaces`}
				accessibilityState={{ expanded: !collapsed }}
				className="flex-1 flex-row items-center gap-2.5 active:opacity-60"
			>
				{/* Two icons rather than one rotated: a transform on the icon
				    itself doesn't reach the underlying SVG, so it renders nothing. */}
				{collapsed ? (
					<ChevronRight
						size={12}
						color={theme.mutedForeground}
						strokeWidth={2.5}
					/>
				) : (
					<ChevronDown
						size={12}
						color={theme.mutedForeground}
						strokeWidth={2.5}
					/>
				)}
				<ProjectAvatar name={name} iconUrl={iconUrl} size={18} />
				<Text
					className="text-foreground font-semibold text-sm"
					numberOfLines={1}
				>
					{name}
				</Text>
				<Text className="text-muted-foreground font-mono text-xs">{count}</Text>
				<View className="bg-border/60 ml-1 h-px flex-1" />
			</Pressable>
			<Pressable
				onPress={onAdd}
				accessibilityLabel={`New workspace in ${name}`}
				hitSlop={8}
				className="active:opacity-60"
			>
				<Plus size={16} color={theme.mutedForeground} strokeWidth={2} />
			</Pressable>
		</View>
	);
}
