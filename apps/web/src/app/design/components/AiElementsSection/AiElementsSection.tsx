"use client";

import { BrailleSpinner } from "@superset/ui/ai-elements/braille-spinner";
import { CodeBlock } from "@superset/ui/ai-elements/code-block";
import { Loader } from "@superset/ui/ai-elements/loader";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { Suggestion, Suggestions } from "@superset/ui/ai-elements/suggestion";

import { ComponentCard } from "../ComponentCard";
import { ShowcaseSection } from "../ShowcaseSection";

const EXAMPLE_CODE = `export function Workspace({ branch }: WorkspaceProps) {
	const session = useAgentSession(branch);
	return <Terminal session={session} />;
}`;

const ALL_MODULES = [
	"artifact",
	"bash-tool",
	"braille-spinner",
	"canvas",
	"chain-of-thought",
	"checkpoint",
	"clickable-file-path",
	"code-block",
	"confirmation",
	"connection",
	"context",
	"controls",
	"conversation",
	"edge",
	"exploring-group",
	"file-diff-tool",
	"image",
	"inline-citation",
	"loader",
	"message",
	"model-selector",
	"node",
	"open-in-chat",
	"panel",
	"plan",
	"prompt-input",
	"queue",
	"read-file-tool",
	"reasoning",
	"shimmer",
	"shimmer-label",
	"show-code",
	"sources",
	"suggestion",
	"task",
	"text-selection-popover",
	"thinking-toggle",
	"tool",
	"tool-call",
	"tool-call-row",
	"tool-interrupted",
	"toolbar",
	"user-question-tool",
	"web-fetch-tool",
	"web-preview",
	"web-search-tool",
];

export function AiElementsSection() {
	return (
		<ShowcaseSection
			id="ai-elements"
			index="09"
			title="AI Elements"
			description="Building blocks for agent chat and tool-call UIs"
		>
			<ComponentCard
				title="Loader · Braille Spinner"
				importPath="@superset/ui/ai-elements/loader"
				description="Also: @superset/ui/ai-elements/braille-spinner"
			>
				<Loader size={16} />
				<Loader size={24} />
				<BrailleSpinner className="text-lg text-muted-foreground" />
			</ComponentCard>

			<ComponentCard
				title="Shimmer · Shimmer Label"
				importPath="@superset/ui/ai-elements/shimmer"
				description="Animated text for in-flight agent activity"
			>
				<div className="flex flex-col items-center gap-3 text-sm">
					<Shimmer>Running bun test…</Shimmer>
					<Shimmer variant="text">Thinking about the approach</Shimmer>
					<ShimmerLabel isShimmering={false}>
						Done (isShimmering=false)
					</ShimmerLabel>
				</div>
			</ComponentCard>

			<ComponentCard
				title="Suggestions"
				importPath="@superset/ui/ai-elements/suggestion"
				span
			>
				<Suggestions className="w-full">
					<Suggestion suggestion="Fix the failing tests" />
					<Suggestion suggestion="Summarize this diff" />
					<Suggestion suggestion="Write a PR description" />
					<Suggestion suggestion="Refactor to shared helper" />
				</Suggestions>
			</ComponentCard>

			<ComponentCard
				title="Code Block"
				importPath="@superset/ui/ai-elements/code-block"
				description="Shiki-highlighted, with optional line numbers"
				span
				bleed
			>
				<CodeBlock
					code={EXAMPLE_CODE}
					language="tsx"
					showLineNumbers
					className="rounded-none border-0"
				/>
			</ComponentCard>

			<ComponentCard
				title="Full module list"
				importPath="@superset/ui/ai-elements/*"
				description="Chat-protocol components (message, tool calls, plan, queue…) need live agent state, so they're listed rather than demoed"
				span
			>
				<div className="flex flex-wrap gap-1.5">
					{ALL_MODULES.map((module) => (
						<code
							key={module}
							className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
						>
							{module}
						</code>
					))}
				</div>
			</ComponentCard>
		</ShowcaseSection>
	);
}
