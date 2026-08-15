import { GripVertical, X } from "lucide-react-native";
import { memo } from "react";
import { Pressable, View } from "react-native";
import {
	Gesture,
	GestureDetector,
	type PanGesture,
} from "react-native-gesture-handler";
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

/** Hold before a row lifts. Moving >10pt inside it cancels (RNGH's rule). */
const PICK_UP_MS = 300;
/** Neighbours opening a gap, and the picked-up row settling into it. */
const SHIFT_MS = 150;
const SETTLE_MS = 130;

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
 * One session in the manage sheet: tap the row to switch to it, tap ✕ to close,
 * and reorder either by dragging the leading grip straight away or by holding
 * anywhere else on the row first.
 */
function SessionRowComponent({
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

	const tap = Gesture.Tap().onEnd((_event, success) => {
		if (success) runOnJS(onSelect)(row.terminalId);
	});

	// Two ways in, because the row shares its axis with the list's scroll:
	// dragging from the grip starts immediately, dragging from anywhere else on
	// the row needs a hold first so a scroll flick still scrolls.
	const withDragHandlers = (pan: PanGesture) =>
		pan
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
				// Glide into the target slot, then commit. Committing first would
				// snap the row from under the finger to zero and hope React
				// re-renders the new order in the same frame.
				const target = success ? dropIndex.value : index;
				dragTranslation.value = withTiming(
					(target - index) * ROW_HEIGHT,
					{ duration: SETTLE_MS },
					(finished) => {
						if (finished) runOnJS(onDrop)(index, target);
					},
				);
			});

	const gripDrag = withDragHandlers(Gesture.Pan().activeOffsetY([-4, 4]));
	const rowDrag = withDragHandlers(
		Gesture.Pan().activateAfterLongPress(PICK_UP_MS),
	);

	const style = useAnimatedStyle(() => {
		const lifted = dragIndex.value === index;
		if (lifted) {
			return {
				transform: [
					{ translateY: dragTranslation.value },
					{ scale: withTiming(1.02, { duration: 120 }) },
				],
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
				{
					translateY: from < 0 ? 0 : withTiming(shift, { duration: SHIFT_MS }),
				},
				{ scale: 1 },
			],
			zIndex: 0,
		};
	});

	// The ✕ sits outside the gesture area, not inside it: nesting it would both
	// merge the row into one VoiceOver element and fire select on every close.
	return (
		<Animated.View
			style={[style, { height: ROW_HEIGHT }]}
			className={cn(
				"flex-row items-center rounded-xl pr-1",
				active ? "bg-secondary" : "bg-transparent",
			)}
		>
			<GestureDetector gesture={Gesture.Race(rowDrag, tap)}>
				<View
					accessible
					accessibilityLabel={row.title}
					className="h-full flex-1 flex-row items-center gap-2.5 pl-1.5 pr-3"
				>
					<GestureDetector gesture={gripDrag}>
						{/* Not separately accessible: the row is one VoiceOver element,
						    and dragging isn't a VoiceOver-operable gesture anyway. */}
						<View
							hitSlop={10}
							className="items-center justify-center py-2 pr-1"
						>
							<GripVertical
								size={17}
								color={theme.mutedForeground}
								strokeWidth={2}
							/>
						</View>
					</GestureDetector>
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
				</View>
			</GestureDetector>
			<Pressable
				accessibilityLabel={`Close ${row.title}`}
				onPress={() => onClose(row)}
				hitSlop={8}
				className="size-9 items-center justify-center active:opacity-60"
			>
				<X size={17} color={theme.mutedForeground} strokeWidth={2} />
			</Pressable>
		</Animated.View>
	);
}

// Memoised: picking a row up flips list state, and re-rendering every row
// mid-drag is exactly when dropped frames show.
export const SessionRow = memo(SessionRowComponent);
