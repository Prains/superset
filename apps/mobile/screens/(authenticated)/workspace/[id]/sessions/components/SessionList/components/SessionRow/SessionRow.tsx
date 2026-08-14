import { GripVertical, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	type SharedValue,
	useAnimatedStyle,
	withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import type { TerminalRowData } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { AgentMark } from "@/screens/(authenticated)/(home)/new-session/agent";
import { PingDot } from "@/screens/(authenticated)/components/PingDot";
import { ROW_HEIGHT } from "../../constants";

interface SessionRowProps {
	row: TerminalRowData;
	index: number;
	count: number;
	active: boolean;
	dragIndex: SharedValue<number>;
	dropIndex: SharedValue<number>;
	dragTranslation: SharedValue<number>;
	onSelect: (terminalId: string) => void;
	onDragStart: () => void;
	onDrop: (from: number, to: number) => void;
	onClose: (row: TerminalRowData) => void;
}

/**
 * One session in the manage sheet: tap the row to switch to it, drag the
 * handle to reorder, tap ✕ to close. The handle is why there's no long-press
 * anywhere here — the drag has its own target, so nothing has to be inferred
 * from how long you hold.
 */
export function SessionRow({
	row,
	index,
	count,
	active,
	dragIndex,
	dropIndex,
	dragTranslation,
	onSelect,
	onDragStart,
	onDrop,
	onClose,
}: SessionRowProps) {
	const theme = useTheme();

	const drag = Gesture.Pan()
		.activeOffsetY([-4, 4])
		.onStart(() => {
			dragIndex.value = index;
			dropIndex.value = index;
			dragTranslation.value = 0;
			runOnJS(onDragStart)();
		})
		.onUpdate((event) => {
			dragTranslation.value = event.translationY;
			const slots = Math.round(event.translationY / ROW_HEIGHT);
			dropIndex.value = Math.min(Math.max(index + slots, 0), count - 1);
		})
		.onEnd((_event, success) => {
			runOnJS(onDrop)(index, success ? dropIndex.value : index);
		});

	const style = useAnimatedStyle(() => {
		const lifted = dragIndex.value === index;
		if (lifted) {
			return {
				transform: [{ translateY: dragTranslation.value }],
				zIndex: 1,
			};
		}
		// Rows between the picked-up row and its target slide one place to
		// make room; everything outside that span stays put.
		const from = dragIndex.value;
		const to = dropIndex.value;
		let shift = 0;
		if (from >= 0) {
			if (from < index && index <= to) shift = -ROW_HEIGHT;
			else if (to <= index && index < from) shift = ROW_HEIGHT;
		}
		return {
			transform: [
				{ translateY: from < 0 ? 0 : withTiming(shift, { duration: 160 }) },
			],
			zIndex: 0,
		};
	});

	// The ✕ and the handle are siblings of the tappable area, not children of
	// it: nesting them inside would merge all three into one VoiceOver element.
	return (
		<Animated.View
			style={[style, { height: ROW_HEIGHT }]}
			className={cn(
				"flex-row items-center gap-1 rounded-xl pr-1",
				active ? "bg-secondary" : "bg-transparent",
			)}
		>
			<Pressable
				onPress={() => onSelect(row.terminalId)}
				className="h-full flex-1 flex-row items-center gap-3 px-3 active:opacity-60"
			>
				<AgentMark
					agentId={row.agentId ?? ""}
					size={18}
					color={theme.mutedForeground}
				/>
				<Text className="flex-1 text-base" numberOfLines={1}>
					{row.title}
				</Text>
				{row.attention === "permission" ? (
					<PingDot color="#eab308" size={7} />
				) : row.attention === "failed" ? (
					<PingDot color="#ef4444" size={7} />
				) : row.attention === "working" ? (
					<PingDot color="#f59e0b" size={7} />
				) : row.attention === "review" ? (
					<View className="bg-green-500 size-2 rounded-full" />
				) : null}
			</Pressable>
			<Pressable
				accessibilityLabel={`Close ${row.title}`}
				onPress={() => onClose(row)}
				hitSlop={8}
				className="size-9 items-center justify-center active:opacity-60"
			>
				<X size={17} color={theme.mutedForeground} strokeWidth={2} />
			</Pressable>
			<GestureDetector gesture={drag}>
				<View
					accessible
					accessibilityLabel={`Reorder ${row.title}`}
					hitSlop={8}
					className="size-9 items-center justify-center"
				>
					<GripVertical
						size={18}
						color={theme.mutedForeground}
						strokeWidth={2}
					/>
				</View>
			</GestureDetector>
		</Animated.View>
	);
}
