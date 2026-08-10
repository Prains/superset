import type { SelectAutomation } from "@superset/db/schema";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { EmojiTextInput } from "renderer/components/EmojiTextInput";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useProjectFileSearch } from "../../../hooks/useProjectFileSearch";

export function AutomationBody({
	automation,
	ownerName,
	readOnly,
	onToggleEnabled,
	toggleDisabled,
}: {
	automation: SelectAutomation;
	ownerName?: string | null;
	readOnly?: boolean;
	onToggleEnabled: (enabled: boolean) => void;
	toggleDisabled?: boolean;
}) {
	const [name, setName] = useState(automation.name);
	const [prompt, setPrompt] = useState(automation.prompt);
	const lastSyncedPromptRef = useRef(automation.prompt);
	const queryClient = useQueryClient();

	useEffect(() => {
		if (automation.prompt !== lastSyncedPromptRef.current) {
			lastSyncedPromptRef.current = automation.prompt;
			setPrompt(automation.prompt);
		}
	}, [automation.prompt]);

	const updateMutation = useMutation({
		mutationFn: (patch: { name?: string }) =>
			apiTrpcClient.automation.update.mutate({ id: automation.id, ...patch }),
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to update automation",
			),
	});

	const setPromptMutation = useMutation({
		mutationFn: (next: string) =>
			apiTrpcClient.automation.setPrompt.mutate({
				id: automation.id,
				prompt: next,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["automation-versions", automation.id],
			});
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to update prompt",
			),
	});

	const searchFiles = useProjectFileSearch({
		hostId: automation.targetHostId ?? null,
		projectId: automation.v2ProjectId,
	});

	return (
		<div className="flex-1 overflow-y-auto px-8 py-8">
			<div className="mx-auto flex w-full max-w-3xl flex-col">
				<EmojiTextInput
					value={name}
					onChange={setName}
					editable={!readOnly}
					onBlur={(next) => {
						if (readOnly) return;
						const trimmed = next.trim();
						if (trimmed && trimmed !== automation.name) {
							updateMutation.mutate({ name: trimmed });
						}
					}}
					placeholder="Automation title"
					className="mb-3 text-2xl font-semibold"
				/>
				<div className="mb-8 flex items-center gap-2 text-sm">
					<Switch
						checked={automation.enabled}
						onCheckedChange={onToggleEnabled}
						disabled={readOnly || toggleDisabled}
						aria-label={
							automation.enabled ? "Pause automation" : "Resume automation"
						}
					/>
					<span className="text-muted-foreground">
						{automation.enabled ? "Active" : "Paused"}
					</span>
					{ownerName && (
						<>
							<span className="text-border">|</span>
							<span className="text-muted-foreground">{ownerName}</span>
						</>
					)}
				</div>
				<span className="mb-2 text-xs font-medium text-muted-foreground">
					Instructions
				</span>
				<MarkdownEditor
					content={prompt}
					onChange={setPrompt}
					editable={!readOnly}
					onSave={(next) => {
						if (readOnly) return;
						if (next !== automation.prompt) {
							setPromptMutation.mutate(next);
						}
					}}
					placeholder="Add prompt e.g. look for crashes in $sentry"
					searchFiles={searchFiles}
				/>
			</div>
		</div>
	);
}
