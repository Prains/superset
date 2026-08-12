import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface AddIssuesDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	factoryId: string;
	repoFullName: string;
	onAdded: () => void;
}

interface ParsedIssue {
	source: "github_issue" | "github_pr";
	number: number;
	title: string;
	url: string;
}

const ISSUE_URL_PATTERN =
	/https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(issues|pull)\/(\d+)/;

/** One issue per line: URL, optionally followed by a title. */
function parseLines(
	text: string,
	repoFullName: string,
): { issues: ParsedIssue[]; wrongRepo: number; invalid: number } {
	const issues: ParsedIssue[] = [];
	let wrongRepo = 0;
	let invalid = 0;
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		const match = line.match(ISSUE_URL_PATTERN);
		if (!match) {
			invalid += 1;
			continue;
		}
		const [url, repo, kind, numberText] = match;
		if (repo.toLowerCase() !== repoFullName.toLowerCase()) {
			wrongRepo += 1;
			continue;
		}
		const number = Number(numberText);
		const title = line.slice((match.index ?? 0) + url.length).trim();
		issues.push({
			source: kind === "pull" ? "github_pr" : "github_issue",
			number,
			title: title || `${kind === "pull" ? "PR" : "Issue"} #${number}`,
			url,
		});
	}
	return { issues, wrongRepo, invalid };
}

export function AddIssuesDialog({
	open,
	onOpenChange,
	factoryId,
	repoFullName,
	onAdded,
}: AddIssuesDialogProps) {
	const [text, setText] = useState("");
	const parsed = useMemo(
		() => parseLines(text, repoFullName),
		[text, repoFullName],
	);

	const intake = useMutation({
		mutationFn: () =>
			apiTrpcClient.factory.intake.mutate({
				factoryId,
				issues: parsed.issues,
			}),
		onSuccess: ({ created, skipped }) => {
			toast.success(
				`Added ${created} item${created === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} already in the factory)` : ""}`,
			);
			setText("");
			onOpenChange(false);
			onAdded();
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add issues</DialogTitle>
					<DialogDescription>
						One GitHub issue or PR URL per line from {repoFullName}, optionally
						followed by a title. Re-adding an existing item is a no-op.
					</DialogDescription>
				</DialogHeader>
				<Textarea
					value={text}
					onChange={(event) => setText(event.target.value)}
					rows={8}
					placeholder={`https://github.com/${repoFullName}/issues/123 Add blockedDomains option`}
					className="font-mono text-xs"
				/>
				<div className="flex items-center gap-3 text-xs text-muted-foreground">
					<span>{parsed.issues.length} parsed</span>
					{parsed.wrongRepo > 0 && (
						<span className="text-amber-600 dark:text-amber-400">
							{parsed.wrongRepo} skipped (different repo)
						</span>
					)}
					{parsed.invalid > 0 && <span>{parsed.invalid} unrecognized</span>}
				</div>
				<DialogFooter>
					<Button
						disabled={parsed.issues.length === 0 || intake.isPending}
						onClick={() => intake.mutate()}
					>
						Add {parsed.issues.length > 0 ? parsed.issues.length : ""} to intake
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
