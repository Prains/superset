"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { ImageIcon, PaperclipIcon, PlusIcon } from "lucide-react";
import type { RefObject } from "react";

export type PlusMenuProps = {
	onFiles: (files: FileList) => void;
	fileInputRef: RefObject<HTMLInputElement | null>;
};

export function PlusMenu({ onFiles, fileInputRef }: PlusMenuProps) {
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label="Add"
						className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<PlusIcon className="size-4.5" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
						<PaperclipIcon className="size-4" />
						Photos & files
					</DropdownMenuItem>
					<DropdownMenuItem disabled>
						<ImageIcon className="size-4" />
						Screenshot
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				className="hidden"
				onChange={(event) => {
					if (event.target.files) onFiles(event.target.files);
					event.target.value = "";
				}}
			/>
		</>
	);
}
