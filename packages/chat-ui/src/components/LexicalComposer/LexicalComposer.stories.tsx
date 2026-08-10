import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	AppWindowIcon,
	FileCode2Icon,
	FileSpreadsheetIcon,
	FileTextIcon,
	GlobeIcon,
	LightbulbIcon,
	MessageCircleIcon,
	PaperclipIcon,
	TargetIcon,
} from "lucide-react";
import { useState } from "react";
import { LexicalComposer } from "./LexicalComposer";
import type { ComposerMentionProvider } from "./types";

const FILES = [
	"packages/chat-ui/src/components/LexicalComposer/LexicalComposer.tsx",
	"packages/chat-ui/src/components/LexicalComposer/components/ComposerBody/ComposerBody.tsx",
	"packages/chat/src/protocol/items.ts",
	"packages/ui/src/components/ChatHistorySidebar/ChatHistorySidebar.tsx",
	"apps/desktop/src/main/index.ts",
	"README.md",
];

const TABS = [
	{ title: "Storybook — ChatUI/LexicalComposer", url: "http://localhost:6006" },
	{ title: "superset-sh/superset: Pull requests", url: "https://github.com" },
	{ title: "Lexical documentation", url: "https://lexical.dev" },
];

const CONVERSATIONS = [
	"Chat rail follow-scroll bug",
	"Composer bake-off verdict",
	"Protocol timeline derivation",
];

function makeProviders(
	setPlanMode: (on: boolean) => void,
): ComposerMentionProvider[] {
	return [
		{
			id: "add",
			section: { label: "Add", priority: 0 },
			source: {
				kind: "static",
				load: () => [
					{
						id: "files-and-folders",
						label: "Files and folders",
						icon: <PaperclipIcon className="size-4.5" />,
						action: { type: "run", run: (ctx) => ctx.attachFiles() },
					},
					{
						id: "goal",
						label: "Goal",
						description: "Set a goal to keep pursuing",
						icon: <TargetIcon className="size-4.5" />,
						action: {
							type: "run",
							run: (ctx) =>
								ctx.insertChip({
									label: "Goal",
									serialized: "@goal",
									brandColor: "#F59E0B",
								}),
						},
					},
					{
						id: "plan-mode",
						label: "Plan mode",
						description: "Turn plan mode on",
						icon: <LightbulbIcon className="size-4.5" />,
						action: { type: "run", run: () => setPlanMode(true) },
					},
				],
			},
		},
		{
			id: "plugins",
			section: { label: "Plugins", priority: 1 },
			source: {
				kind: "static",
				load: () => [
					{
						id: "documents",
						label: "Documents",
						description: "Create and edit document artifacts",
						icon: <FileTextIcon className="size-4.5 text-blue-500" />,
						keywords: ["docs", "write"],
						action: {
							type: "insert-chip",
							chip: {
								label: "Documents",
								serialized: "plugin://documents",
								brandColor: "#2563EB",
							},
						},
					},
					{
						id: "spreadsheets",
						label: "Spreadsheets",
						description: "Create and edit spreadsheet files",
						icon: <FileSpreadsheetIcon className="size-4.5 text-green-600" />,
						keywords: ["excel", "sheets"],
						action: {
							type: "run",
							run: (ctx) => {
								ctx.insertChip({
									label: "Spreadsheets",
									serialized: "plugin://spreadsheets",
									brandColor: "#16A34A",
								});
								ctx.openPanel({
									title: "Templates",
									render: () => (
										<div className="flex gap-4">
											{[
												"Analytics Dashboard",
												"Financial Budget",
												"Operating Calendar",
											].map((name) => (
												<div key={name} className="w-48 shrink-0">
													<div className="mb-2 flex h-28 items-center justify-center rounded-lg bg-secondary text-xs text-muted-foreground">
														{name}
													</div>
													<p className="text-sm text-muted-foreground">
														{name}
													</p>
												</div>
											))}
										</div>
									),
								});
							},
						},
					},
				],
			},
		},
		{
			id: "tabs",
			section: { label: "Tabs", priority: 2 },
			source: {
				kind: "static",
				// simulates an async browser-tabs lookup refreshed each time the menu opens
				load: async () => {
					await new Promise((resolve) => setTimeout(resolve, 120));
					return TABS.map((tab) => ({
						id: tab.url,
						label: tab.title,
						description: tab.url,
						icon: <AppWindowIcon className="size-4.5" />,
						action: {
							type: "insert-chip" as const,
							chip: {
								label: tab.title,
								serialized: tab.url,
								data: { url: tab.url },
							},
						},
					}));
				},
			},
		},
		{
			id: "conversations",
			section: { label: "Conversations", priority: 3 },
			source: {
				kind: "static",
				load: () =>
					CONVERSATIONS.map((title) => ({
						id: title,
						label: title,
						description: "Conversation",
						icon: <MessageCircleIcon className="size-4.5" />,
						action: {
							type: "insert-chip" as const,
							chip: { label: title, serialized: `conversation://${title}` },
						},
					})),
			},
		},
		{
			id: "file-search",
			section: { label: "Files", priority: 4 },
			source: {
				kind: "search",
				hint: "Type to search files",
				search: async (query) => {
					await new Promise((resolve) => setTimeout(resolve, 80));
					return FILES.filter((path) =>
						path.toLowerCase().includes(query.toLowerCase()),
					).map((path) => ({
						id: path,
						label: path,
						icon: <FileCode2Icon className="size-4.5" />,
						action: {
							type: "insert-chip" as const,
							chip: { label: path, serialized: `@${path}` },
						},
					}));
				},
			},
		},
	];
}

const COMMANDS = [
	{ id: "plan", label: "plan", description: "Draft a plan before coding" },
	{ id: "review", label: "review", description: "Review the current diff" },
	{ id: "test", label: "test", description: "Write or run tests" },
];

const meta = {
	title: "ChatUI/LexicalComposer",
	component: LexicalComposer,
	parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LexicalComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

function Playground() {
	const [payloads, setPayloads] = useState<string[]>([]);
	const [streaming, setStreaming] = useState(false);
	const [planMode, setPlanMode] = useState(false);
	const [providers] = useState(() => makeProviders(setPlanMode));
	return (
		<div className="flex h-screen flex-col justify-end bg-background px-10 pt-10 pb-[18px] text-foreground">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
				{payloads.map((payload, index) => (
					<pre
						key={`${index}-${payload.slice(0, 12)}`}
						className="overflow-x-auto rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground"
					>
						{payload}
					</pre>
				))}
				{planMode && (
					<p className="flex items-center gap-1.5 text-xs text-amber-500">
						<GlobeIcon className="size-3.5" /> Plan mode on
					</p>
				)}
				<LexicalComposer
					mentionProviders={providers}
					commands={COMMANDS}
					status={streaming ? "streaming" : "ready"}
					onStop={() => setStreaming(false)}
					onSubmit={({ text, files, mentions }) => {
						setPayloads((previous) => [
							...previous,
							JSON.stringify({
								text,
								files: files.map((file) => file.name),
								mentions,
							}),
						]);
						setStreaming(true);
						window.setTimeout(() => setStreaming(false), 2000);
					}}
				/>
			</div>
		</div>
	);
}

export const Default: Story = {
	args: { mentionProviders: [], commands: COMMANDS },
	render: () => <Playground />,
};
