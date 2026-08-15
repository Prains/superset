import {
	ContentUnavailableView,
	Host,
	HStack,
	Image,
	List,
	Spacer,
	Text as UIText,
} from "@expo/ui/swift-ui";
import {
	environment,
	frame,
	lineLimit,
	listRowBackground,
	onTapGesture,
	resizable,
} from "@expo/ui/swift-ui/modifiers";
import type { TerminalRowData } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { ATTENTION_COLORS, ROW_TINT } from "./constants";
import { useAgentIconUris } from "./hooks/useAgentIconUris";

interface SessionListProps {
	rows: TerminalRowData[];
	activeTerminalId: string | null;
	onSelect: (terminalId: string) => void;
	onReorder: (terminalIds: string[]) => void;
	onClose: (row: TerminalRowData) => void;
}

/**
 * The sessions as a native SwiftUI list in edit mode: the grabber, the drag,
 * its auto-scroll at the edges and the VoiceOver support are all UIKit's, not
 * ours. `onMove` hands back SwiftUI's insert-before index, which is one past
 * the slot when moving down.
 */
export function SessionList({
	rows,
	activeTerminalId,
	onSelect,
	onReorder,
	onClose,
}: SessionListProps) {
	const iconUris = useAgentIconUris(rows);

	return (
		<Host style={{ flex: 1 }} colorScheme="dark">
			{rows.length === 0 ? (
				<ContentUnavailableView
					title="No sessions"
					systemImage="terminal"
					description="Start one with + in the tab strip."
				/>
			) : null}
			<List modifiers={[environment({ key: "editMode", value: "active" })]}>
				<List.ForEach
					onMove={(sourceIndices, destination) => {
						const from = sourceIndices[0];
						if (from === undefined) return;
						const ids = rows.map((row) => row.terminalId);
						const moved = ids[from];
						if (moved === undefined) return;
						ids.splice(from, 1);
						ids.splice(
							destination > from ? destination - 1 : destination,
							0,
							moved,
						);
						onReorder(ids);
					}}
					onDelete={(indices) => {
						const row = indices[0] === undefined ? undefined : rows[indices[0]];
						if (row) onClose(row);
					}}
				>
					{rows.map((row) => {
						const iconUri = row.agentId ? iconUris[row.agentId] : undefined;
						const attentionColor = row.attention
							? ATTENTION_COLORS[row.attention]
							: undefined;
						return (
							<HStack
								key={row.terminalId}
								spacing={10}
								modifiers={[
									onTapGesture(() => onSelect(row.terminalId)),
									...(row.terminalId === activeTerminalId
										? [listRowBackground(ROW_TINT)]
										: []),
								]}
							>
								{iconUri ? (
									// `size` only sizes SF Symbols; a bitmap needs resizable + frame
									// or it renders at its intrinsic size and blows the row open.
									<Image
										uiImage={iconUri}
										modifiers={[resizable(), frame({ width: 18, height: 18 })]}
									/>
								) : (
									<Image systemName="terminal" size={18} color="#a1a1aa" />
								)}
								<UIText modifiers={[lineLimit(1)]}>{row.title}</UIText>
								<Spacer />
								{attentionColor ? (
									<Image
										systemName="circle.fill"
										size={9}
										color={attentionColor}
									/>
								) : null}
							</HStack>
						);
					})}
				</List.ForEach>
			</List>
		</Host>
	);
}
