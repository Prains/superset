import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Spinner } from "@superset/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { VscListFlat } from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface CommitMessagePopoverProps {
	worktreePath: string;
	commitHash: string;
	shortHash: string;
	/** Subject from the commit list, shown until the full message loads. */
	subject: string;
}

/**
 * The commit list only carries the subject line (`git log --format=%s`), so the
 * body is fetched on demand when the popover opens. Commit messages are
 * immutable, so the result never needs to be refetched.
 */
export function CommitMessagePopover({
	worktreePath,
	commitHash,
	shortHash,
	subject,
}: CommitMessagePopoverProps) {
	const [open, setOpen] = useState(false);

	const { data, isPending, isError } =
		electronTrpc.changes.getCommitMessage.useQuery(
			{ worktreePath, commitHash },
			{ enabled: open, staleTime: Number.POSITIVE_INFINITY },
		);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						type="button"
						aria-label={`View full commit message for ${shortHash}`}
						className="mr-1 shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
					>
						<VscListFlat className="size-3" />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="left">Full commit message</TooltipContent>
			</Tooltip>
			<PopoverContent
				align="end"
				side="left"
				className="max-h-80 w-96 overflow-y-auto p-3"
			>
				<div className="select-text cursor-text space-y-2">
					<div className="flex items-baseline gap-2">
						<span className="shrink-0 font-mono text-[10px] text-muted-foreground">
							{shortHash}
						</span>
						<span className="wrap-break-word font-medium text-xs">
							{data?.subject || subject}
						</span>
					</div>
					{isPending ? (
						<div className="flex items-center gap-2 text-muted-foreground text-xs">
							<Spinner className="size-3" />
							<span>Loading full message…</span>
						</div>
					) : isError ? (
						<p className="text-destructive text-xs">
							Could not read the commit message.
						</p>
					) : data?.body ? (
						<p className="whitespace-pre-wrap wrap-break-word font-mono text-muted-foreground text-xs">
							{data.body}
						</p>
					) : (
						<p className="text-muted-foreground text-xs italic">
							No additional description.
						</p>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
