import type { Metadata } from "next";

import { ActionsSection } from "./components/ActionsSection";
import { AiElementsSection } from "./components/AiElementsSection";
import { DataSection } from "./components/DataSection";
import { FeedbackSection } from "./components/FeedbackSection";
import { InputsSection } from "./components/InputsSection";
import { LayoutSection } from "./components/LayoutSection";
import { MenusSection } from "./components/MenusSection";
import { NavigationSection } from "./components/NavigationSection";
import { OverlaysSection } from "./components/OverlaysSection";
import { SharedComponentsSection } from "./components/SharedComponentsSection";
import { ShowcaseNav, type ShowcaseNavItem } from "./components/ShowcaseNav";
import { SupersetSection } from "./components/SupersetSection";

export const metadata: Metadata = {
	title: "Design · Superset",
	description: "Living reference for every @superset/ui component",
};

const NAV_ITEMS: ShowcaseNavItem[] = [
	{ id: "actions", index: "01", title: "Actions" },
	{ id: "inputs", index: "02", title: "Inputs" },
	{ id: "overlays", index: "03", title: "Overlays" },
	{ id: "menus", index: "04", title: "Menus" },
	{ id: "feedback", index: "05", title: "Feedback" },
	{ id: "navigation", index: "06", title: "Navigation" },
	{ id: "data", index: "07", title: "Data display" },
	{ id: "layout", index: "08", title: "Layout" },
	{ id: "ai-elements", index: "09", title: "AI Elements" },
	{ id: "superset", index: "10", title: "Superset originals" },
	{ id: "shared", index: "11", title: "Shared app components" },
];

export default function DesignPage() {
	return (
		<div className="min-h-screen bg-background">
			<header className="border-b border-border">
				<div className="mx-auto max-w-6xl px-6 py-12">
					<p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
						packages/ui · component registry
					</p>
					<h1 className="text-3xl font-medium tracking-tight text-foreground">
						Superset Design System
					</h1>
					<p className="mt-2 max-w-xl text-sm text-muted-foreground">
						A living reference of every component exported from{" "}
						<code className="font-mono text-foreground">@superset/ui</code>.
						Each card shows the canonical import path — click it to copy. Reach
						for these before writing anything custom.
					</p>
				</div>
			</header>

			<div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[11rem_1fr]">
				<ShowcaseNav items={NAV_ITEMS} />
				<main className="min-w-0 space-y-16 pb-24">
					<ActionsSection />
					<InputsSection />
					<OverlaysSection />
					<MenusSection />
					<FeedbackSection />
					<NavigationSection />
					<DataSection />
					<LayoutSection />
					<AiElementsSection />
					<SupersetSection />
					<SharedComponentsSection />
				</main>
			</div>
		</div>
	);
}
