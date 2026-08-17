import type { TriggerConfigInput } from "@superset/shared/automation-triggers";
import {
	DropdownMenuItem,
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import type { TriggerMenuEntry } from "../triggerMenu";

/**
 * Renders the trigger menu tree, at any depth.
 *
 * Recursive rather than one level per provider: GitHub already nests twice
 * ("PR review submitted…" → "Approved"), and the next provider will nest
 * differently.
 */
export function TriggerMenuItems({
	entries,
	onPick,
}: {
	entries: TriggerMenuEntry[];
	onPick: (config: TriggerConfigInput) => void;
}) {
	return (
		<>
			{entries.map((entry) => {
				const Icon = entry.icon;

				if (entry.children) {
					return (
						<DropdownMenuSub key={entry.label}>
							<DropdownMenuSubTrigger>
								{Icon && <Icon className="size-3.5 opacity-60" />}
								{entry.label}
							</DropdownMenuSubTrigger>
							<DropdownMenuPortal>
								<DropdownMenuSubContent className="max-h-96 overflow-y-auto">
									<TriggerMenuItems entries={entry.children} onPick={onPick} />
								</DropdownMenuSubContent>
							</DropdownMenuPortal>
						</DropdownMenuSub>
					);
				}

				const config = entry.config;
				if (!config) return null;

				return (
					<DropdownMenuItem key={entry.label} onSelect={() => onPick(config())}>
						{Icon && <Icon className="size-3.5 opacity-60" />}
						{entry.label}
					</DropdownMenuItem>
				);
			})}
		</>
	);
}
