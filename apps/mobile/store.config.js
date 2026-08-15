// Dynamic so the demo-account credentials never enter the repo:
// set APP_REVIEW_EMAIL / APP_REVIEW_PASSWORD when running `eas metadata:push`.
module.exports = {
	configVersion: 0,
	apple: {
		version: "1.0.0",
		copyright: "2026 Superset",
		categories: ["DEVELOPER_TOOLS", "PRODUCTIVITY"],
		info: {
			"en-US": {
				title: "Superset: AI Agent Manager",
				subtitle: "Run AI agents from anywhere",
				promoText:
					"Your agents don't stop when you leave your desk. Start work, follow it live, and review the diff — from your phone.",
				description:
					"Superset lets you run and manage AI coding agents from anywhere. Kick off tasks, review progress, and chat with agents working across your projects — all from your phone.\n\nSTART WORK FROM ANYWHERE\nLaunch an agent on any of your connected machines the moment an idea lands. Every session runs in its own isolated workspace, so nothing touches your main branch until you decide it should.\n\nFOLLOW EVERY SESSION\nWatch agents work in real time. Read their reasoning, see the commands they run, and step in with a follow-up the moment they need direction.\n\nREVIEW BEFORE YOU MERGE\nRead the full diff on your phone, file by file with syntax highlighting, and see exactly what changed before anything ships.\n\nYOUR CODE, YOUR MACHINES\nAgents run on hardware you control, in isolated workspaces on your own hosts. Your code stays on your infrastructure.\n\nBUILT FOR TEAMS\nTrack workspaces across your organization, switch between projects, and stay in sync with what your team's agents are doing.\n\nSuperset Mobile is a companion to the Superset desktop app and requires a Superset Pro plan.",
				// No third-party marks: Apple rejects metadata that uses other
				// products' trademarks as search terms (4.1 / 5.2.1).
				keywords: [
					"coding agent",
					"ai",
					"developer tools",
					"pair programming",
					"automation",
					"code review",
					"git",
					"remote",
					"terminal",
				],
				marketingUrl: "https://superset.sh",
				supportUrl: "https://superset.sh",
				privacyPolicyUrl: "https://superset.sh/privacy",
			},
		},
		review: {
			firstName: "Satya",
			lastName: "Patel",
			email: "support@superset.sh",
			phone: "+1 510 519 1602",
			demoRequired: true,
			demoUsername: process.env.APP_REVIEW_EMAIL ?? "",
			demoPassword: process.env.APP_REVIEW_PASSWORD ?? "",
			notes:
				"Superset Mobile is a companion app for the Superset desktop product (https://superset.sh): developers monitor and chat with AI coding agents running in their own workspaces. Access requires a Superset Pro subscription purchased outside the app (multiplatform service; there are no in-app purchases). Please use the provided demo account (sign in via the 'Sign in with email' link) to access a Pro workspace with sample data. Sign in with Apple, GitHub, or Google also works and creates a free account instantly, which shows the subscription-required screen. Account deletion is available from Settings, under Danger Zone. Settings is reachable even on the subscription-required screen, via the organization name in the top-left.\n\nThe demo account is already connected to a demo machine named 'acme-devbox', so the app is populated on first launch: two sample projects (acme and acme-ios) with several workspaces, each showing branch, file changes, and a terminal. Agents run on the developer's own computers using the developer's own AI provider credentials, so the demo machine is provisioned for reviewing workspaces, diffs, and terminals rather than for running a live agent session.",
		},
	},
};
