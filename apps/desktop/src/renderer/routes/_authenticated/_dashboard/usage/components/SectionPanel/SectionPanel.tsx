import type { ReactNode } from "react";

/**
 * Bordered dashboard panel with a title/caption header — the section idiom
 * usage dashboards converge on (Cursor's "Included Usage Summary" panel,
 * Supabase's billing sections): every block is a titled card, captions carry
 * the fine print instead of floating footnotes.
 */
export function SectionPanel({
	title,
	caption,
	actions,
	children,
}: {
	title: string;
	caption?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="overflow-hidden rounded-xl border bg-card/40">
			<header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card/60 px-4 py-3">
				<div className="min-w-0">
					<h2 className="text-sm font-semibold">{title}</h2>
					{caption && (
						<p className="mt-0.5 text-[11px] text-muted-foreground">
							{caption}
						</p>
					)}
				</div>
				{actions && (
					<div className="ml-auto flex shrink-0 items-center gap-2">
						{actions}
					</div>
				)}
			</header>
			<div className="p-4">{children}</div>
		</section>
	);
}
