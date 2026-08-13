import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
	CopyIcon,
	PencilIcon,
	Share2Icon,
	Trash2Icon,
} from "lucide-react-native";
import { ScrollView } from "react-native";
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
			contentContainerClassName="px-5 pb-8"
			contentInsetAdjustmentBehavior="automatic"
		>
			<Stack.Screen options={{ title: workspace?.name ?? "Workspace" }} />
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					icon="xmark"
					accessibilityLabel="Close"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			{workspace ? (
				<Text
					className="text-muted-foreground pb-2 text-center font-mono text-xs"
					numberOfLines={1}
				>
					{workspace.branch}
				</Text>
			) : null}
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
