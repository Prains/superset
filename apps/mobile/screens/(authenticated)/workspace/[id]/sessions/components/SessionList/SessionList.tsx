import * as Haptics from "expo-haptics";
import { useCallback, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import type { TerminalRowData } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { SessionRow } from "./components/SessionRow";

interface SessionListProps {
	rows: TerminalRowData[];
	activeTerminalId: string | null;
	onSelect: (terminalId: string) => void;
	onReorder: (terminalIds: string[]) => void;
	onClose: (row: TerminalRowData) => void;
}

/** Reorderable list of the workspace's sessions, drag handle per row. */
export function SessionList({
	rows,
	activeTerminalId,
	onSelect,
	onReorder,
	onClose,
}: SessionListProps) {
	const dragIndex = useSharedValue(-1);
	const dropIndex = useSharedValue(-1);
	const dragTranslation = useSharedValue(0);
	// The list must stop scrolling under a lifted row; RN's ScrollView won't
	// yield to a gesture-handler pan on its own.
	const [dragging, setDragging] = useState(false);
	// Read through a ref so the drop callback keeps its identity when `dragging`
	// flips — a new callback would re-render every memoised row mid-drag.
	const rowsRef = useRef(rows);
	rowsRef.current = rows;

	const handleDragStart = useCallback(() => {
		setDragging(true);
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
	}, []);

	const handleDrop = useCallback(
		(from: number, to: number) => {
			// Reset with the commit, not before it: the rows settle straight into
			// the re-rendered order instead of snapping back through the old one.
			dragIndex.value = -1;
			dropIndex.value = -1;
			dragTranslation.value = 0;
			setDragging(false);
			const ids = rowsRef.current.map((row) => row.terminalId);
			const moved = ids[from];
			if (!moved || from === to) return;
			const next = ids.slice();
			next.splice(from, 1);
			next.splice(to, 0, moved);
			onReorder(next);
		},
		[onReorder, dragIndex, dropIndex, dragTranslation],
	);

	return (
		<ScrollView
			scrollEnabled={!dragging}
			className="bg-background flex-1"
			contentContainerClassName="px-2 pb-8"
			contentInsetAdjustmentBehavior="automatic"
		>
			{rows.length === 0 ? (
				<View className="items-center py-8">
					<Text className="text-muted-foreground text-sm">
						No sessions yet.
					</Text>
				</View>
			) : null}
			{rows.map((row, index) => (
				<SessionRow
					key={row.terminalId}
					row={row}
					index={index}
					count={rows.length}
					active={row.terminalId === activeTerminalId}
					dragIndex={dragIndex}
					dropIndex={dropIndex}
					dragTranslation={dragTranslation}
					onSelect={onSelect}
					onDragStart={handleDragStart}
					onDrop={handleDrop}
					onClose={onClose}
				/>
			))}
		</ScrollView>
	);
}
