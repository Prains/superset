export interface SamplePrompt {
	id: string;
	/** Short row label shown in the UI, and the card title. */
	label: string;
	/** Card-only supporting line; the row layout shows the label alone. */
	description: string;
	/** Full instruction inserted into the composer on click. */
	prompt: string;
}

/**
 * Fixed, curated order — every arm of the prompt-cards experiment slices a
 * prefix of this list, so the sets are nested (2 cards ⊂ 3 rows ⊂ 4 cards) and
 * the only thing that varies between arms is form factor, not content.
 *
 * Setup leads when the project needs it and drops out entirely when it does
 * not, which shifts everything up by one — that is why the pool is five and
 * not four: the last entry is only reachable in the 4-card arm of an
 * already-configured project.
 */
export const SAMPLE_PROMPTS: SamplePrompt[] = [
	{
		id: "set-up-project",
		label: "Set up this project for Superset",
		description:
			"Write setup and teardown scripts so every new workspace starts ready to run.",
		prompt: `Set up this repository to work well with Superset workspaces. Read https://docs.superset.sh/setup-teardown-scripts and create a .superset/config.json with: setup commands that install dependencies and copy untracked files (like .env) from "$SUPERSET_ROOT_PATH" into new workspaces, teardown commands that stop anything setup starts, and a run command that launches the dev server. If parallel workspaces would collide on dev-server ports, make the scripts pick a free port per workspace (see https://docs.superset.sh/ports). When you're done, summarize what you configured and how to use it.`,
	},
	{
		id: "explain-repo",
		label: "Explain to me how this repository works",
		description:
			"Get an architecture tour: entry points, how to run it, what to read first.",
		prompt:
			"Explain how this repository works: the overall architecture, the main entry points, how to run it locally, and what I should read first to get productive. Keep it practical and concrete.",
	},
	{
		id: "fix-small-bug",
		label: "Find and fix a small bug",
		description:
			"Pick a low-risk papercut, fix it, and explain how it was verified.",
		prompt:
			"Find a small, low-risk bug or papercut in this codebase and fix it. Keep the change minimal, explain what the bug was, and describe how you verified the fix.",
	},
	{
		id: "add-missing-tests",
		label: "Add tests where they're missing",
		description:
			"Find recently changed code with weak coverage and test it properly.",
		prompt:
			"Look at recently changed or complex code in this repository that lacks test coverage. Pick the highest-risk gap, write focused tests for it following the project's existing test conventions, and make sure they pass. Explain what you covered and why it mattered most.",
	},
	{
		id: "improve-agent-docs",
		label: "Improve the agent instructions",
		description:
			"Audit AGENTS.md / CLAUDE.md against the codebase and fill the gaps.",
		prompt:
			"Review this repository's agent instruction files (AGENTS.md, CLAUDE.md, or similar). Compare them against how the codebase actually works today: commands, structure, conventions. Fix anything stale, and add the few things a coding agent most often needs and can't easily discover. Create the file if none exists. Keep it concise.",
	},
];

/**
 * The prompts an arm should show, in order. `needsSetup` is the project's
 * `shouldShowSetupCard` verdict: pitching setup at a project that already has
 * setup/teardown/run commands reads as noise, so it is dropped rather than
 * demoted.
 */
export function selectSamplePrompts(
	needsSetup: boolean,
	count: number,
): SamplePrompt[] {
	return SAMPLE_PROMPTS.filter(
		(sample) => sample.id !== "set-up-project" || needsSetup,
	).slice(0, count);
}

/**
 * Composer ghost text: one is picked per screen-open so the empty state
 * suggests a concrete next action instead of a static question.
 */
export const PROMPT_PLACEHOLDERS: string[] = [
	"What do you want to do?",
	"Find a small bug and fix it…",
	"Add tests for the riskiest untested code…",
	"Explain how this repository works…",
	"Track down that flaky test…",
	"Upgrade a dependency and fix what breaks…",
	"Clean up stale TODOs…",
	"Write docs for the part everyone asks about…",
];
