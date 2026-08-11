"use client";

interface SelectorPillProps {
	label: string;
	active?: boolean;
	onSelect?: () => void;
}

export function SelectorPill({
	label,
	active = false,
	onSelect,
}: SelectorPillProps) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onMouseEnter={onSelect}
			onClick={onSelect}
			className={`flex items-center shrink-0 lg:w-full px-3 py-2 lg:py-2.5 text-left text-xs sm:text-sm whitespace-nowrap cursor-pointer transition-colors duration-200 ${
				active
					? "bg-dither text-accent-foreground"
					: "text-muted-foreground hover:text-foreground"
			}`}
		>
			<span className={active ? "text-halo" : undefined}>{label}</span>
		</button>
	);
}
