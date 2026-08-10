"use client";

import { PaperclipIcon, XIcon } from "lucide-react";
import type { LexicalComposerAttachment } from "../../types";
import { formatBytes } from "../../utils/formatBytes";

export type AttachmentPillsProps = {
	attachments: LexicalComposerAttachment[];
	onRemove: (id: string) => void;
};

export function AttachmentPills({
	attachments,
	onRemove,
}: AttachmentPillsProps) {
	if (attachments.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-1.5 px-3 pt-3">
			{attachments.map((attachment) => (
				<span
					key={attachment.id}
					className="flex items-center gap-1.5 rounded-lg bg-secondary px-2 py-1 text-xs text-secondary-foreground"
				>
					<PaperclipIcon className="size-3.5 text-muted-foreground" />
					<span className="max-w-40 truncate">{attachment.file.name}</span>
					<span className="text-muted-foreground">
						{formatBytes(attachment.file.size)}
					</span>
					<button
						type="button"
						aria-label={`Remove ${attachment.file.name}`}
						className="cursor-pointer text-muted-foreground hover:text-foreground"
						onClick={() => onRemove(attachment.id)}
					>
						<XIcon className="size-3.5" />
					</button>
				</span>
			))}
		</div>
	);
}
