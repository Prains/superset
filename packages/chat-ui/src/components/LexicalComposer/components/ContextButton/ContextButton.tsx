"use client";

import { PlusIcon } from "lucide-react";

export type ContextButtonProps = {
	onClick: () => void;
};

// Click-equivalent of typing "@": opens the mention menu in browse mode.
export function ContextButton({ onClick }: ContextButtonProps) {
	return (
		<button
			type="button"
			aria-label="Add files, apps, and more"
			title="Add files, apps, and more (@)"
			onClick={onClick}
			className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			<PlusIcon className="size-4.5" />
		</button>
	);
}
