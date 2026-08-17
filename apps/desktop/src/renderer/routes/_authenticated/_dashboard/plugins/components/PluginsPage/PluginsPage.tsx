import type { PluginSnapshot } from "@superset/host-service";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { Input } from "@superset/ui/input";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
	LuFolderGit2,
	LuGitBranch,
	LuLoaderCircle,
	LuPlus,
	LuPuzzle,
	LuSearch,
	LuSparkles,
} from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { PluginTile } from "renderer/plugins/PluginTile";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { EXTERNAL_LINKS } from "shared/constants";

const QUERY_KEY = ["host-plugins"] as const;

type InstallMode = "git" | "path";

function usePluginsQuery(hostUrl: string | null) {
	return useQuery({
		queryKey: [...QUERY_KEY, hostUrl] as const,
		enabled: Boolean(hostUrl),
		staleTime: 5_000,
		refetchOnWindowFocus: true,
		queryFn: () => {
			if (!hostUrl) return [];
			return getHostServiceClientByUrl(hostUrl).plugins.list.query();
		},
	});
}

function contributionShorthand(plugin: PluginSnapshot): string {
	const c = plugin.manifest.contributes;
	const parts: string[] = [];
	const commands = c?.commands?.length ?? 0;
	if (commands) parts.push(`${commands} cmd${commands === 1 ? "" : "s"}`);
	if (c?.panes?.length) parts.push("pane");
	if (c?.sidebarTabs?.length) parts.push("tab");
	if (c?.events?.length) parts.push("hooks");
	return parts.join(" · ");
}

function PluginRow({
	plugin,
	hostUrl,
	onChanged,
}: {
	plugin: PluginSnapshot;
	hostUrl: string;
	onChanged: () => void;
}) {
	const client = getHostServiceClientByUrl(hostUrl);
	const setEnabled = useMutation({
		mutationFn: (enabled: boolean) =>
			client.plugins.setEnabled.mutate({ id: plugin.id, enabled }),
		onSettled: onChanged,
		onError: (error) => toast.error(error.message),
	});

	return (
		<div
			data-testid="plugin-row"
			className="group relative flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-fill-hover/40"
		>
			<Link
				to="/plugins/$pluginId"
				params={{ pluginId: plugin.id }}
				aria-label={plugin.name}
				className="absolute inset-0"
			/>
			<PluginTile
				pluginId={plugin.id}
				name={plugin.name}
				icon={plugin.manifest.icon}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-sm font-medium">{plugin.name}</span>
					{plugin.status === "running" ? (
						<span
							data-testid="plugin-status"
							title="Running"
							className="size-1.5 shrink-0 rounded-full bg-green-500"
						/>
					) : plugin.status === "error" ? (
						<span
							data-testid="plugin-status"
							className="text-[11px] font-medium text-red-500"
						>
							Error
						</span>
					) : (
						<span
							data-testid="plugin-status"
							className="text-[11px] text-muted-foreground/70"
						>
							Disabled
						</span>
					)}
				</div>
				<div
					className={cn(
						"truncate text-xs",
						plugin.status === "error"
							? "text-red-500/90"
							: "text-muted-foreground",
					)}
				>
					{plugin.status === "error" && plugin.error
						? plugin.error
						: plugin.description || plugin.id}
				</div>
			</div>
			<span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">
				{contributionShorthand(plugin)}
			</span>
			<Switch
				aria-label={`${plugin.enabled ? "Disable" : "Enable"} ${plugin.name}`}
				checked={plugin.enabled}
				disabled={setEnabled.isPending}
				onCheckedChange={(checked) => setEnabled.mutate(checked)}
				className="relative z-10 shrink-0"
			/>
		</div>
	);
}

