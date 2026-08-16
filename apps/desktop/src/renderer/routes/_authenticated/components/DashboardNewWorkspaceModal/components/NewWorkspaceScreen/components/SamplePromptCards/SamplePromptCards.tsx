import { useQuery } from "@tanstack/react-query";
import {
	BookOpenIcon,
	BugIcon,
	FlaskConicalIcon,
	ListChecksIcon,
	ScrollTextIcon,
	WrenchIcon,
} from "lucide-react";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { track } from "renderer/lib/analytics";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { SAMPLE_PROMPTS } from "../SamplePrompts/constants";

const CARD_ICONS: Record<string, typeof WrenchIcon> = {
	"set-up-project": WrenchIcon,
	"explain-repo": BookOpenIcon,
	"fix-small-bug": BugIcon,
	"improve-agent-docs": ScrollTextIcon,
	"add-missing-tests": FlaskConicalIcon,
	"clean-up-todos": ListChecksIcon,
};

const CARD_COUNT = 4;

/** Overlapping real agent logos — the agent-docs card is about the agents
 * themselves, so their marks carry more signal than a generic glyph. */
function AgentLogoCluster() {
	const claudeIcon = usePresetIcon("claude");
	const codexIcon = usePresetIcon("codex");
	if (!claudeIcon || !codexIcon) {
		return (
			<ScrollTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
		);
	}
	return (
		<span className="flex shrink-0 items-center">
			<img src={claudeIcon} alt="" className="size-3.5 object-contain" />
			<img src={codexIcon} alt="" className="-ml-1 size-3.5 object-contain" />
		</span>
	);
}

interface SamplePromptCardsProps {
	hostUrl: string | null;
	projectId: string | null;
	onSelect: (prompt: string) => void;
}

export function SamplePromptCards({
	hostUrl,
	projectId,
	onSelect,
}: SamplePromptCardsProps) {
	// Setup takes 75% of all prompt clicks, so it leads — but pitching setup for
	// a project that already has setup/teardown/run commands reads as noise.
	// Same query the v2 sidebar setup card uses.
	const canCheckSetup = Boolean(hostUrl && projectId);
	const { data: needsSetupScripts, isPending } = useQuery({
		queryKey: ["host-config", "shouldShowSetupCard", hostUrl, projectId],
		queryFn: () =>
			hostUrl && projectId
				? getHostServiceClientByUrl(hostUrl).config.shouldShowSetupCard.query({
						projectId,
					})
				: false,
		enabled: canCheckSetup,
	});

	// Deciding mid-flight would swap a card out from under the pointer.
	if (canCheckSetup && isPending) return null;

	const cards = SAMPLE_PROMPTS.filter(
		(sample) => sample.id !== "set-up-project" || needsSetupScripts === true,
	).slice(0, CARD_COUNT);

	return (
		<div className="px-1 pb-2">
			<div className="grid grid-cols-2 gap-1.5 rounded-2xl border-[0.5px] border-border/60 bg-foreground/[0.03] p-1.5">
				{cards.map((sample) => {
					const Icon = CARD_ICONS[sample.id] ?? WrenchIcon;
					return (
						<button
							key={sample.id}
							type="button"
							className="flex cursor-pointer flex-col items-start gap-1.5 rounded-[11px] bg-background/70 p-3 text-left transition-colors hover:bg-foreground/[0.06]"
							onClick={() => {
								track("new_workspace_sample_prompt_clicked", {
									prompt_id: sample.id,
									layout: "cards",
								});
								onSelect(sample.prompt);
							}}
						>
							{sample.id === "improve-agent-docs" ? (
								<AgentLogoCluster />
							) : (
								<Icon className="size-3.5 shrink-0 text-muted-foreground" />
							)}
							<span className="text-sm font-medium text-foreground/90">
								{sample.label}
							</span>
							<span className="text-xs text-muted-foreground">
								{sample.description}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
