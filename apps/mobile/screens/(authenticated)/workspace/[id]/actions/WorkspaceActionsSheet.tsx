import { useLocalSearchParams, useRouter } from "expo-router";
import {
	CopyIcon,
	PencilIcon,
	Share2Icon,
	Trash2Icon,
} from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { useWorkspaceHeaderActions } from "../hooks/useWorkspaceHeaderActions";

/**
 * Bottom action sheet for a workspace, opened by tapping the header title.
 * Holds the workspace-level actions that used to live in the header's
 * ellipsis menu — a roomier, thumb-friendlier home (the Cursor pattern).
 */
export function WorkspaceActionsSheet() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const theme = useTheme();
	const { workspace, host } = useWorkspaceHost(id ?? null);
	const { renameWorkspace, deleteWorkspace, copyId, shareWorkspace } =
		useWorkspaceHeaderActions(workspace, host);

	const iconColor = theme.mutedForeground;
	const canDelete = workspace ? workspace.type !== "main" : false;

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-5"
			contentInsetAdjustmentBehavior="automatic"
		>
			<View className="border-border border-b pb-4 pt-1">
				<Text className="text-xl font-semibold" numberOfLines={1}>
					{workspace?.name ?? ""}
				</Text>
				{workspace ? (
					<Text
						className="text-muted-foreground mt-0.5 font-mono text-xs"
						numberOfLines={1}
					>
						{workspace.branch}
					</Text>
				) : null}
			</View>
			<ListRow
				icon={<PencilIcon size={19} color={iconColor} />}
				label="Edit name"
				onPress={() => void renameWorkspace()}
			/>
			<ListRow
				icon={<CopyIcon size={19} color={iconColor} />}
				label="Copy ID"
				onPress={copyId}
			/>
			<ListRow
				icon={<Share2Icon size={19} color={iconColor} />}
				label="Share"
				onPress={shareWorkspace}
				isLast={!canDelete}
			/>
			{canDelete ? (
				<ListRow
					icon={<Trash2Icon size={19} color={theme.destructive} />}
					label="Delete workspace"
					destructive
					onPress={() => {
						router.back();
						deleteWorkspace();
					}}
					isLast
				/>
			) : null}
		</ScrollView>
	);
}