function InstallDialog({
	mode,
	hostUrl,
	onClose,
	onInstalled,
}: {
	mode: InstallMode;
	hostUrl: string;
	onClose: () => void;
	onInstalled: () => void;
}) {
	const [source, setSource] = useState("");

	const install = useMutation({
		mutationFn: async (input: string) => {
			const client = getHostServiceClientByUrl(hostUrl);
			const trimmed = input.trim();
			if (mode === "path") {
				return client.plugins.link.mutate({ path: trimmed });
			}
			const url = /^(https?:\/\/|git@)/.test(trimmed)
				? trimmed
				: `https://github.com/${trimmed}.git`;
			return client.plugins.install.mutate({ type: "git", url });
		},
		onSettled: onInstalled,
		onSuccess: (result) => {
			const name = result?.snapshot?.name ?? "plugin";
			toast.success(`Installed ${name}`);
			for (const warning of result?.warnings ?? []) toast.warning(warning);
			onClose();
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<Dialog modal={false} open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{mode === "git" ? "Install from git" : "Link a local plugin"}
					</DialogTitle>
					<DialogDescription>
						{mode === "git"
							? "Plugins run with full access on this host, the same as setup scripts. Install from authors you trust."
							: "Registers a plugin directory in place. Edits apply on reload — this is the dev flow."}
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						if (source.trim()) install.mutate(source);
					}}
				>
					<Input
						autoFocus
						data-testid="plugin-install-input"
						value={source}
						onChange={(event) => setSource(event.target.value)}
						placeholder={
							mode === "git"
								? "owner/repo or https://…"
								: "/path/to/plugin-directory"
						}
					/>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button
							type="submit"
							data-testid="plugin-install-button"
							disabled={install.isPending || !source.trim()}
						>
							{install.isPending ? (
								<LuLoaderCircle className="size-3.5 animate-spin" />
							) : null}
							{mode === "git" ? "Install" : "Link"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Dispatches an agent session primed with the bundled plugin-authoring
 * skill — the automations-style "create with AI" flow, for plugins.
 */
function BuildWithAiDialog({
	hostUrl,
	onClose,
}: {
	hostUrl: string;
	onClose: () => void;
}) {
	const [idea, setIdea] = useState("");
	const navigate = useNavigate();

	const build = useMutation({
		mutationFn: async (description: string) => {
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaces.createSession.mutate({
				name: "Build a plugin",
				agents: [
					{
						agent: "claude",
						prompt: `Build a Superset plugin using the plugin-authoring skill. What it should do: ${description.trim()}\n\nScaffold it with \`superset plugin new\`, implement it, build with \`superset plugin build .\`, register it with \`superset plugin link .\`, and verify it shows as running via \`superset plugin list\`. Iterate with \`superset plugin reload <id>\` until it works.`,
					},
				],
			});
		},
		onSuccess: (result) => {
			toast.success("Agent dispatched — building your plugin");
			onClose();
			const id = result.workspace?.id;
			if (id) {
				void navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: id },
				});
			}
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<Dialog modal={false} open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Build a plugin with AI</DialogTitle>
					<DialogDescription>
						Describe what you want. An agent session starts with the
						plugin-authoring skill and builds, links, and verifies it.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						if (idea.trim()) build.mutate(idea);
					}}
				>
					<Textarea
						autoFocus
						data-testid="plugin-build-input"
						value={idea}
						onChange={(event) => setIdea(event.target.value)}
						placeholder="A pane that shows my open PRs across all workspaces, with review status…"
						rows={4}
					/>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button
							type="submit"
							data-testid="plugin-build-button"
							disabled={build.isPending || !idea.trim()}
						>
							{build.isPending ? (
								<LuLoaderCircle className="size-3.5 animate-spin" />
							) : (
								<LuSparkles className="size-3.5" />
							)}
							Build it
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function PluginsPage() {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const pluginsQuery = usePluginsQuery(activeHostUrl);
	const [installMode, setInstallMode] = useState<InstallMode | null>(null);
	const [buildOpen, setBuildOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [scope, setScope] = useState<"all" | "enabled" | "errors">("all");

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
	};

	const plugins = pluginsQuery.data ?? [];
	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return plugins.filter((plugin) => {
			if (scope === "enabled" && !plugin.enabled) return false;
			if (scope === "errors" && plugin.status !== "error") return false;
			if (!query) return true;
			return (
				plugin.name.toLowerCase().includes(query) ||
				plugin.id.toLowerCase().includes(query) ||
				(plugin.description ?? "").toLowerCase().includes(query)
			);
		});
	}, [plugins, search, scope]);
	const errorCount = plugins.filter((p) => p.status === "error").length;

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
				<div className="flex items-center justify-between gap-4">
					<div className="flex flex-col gap-0.5">
						<h1 className="text-xl font-semibold">Plugins</h1>
						<p className="text-sm text-muted-foreground">
							Extend Superset and its agents.{" "}
							<a
								href={EXTERNAL_LINKS.PLUGINS_DOCS}
								target="_blank"
								rel="noopener noreferrer"
								className="underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
							>
								Learn more
							</a>
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button data-testid="plugin-install-menu" variant="outline">
									<LuPlus className="size-3.5" />
									Install
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onSelect={() => setInstallMode("git")}>
									<LuGitBranch className="size-3.5" />
									From git URL…
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => setInstallMode("path")}>
									<LuFolderGit2 className="size-3.5" />
									From local path…
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						<Button
							data-testid="plugin-build-ai"
							onClick={() => setBuildOpen(true)}
						>
							<LuSparkles className="size-3.5" />
							Build with AI
						</Button>
					</div>
				</div>

				{plugins.length > 0 ? (
					<div className="flex items-center gap-2.5">
						<div className="flex flex-1 items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-1.5">
							<LuSearch className="size-3.5 shrink-0 text-muted-foreground/60" />
							<input
								data-testid="plugin-search"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search plugins…"
								className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
							/>
						</div>
						<div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-card/40 p-0.5">
							{(
								[
									["all", "All"],
									["enabled", "Enabled"],
									[
										"errors",
										errorCount > 0 ? `Errors (${errorCount})` : "Errors",
									],
								] as const
							).map(([key, label]) => (
								<button
									key={key}
									type="button"
									onClick={() => setScope(key)}
									className={cn(
										"rounded-md px-2.5 py-1 text-xs transition-colors",
										scope === key
											? "bg-fill-selected text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{label}
								</button>
							))}
						</div>
					</div>
				) : null}

				{pluginsQuery.isPending ? (
					<div className="flex flex-col gap-2">
						<Skeleton className="h-16 w-full" />
						<Skeleton className="h-16 w-full" />
						<Skeleton className="h-16 w-full" />
					</div>
				) : plugins.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<LuPuzzle />
							</EmptyMedia>
							<EmptyTitle>No plugins installed</EmptyTitle>
							<EmptyDescription>
								Plugins add panes, sidebar tabs, palette commands, and agent
								skills. Install one from a git repo, or describe one and let an
								agent build it.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div
						data-testid="plugins-list"
						className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60"
					>
						{filtered.length === 0 ? (
							<div className="px-4 py-8 text-center text-sm text-muted-foreground">
								No plugins match.
							</div>
						) : null}
						{filtered.map((plugin) =>
							activeHostUrl ? (
								<PluginRow
									key={plugin.id}
									plugin={plugin}
									hostUrl={activeHostUrl}
									onChanged={invalidate}
								/>
							) : null,
						)}
					</div>
				)}
			</div>
			{installMode && activeHostUrl ? (
				<InstallDialog
					mode={installMode}
					hostUrl={activeHostUrl}
					onClose={() => setInstallMode(null)}
					onInstalled={invalidate}
				/>
			) : null}
			{buildOpen && activeHostUrl ? (
				<BuildWithAiDialog
					hostUrl={activeHostUrl}
					onClose={() => setBuildOpen(false)}
				/>
			) : null}
		</div>
	);
}
