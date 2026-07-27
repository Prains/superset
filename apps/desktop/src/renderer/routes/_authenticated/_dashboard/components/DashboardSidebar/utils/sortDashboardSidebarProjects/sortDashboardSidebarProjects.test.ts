import { describe, expect, it } from "bun:test";
import {
	makeProject,
	makeSection,
	makeWorkspace,
} from "../testProjectFixtures";
import {
	getProjectActivityTimestamp,
	sortDashboardSidebarProjects,
} from "./sortDashboardSidebarProjects";

describe("getProjectActivityTimestamp", () => {
	it("uses the most recently updated workspace, including inside sections", () => {
		const project = makeProject({
			id: "p1",
			name: "Alpha",
			updatedAt: new Date("2026-06-01"),
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w1",
						name: "one",
						updatedAt: new Date("2026-02-01"),
					}),
				},
				{
					type: "section",
					section: makeSection({
						id: "s1",
						name: "Section",
						workspaces: [
							makeWorkspace({
								id: "w2",
								name: "two",
								updatedAt: new Date("2026-03-01"),
							}),
						],
					}),
				},
			],
		});
		expect(getProjectActivityTimestamp(project)).toBe(
			new Date("2026-03-01").getTime(),
		);
	});

	it("falls back to the project's own updatedAt when there are no workspaces", () => {
		const project = makeProject({
			id: "p1",
			name: "Alpha",
			updatedAt: new Date("2026-05-01"),
		});
		expect(getProjectActivityTimestamp(project)).toBe(
			new Date("2026-05-01").getTime(),
		);
	});
});

describe("sortDashboardSidebarProjects", () => {
	const older = makeProject({
		id: "p-older",
		name: "Older",
		createdAt: new Date("2026-01-01"),
		children: [
			{
				type: "workspace",
				workspace: makeWorkspace({
					id: "w1",
					name: "busy",
					updatedAt: new Date("2026-07-01"),
				}),
			},
		],
	});
	const newer = makeProject({
		id: "p-newer",
		name: "Newer",
		createdAt: new Date("2026-04-01"),
		children: [
			{
				type: "workspace",
				workspace: makeWorkspace({
					id: "w2",
					name: "idle",
					updatedAt: new Date("2026-05-01"),
				}),
			},
		],
	});

	it("returns the input untouched in manual mode", () => {
		const projects = [older, newer];
		expect(sortDashboardSidebarProjects(projects, "manual")).toBe(projects);
	});

	it("sorts newest created first in created mode", () => {
		expect(
			sortDashboardSidebarProjects([older, newer], "created").map((p) => p.id),
		).toEqual(["p-newer", "p-older"]);
	});

	it("sorts by workspace activity in updated mode", () => {
		expect(
			sortDashboardSidebarProjects([newer, older], "updated").map((p) => p.id),
		).toEqual(["p-older", "p-newer"]);
	});

	it("breaks timestamp ties by name", () => {
		const a = makeProject({ id: "p-a", name: "Apple" });
		const b = makeProject({ id: "p-b", name: "Banana" });
		expect(
			sortDashboardSidebarProjects([b, a], "created").map((p) => p.id),
		).toEqual(["p-a", "p-b"]);
	});

	// Electric collection rows carry ISO strings at runtime despite the Date
	// type; sorting must coerce them, never throw mid-render.
	it("sorts workspaces whose timestamps are ISO strings at runtime", () => {
		const stringDated = makeProject({
			id: "p-string",
			name: "StringDates",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-string",
						name: "cloud-fallback",
						updatedAt: "2026-07-01T00:00:00.000Z" as unknown as Date,
					}),
				},
			],
		});
		const dateDated = makeProject({
			id: "p-date",
			name: "DateDates",
			children: [
				{
					type: "workspace",
					workspace: makeWorkspace({
						id: "w-date",
						name: "host-served",
						updatedAt: new Date("2026-05-01"),
					}),
				},
			],
		});
		expect(
			sortDashboardSidebarProjects([dateDated, stringDated], "updated").map(
				(p) => p.id,
			),
		).toEqual(["p-string", "p-date"]);
	});

	it("falls back to name order instead of throwing on garbage timestamps", () => {
		const garbage = makeProject({
			id: "p-garbage",
			name: "Apple",
			createdAt: "not-a-date" as unknown as Date,
		});
		const alsoGarbage = makeProject({
			id: "p-garbage-2",
			name: "Banana",
			createdAt: "also-not-a-date" as unknown as Date,
		});
		expect(
			sortDashboardSidebarProjects([alsoGarbage, garbage], "created").map(
				(p) => p.id,
			),
		).toEqual(["p-garbage", "p-garbage-2"]);
	});
});
