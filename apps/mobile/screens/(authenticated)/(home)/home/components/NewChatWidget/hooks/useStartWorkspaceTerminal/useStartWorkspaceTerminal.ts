import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";
import { getHostTerminalsQueryKey } from "../../../../hooks/useHostTerminals";
import type { ChatTarget } from "../../../../stores/chatTargetStore";

/**
 * Prompt an existing workspace: deliver into its live claude terminal via the
 * host's bracketed-paste `terminal.send` when one is attached, otherwise
 * launch a fresh agent run (`agents.run` bakes the prompt into the launch
 * command), then open the terminal.
 */
export function useStartWorkspaceTerminal(workspaces: HostWorkspaceItem[]) {
	const router = useRouter();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			target,
			message,
			modelId,
		}: {
			target: ChatTarget;
			message: PromptInputMessage;
			modelId: string;
		}) => {
			const workspace = workspaces.find(
				(item) => item.id === target.workspaceId,
			);
			if (!workspace) throw new Error("Workspace is not available");
			if (message.attachments.length > 0) {
				throw new Error(
					"Attachments are not supported in terminal sessions yet",
				);
			}
			const hostUrl = buildRelayHostUrl(
				workspace.organizationId,
				target.hostId,
			);
			const client = getHostServiceClientByUrl(hostUrl);
			const text = message.text.trim();

			const active = await client.terminalAgents.findActive.query({
				workspaceId: target.workspaceId,
				agentId: "claude",
			});
			if (active) {
				await client.terminal.send.mutate({
					terminalId: active.terminalId,
					workspaceId: target.workspaceId,
					text,
				});
				return {
					workspaceId: target.workspaceId,
					terminalId: active.terminalId,
					hostId: target.hostId,
				};
			}

			const result = await client.agents.run.mutate({
				workspaceId: target.workspaceId,
				agent: "claude",
				prompt: text,
				model: modelId,
			});
			if (result.kind !== "terminal") {
				throw new Error(`${result.label} did not start a terminal session`);
			}
			return {
				workspaceId: target.workspaceId,
				terminalId: result.sessionId,
				hostId: target.hostId,
			};
		},
		onSuccess: ({ workspaceId, terminalId, hostId }) => {
			void queryClient.invalidateQueries({
				queryKey: getHostTerminalsQueryKey(hostId),
			});
			router.push(
				`/(authenticated)/workspace/${workspaceId}/terminal/${terminalId}`,
			);
		},
		onError: (error) => {
			Alert.alert(
				"Could not start agent",
				error instanceof Error ? error.message : String(error),
			);
		},
	});
}
