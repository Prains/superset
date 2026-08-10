import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { TiptapComposer } from "./TiptapComposer";

const MENTIONS = [
	"packages/chat-ui/src/components/TiptapComposer/TiptapComposer.tsx",
	"packages/chat-ui/src/components/LexicalComposer/LexicalComposer.tsx",
	"packages/chat/src/protocol/items.ts",
	"apps/desktop/src/main/index.ts",
	"README.md",
].map((path) => ({ id: path, label: path }));

const COMMANDS = [
	{ id: "plan", label: "plan", description: "Draft a plan before coding" },
	{ id: "review", label: "review", description: "Review the current diff" },
	{ id: "test", label: "test", description: "Write or run tests" },
	{ id: "commit", label: "commit", description: "Commit staged changes" },
];

const meta = {
	title: "ChatUI/TiptapComposer",
	component: TiptapComposer,
	parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TiptapComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

function Playground() {
	const [payloads, setPayloads] = useState<string[]>([]);
	const [streaming, setStreaming] = useState(false);
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
				<TiptapComposer
					mentionItems={MENTIONS}
					commands={COMMANDS}
					status={streaming ? "streaming" : "ready"}
					onStop={() => setStreaming(false)}
					onSubmit={({ text, files }) => {
						setPayloads((previous) => [
							...previous,
							JSON.stringify({ text, files: files.map((f) => f.name) }),
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
	args: { mentionItems: MENTIONS, commands: COMMANDS },
	render: () => <Playground />,
};
