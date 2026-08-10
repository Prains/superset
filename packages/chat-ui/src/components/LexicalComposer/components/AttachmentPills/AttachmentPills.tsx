"use client";

import {
	FileArchiveIcon,
	FileCode2Icon,
	FileJson2Icon,
	FileTextIcon,
	XIcon,
} from "lucide-react";
import { type JSX, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { LexicalComposerAttachment } from "../../types";

export type AttachmentPillsProps = {
	attachments: LexicalComposerAttachment[];
	onRemove: (id: string) => void;
	onPreviewError?: (id: string) => void;
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

function ImagePreviewOverlay({
	src,
	filename,
	onClose,
}: {
	src: string;
	filename: string;
	onClose: () => void;
}) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	return createPortal(
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled globally above
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismissal
		<div
			className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-background/80 p-10 backdrop-blur-sm"
			onClick={onClose}
		>
			<img
				src={src}
				alt={filename}
				className="max-h-full max-w-full rounded-xl shadow-2xl"
			/>
		</div>,
		document.body,
	);
}

export function AttachmentPills({
	attachments,
	onRemove,
	onPreviewError,
}: AttachmentPillsProps) {
	const [previewId, setPreviewId] = useState<string | null>(null);
	if (attachments.length === 0) return null;
	const previewAttachment = attachments.find(
		(attachment) => attachment.id === previewId && attachment.previewUrl,
	);
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
								aria-label={`Preview ${filename}`}
								className="relative block size-16 cursor-zoom-in overflow-hidden rounded-xl border-[0.5px] border-border bg-foreground/[0.04]"
								onClick={() => setPreviewId(attachment.id)}
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
						<div className="relative flex h-16 w-[200px] items-center gap-2.5 rounded-xl border-[0.5px] border-border bg-foreground/[0.03] px-2.5">
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
						</div>
						<RemoveButton onClick={() => onRemove(attachment.id)} />
					</div>
				);
			})}
			{previewAttachment?.previewUrl && (
				<ImagePreviewOverlay
					src={previewAttachment.previewUrl}
					filename={previewAttachment.file.name}
					onClose={() => setPreviewId(null)}
				/>
			)}
		</div>
	);
}
