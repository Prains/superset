"use client";

import { cn } from "@superset/ui/utils";
import {
	FileArchiveIcon,
	FileCode2Icon,
	FileJson2Icon,
	FileTextIcon,
	XIcon,
} from "lucide-react";
import type { JSX } from "react";
import type { LexicalComposerAttachment } from "../../types";

export type AttachmentPillsProps = {
	attachments: LexicalComposerAttachment[];
	onRemove: (id: string) => void;
	onPreviewError?: (id: string) => void;
	onAttachmentClick?: (attachment: LexicalComposerAttachment) => void;
};

const CODE_EXTENSIONS = new Set([
	"ts",
	"tsx",
	"js",
	"jsx",
	"py",
	"rs",
	"go",
	"rb",
	"swift",
	"css",
	"html",
	"sh",
]);
const DATA_EXTENSIONS = new Set(["json", "yaml", "yml", "toml", "lock"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "tar", "gz", "tgz", "7z", "rar"]);

function fileTypeIcon(extension: string): JSX.Element {
	const lowered = extension.toLowerCase();
	if (CODE_EXTENSIONS.has(lowered))
		return <FileCode2Icon className="size-5 text-muted-foreground" />;
	if (DATA_EXTENSIONS.has(lowered))
		return <FileJson2Icon className="size-5 text-muted-foreground" />;
	if (ARCHIVE_EXTENSIONS.has(lowered))
		return <FileArchiveIcon className="size-5 text-muted-foreground" />;
	return <FileTextIcon className="size-5 text-muted-foreground" />;
}

function RemoveButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			aria-label="Remove attachment"
			className="absolute top-1 right-1 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
			onClick={onClick}
		>
			<XIcon className="size-3" />
		</button>
	);
}

export function AttachmentPills({
	attachments,
	onRemove,
	onPreviewError,
	onAttachmentClick,
}: AttachmentPillsProps) {
	if (attachments.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-2 px-3 pt-3">
			{attachments.map((attachment) => {
				const filename = attachment.file.name || "attachment";
				const dotIndex = filename.lastIndexOf(".");
				const extension =
					dotIndex > 0 ? filename.slice(dotIndex + 1).toUpperCase() : "";
				if (attachment.previewUrl) {
					return (
						<div key={attachment.id} className="relative shrink-0">
							<button
								type="button"
								aria-label={filename}
								disabled={!onAttachmentClick}
								className={cn(
									"relative block size-16 overflow-hidden rounded-xl border-[0.5px] border-border bg-foreground/[0.04]",
									onAttachmentClick && "cursor-pointer",
								)}
								onClick={() => onAttachmentClick?.(attachment)}
							>
								<img
									src={attachment.previewUrl}
									alt={filename}
									className="size-full object-cover"
									onError={() => onPreviewError?.(attachment.id)}
								/>
							</button>
							<RemoveButton onClick={() => onRemove(attachment.id)} />
						</div>
					);
				}
				return (
					<div key={attachment.id} className="relative shrink-0">
						<button
							type="button"
							disabled={!onAttachmentClick}
							onClick={() => onAttachmentClick?.(attachment)}
							className={cn(
								"relative flex h-16 w-[200px] items-center gap-2.5 rounded-xl border-[0.5px] border-border bg-foreground/[0.03] px-2.5 text-left",
								onAttachmentClick &&
									"cursor-pointer transition-colors hover:bg-foreground/[0.06]",
							)}
						>
							<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06]">
								{fileTypeIcon(extension)}
							</div>
							<div className="min-w-0 flex-1 pr-3">
								<div className="truncate text-xs text-foreground">
									{filename}
								</div>
								{extension && (
									<div className="text-[10px] text-muted-foreground">
										{extension}
									</div>
								)}
							</div>
						</button>
						<RemoveButton onClick={() => onRemove(attachment.id)} />
					</div>
				);
			})}
		</div>
	);
}
