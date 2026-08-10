import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { ComposerMentionItem } from "./composerLogic";
import { LexicalComposerEditor } from "./LexicalComposerEditor";
import { TiptapComposerEditor } from "./TiptapComposerEditor";

const MENTION_ITEMS: ComposerMentionItem[] = [
	...[
		"packages/chat-ui/src/components/ComposerEditor/TiptapComposerEditor.tsx",
		"packages/chat-ui/src/components/ComposerEditor/LexicalComposerEditor.tsx",
		"packages/ui/src/components/ChatHistorySidebar/ChatHistorySidebar.tsx",
		"packages/chat/src/protocol/items.ts",
		"apps/desktop/src/main/index.ts",
		"README.md",
	].map((path) => ({ id: path, label: path, kind: "file" as const })),
	{
		id: "sd",
		label: "system-design",
		kind: "skill" as const,
		brandColor: "#2563EB",
	},
	{
		id: "plan",
		label: "planning-mode",
		kind: "skill" as const,
		brandColor: "#9333EA",
	},
	{
		id: "rev",
		label: "code-review",
		kind: "skill" as const,
		brandColor: "#16A34A",
	},
];

const meta = {
	title: "ChatUI/ComposerEditor",
	parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Harness({
	title,
	children,
	submitted,
}: {
	title: string;
	children: React.ReactNode;
	submitted: string[];
}) {
	return (
		<div className="flex flex-col gap-2">
			<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
				{title}
			</p>
			<div className="rounded-2xl bg-card p-4 ring-1 ring-border">
				{children}
			</div>
			{submitted.map((text, index) => (
				<pre
					key={`${index}-${text.slice(0, 12)}`}
					className="overflow-x-auto rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground"
				>
					{text}
				</pre>
			))}
		</div>
	);
}

function BakeOff() {
	const [tiptapSubmitted, setTiptapSubmitted] = useState<string[]>([]);
	const [lexicalSubmitted, setLexicalSubmitted] = useState<string[]>([]);
	return (
		<div className="flex min-h-screen items-start justify-center bg-background p-10 text-foreground">
			<div className="grid w-full max-w-3xl gap-10">
				<Harness title="Tiptap" submitted={tiptapSubmitted}>
					<TiptapComposerEditor
						mentionItems={MENTION_ITEMS}
						onSubmit={(text) =>
							setTiptapSubmitted((previous) => [...previous, text])
						}
					/>
				</Harness>
				<Harness title="Lexical" submitted={lexicalSubmitted}>
					<LexicalComposerEditor
						mentionItems={MENTION_ITEMS}
						onSubmit={(text) =>
							setLexicalSubmitted((previous) => [...previous, text])
						}
					/>
				</Harness>
			</div>
		</div>
	);
}

export const SideBySide: Story = {
	render: () => <BakeOff />,
};
