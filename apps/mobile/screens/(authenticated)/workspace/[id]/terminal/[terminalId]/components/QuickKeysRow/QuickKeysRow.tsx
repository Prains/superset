import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	type LucideIcon,
} from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

interface QuickKey {
	id: string;
	label?: string;
	icon?: LucideIcon;
	/** Raw bytes written into the PTY. */
	data: string;
}

const QUICK_KEYS: QuickKey[] = [
	{ id: "esc", label: "esc", data: "\u001b" },
	{ id: "tab", label: "tab", data: "\t" },
	{ id: "shift-tab", label: "⇧tab", data: "\u001b[Z" },
	{ id: "up", icon: ArrowUp, data: "\u001b[A" },
	{ id: "down", icon: ArrowDown, data: "\u001b[B" },
	{ id: "left", icon: ArrowLeft, data: "\u001b[D" },
	{ id: "right", icon: ArrowRight, data: "\u001b[C" },
	{ id: "ctrl-c", label: "^C", data: "\u0003" },
];

interface QuickKeysRowProps {
	onKey: (data: string) => void;
}

/** Escape/tab/arrow keys the soft keyboard doesn't have. */
export function QuickKeysRow({ onKey }: QuickKeysRowProps) {
	const theme = useTheme();
	return (
		<View className="border-border border-t bg-background">
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				keyboardShouldPersistTaps="always"
				contentContainerClassName="gap-2 px-3 py-2"
			>
				{QUICK_KEYS.map((key) => (
					<Pressable
						key={key.id}
						onPress={() => onKey(key.data)}
						className="bg-secondary min-w-11 items-center justify-center rounded-md px-3 py-1.5 active:opacity-60"
					>
						{key.icon ? (
							<key.icon size={14} color={theme.secondaryForeground} />
						) : (
							<Text className="text-secondary-foreground font-mono text-xs">
								{key.label}
							</Text>
						)}
					</Pressable>
				))}
			</ScrollView>
		</View>
	);
}
