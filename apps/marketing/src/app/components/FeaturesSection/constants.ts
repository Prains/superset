export interface Feature {
	tag: string;
	title: string;
	description: string;
}

export const FEATURES: Feature[] = [
	{
		tag: "Parallel Execution",
		title: "Run dozens of agents at once",
		description:
			"Launch multiple AI coding agents across different tasks. Work on features, fix bugs, and refactor code, all in parallel.",
	},
	{
		tag: "Universal Compatibility",
		title: "Works with any CLI agent",
		description:
			"Superset is agent-agnostic. Use Claude Code, OpenCode, Cursor, or any CLI-based coding tool. Switch agents whenever you want.",
	},
	{
		tag: "Isolation",
		title: "Changes are isolated",
		description:
			"Each agent runs in its own isolated Git worktree. No merge conflicts, no stepping on each other's changes. Review and merge work when you're ready.",
	},
	{
		tag: "Open Anywhere",
		title: "Open in any IDE",
		description:
			"Jump into your favorite editor with one click. VS Code, Cursor, Xcode, JetBrains IDEs, or any terminal: open worktrees exactly where you need them.",
	},
	{
		tag: "Automations",
		title: "Put recurring work on a schedule",
		description:
			"Turn chores into scheduled agents: issue triage, changelog drafts, dependency bumps. They run on their own and open PRs for you to review.",
	},
	{
		tag: "Remote Workspaces",
		title: "Run workspaces anywhere",
		description:
			"Connect any machine over SSH. Workspaces keep running when your laptop sleeps, and you can check in from wherever you are.",
	},
];
