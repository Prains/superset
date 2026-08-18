import { prompt } from "@superset/alert-prompt";
import * as Clipboard from "expo-clipboard";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Alert, Share } from "react-native";
import { useCloudWorkspaceActions } from "@/hooks/useCloudWorkspaceActions";
import type { CloudWorkspaceStatus } from "@/hooks/useCloudWorkspaceItems";
import type {
	HostWorkspaceItem,
	HostWorkspacesCacheOps,
} from "@/hooks/useHostWorkspaces";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { isTrpcErrorWithData } from "@/lib/host-service/errors";
import { workspaceShareUrl } from "@/lib/web-links";

export function WorkspaceRowMenu({
	workspace,
	cache,
	cloudStatus,
	children,
}: {
	workspace: HostWorkspaceItem;
	cache: HostWorkspacesCacheOps;
	/** Set for a cloud workspace, whose name and lifetime the API owns. */
	cloudStatus?: CloudWorkspaceStatus;
	children: ReactNode;
}) {
	const cloud = useCloudWorkspaceActions();
	const isCloud = cloudStatus !== undefined;

	const renameWorkspace = async () => {
		const hostUrl = isCloud ? null : cache.resolveHostUrl(workspace.hostId);
		if (!isCloud && !hostUrl) {
			Alert.alert("Host is not online");
			return;
		}
		const name = await prompt({
			title: "Rename workspace",
			defaultValue: workspace.name,
			confirmText: "Rename",
			selectText: true,
		});
		const trimmed = name?.trim();
		if (!trimmed || trimmed === workspace.name) return;
		try {
			if (isCloud) {
				await cloud.rename(workspace.id, trimmed);
				return;
			}
			if (hostUrl) {
				await getHostServiceClientByUrl(hostUrl).workspace.update.mutate({
					id: workspace.id,
					name: trimmed,
				});
			}
		} catch {
			Alert.alert("Rename failed");
		}
		cache.invalidateHost(workspace.hostId);
	};

	const deleteCloudWorkspace = () => {
		Alert.alert(
			"Delete cloud workspace",
			`Delete "${workspace.name}"? This shuts down its sandbox and everything in it.`,
			[
				{ style: "cancel", text: "Cancel" },
				{
					onPress: () =>
						void cloud.remove(workspace.id).catch(() => {
							Alert.alert("Delete failed");
						}),
					style: "destructive",
					text: "Delete",
				},
			],
		);
	};

	const destroyWorkspace = async (force: boolean) => {
		const hostUrl = cache.resolveHostUrl(workspace.hostId);
		if (!hostUrl) {
			Alert.alert("Host is not online");
			return;
		}
		try {
			await getHostServiceClientByUrl(hostUrl).workspaceCleanup.destroy.mutate({
				workspaceId: workspace.id,
				deleteBranch: false,
				force,
			});
			cache.removeWorkspace(workspace.hostId, workspace.id);
		} catch (error) {
			if (isTrpcErrorWithData(error)) {
				if (error.data.deleteInProgress) {
					Alert.alert("Delete already in progress");
					return;
				}
				if (error.data.code === "CONFLICT" || error.data.teardownFailure) {
					Alert.alert(
						error.data.teardownFailure
							? "Teardown script failed"
							: "Worktree has uncommitted changes",
						undefined,
						[
							{ style: "cancel", text: "Cancel" },
							{
								onPress: () => void destroyWorkspace(true),
								style: "destructive",
								text: "Force delete",
							},
						],
					);
					return;
				}
			}
			Alert.alert("Delete failed");
		}
	};

	const deleteWorkspace = () => {
		if (isCloud) {
			deleteCloudWorkspace();
			return;
		}
		if (!cache.resolveHostUrl(workspace.hostId)) {
			Alert.alert("Host is not online");
			return;
		}
		Alert.alert(
			"Delete workspace",
			`Delete "${workspace.name}"? This removes its worktree from the host.`,
			[
				{ style: "cancel", text: "Cancel" },
				{
					onPress: () => void destroyWorkspace(false),
					style: "destructive",
					text: "Delete",
				},
			],
		);
	};

	// Tap navigation lives on the row itself; the Link exists solely because
	// Link.Menu must be a direct child of Link, so tap is a no-op here.
	return (
		<Link
			href="/(authenticated)/(home)"
			onPress={(event) => event.preventDefault()}
			asChild
		>
			<Link.Trigger>{children}</Link.Trigger>
			<Link.Menu>
				{/* A sandbox that doesn't exist yet has nothing to rename or delete;
				    a failed one only needs disposing of. A cloud workspace is
				    served as `main` because its checkout is the repo, but deleting
				    it deletes the sandbox, not a base checkout. Each action is its
				    own direct child: Link.Menu drops anything wrapped in a Fragment. */}
				{cloudStatus === undefined || cloudStatus === "ready" ? (
					<Link.MenuAction icon="pencil" onPress={() => void renameWorkspace()}>
						Rename
					</Link.MenuAction>
				) : null}
				{cloudStatus === "provisioning" ||
				(!isCloud && workspace.type === "main") ? null : (
					<Link.MenuAction icon="trash" onPress={deleteWorkspace}>
						Delete
					</Link.MenuAction>
				)}
				<Link.Menu inline>
					<Link.MenuAction
						icon="doc.on.doc"
						onPress={() => void Clipboard.setStringAsync(workspace.id)}
					>
						Copy ID
					</Link.MenuAction>
					<Link.MenuAction
						icon="square.and.arrow.up"
						onPress={() =>
							void Share.share({
								url: workspaceShareUrl(workspace.id),
							})
						}
					>
						Share
					</Link.MenuAction>
				</Link.Menu>
			</Link.Menu>
		</Link>
	);
}
