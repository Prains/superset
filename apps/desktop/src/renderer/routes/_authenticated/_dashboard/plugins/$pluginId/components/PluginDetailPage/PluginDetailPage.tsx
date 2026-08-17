import type { PluginSnapshot } from "@superset/host-service";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
	LuArrowLeft,
	LuEllipsis,
	LuLayoutPanelLeft,
	LuPanelRight,
	LuPuzzle,
	LuRotateCw,
	LuSearch,
	LuSquareTerminal,
	LuTrash2,
	LuZap,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { PluginTile } from "renderer/plugins/PluginTile";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

const QUERY_KEY = ["host-plugins"] as const;

const PERMISSION_HELP: Record<string, string> = {
	"events:subscribe":
		"Receives workspace, agent, and terminal lifecycle events",
	"workspaces:read": "Reads workspace names, branches, and worktree paths",
	"git:read": "Reads git state inside your worktrees",
};

function Kbd({ children }: { children: ReactNode }) {
	return (
		<span className="rounded border border-border/80 bg-fill-hover px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground shadow-[inset_0_-1px_0_rgba(0,0,0,0.2)]">
			{children}
		</span>
	);
}

/**
 * Visual teaching, not instructions: a mock of the command palette with
 * this plugin's real commands in it (the ChatGPT-apps example-card pattern).
 */
function PaletteMock({
	commands,
	paletteKey,
}: {
	commands: { id: string; title: string }[];
	paletteKey: string;
}) {
	if (commands.length === 0) return null;
	return (
		<div className="flex flex-col gap-2" data-testid="palette-mock">
			<div className="flex items-baseline justify-between">
				<h2 className="text-sm font-semibold">Try it</h2>
				<span className="text-xs text-muted-foreground">in any workspace</span>
			</div>
			<div className="pointer-events-none select-none overflow-hidden rounded-lg border border-border/70 bg-background shadow-lg">
				<div className="flex items-center gap-2 border-b border-border/60 px-3.5 py-2.5">
					<LuSearch className="size-3.5 text-muted-foreground/70" />
					<span className="flex-1 text-sm text-muted-foreground/60">
						Type a command…
					</span>
					<Kbd>{paletteKey}</Kbd>
				</div>
				<div className="flex flex-col p-1.5">
					{commands.slice(0, 3).map((command, index) => (
						<div
							key={command.id}
							className={cn(
								"flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
								index === 0
									? "bg-fill-selected text-foreground"
									: "text-muted-foreground",
							)}
						>
							<LuPuzzle className="size-3.5 shrink-0 opacity-70" />
							<span className="flex-1">{command.title}</span>
							{index === 0 ? <Kbd>↵</Kbd> : null}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function ContributionGroup({
	icon,
	title,
	hint,
	rows,
}: {
	icon: ReactNode;
	title: string;
	hint?: string;
	rows: { primary: string; secondary?: string }[];
}) {
	if (rows.length === 0) return null;
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{icon}
				{title}
				<span className="opacity-60">{rows.length}</span>
				{hint ? (
					<span className="ml-auto font-normal normal-case tracking-normal text-muted-foreground/70">
						{hint}
					</span>
				) : null}
			</div>
			<div className="flex flex-col rounded-md border border-border/60">
				{rows.map((row) => (
					<div
						key={row.primary + (row.secondary ?? "")}
						className="flex items-baseline gap-2 border-b border-border/40 px-3 py-2 text-sm last:border-b-0"
					>
						<span className="font-medium">{row.primary}</span>
						{row.secondary ? (
							<span className="truncate font-mono text-[11px] text-muted-foreground">
								{row.secondary}
							</span>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}

export function PluginDetailPage({ pluginId }: { pluginId: string }) {
	const paletteKey = useHotkeyDisplay("OPEN_COMMAND_PALETTE").text;
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const pluginsQuery = useQuery({
		queryKey: [...QUERY_KEY, activeHostUrl] as const,
		enabled: Boolean(activeHostUrl),
		staleTime: 5_000,
		refetchOnWindowFocus: true,
		queryFn: () => {
			if (!activeHostUrl) return [];
			return getHostServiceClientByUrl(activeHostUrl).plugins.list.query();
		},
	});
	const plugin: PluginSnapshot | undefined = pluginsQuery.data?.find(
		(p) => p.id === pluginId,
	);
	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
	};
	const client = activeHostUrl
		? getHostServiceClientByUrl(activeHostUrl)
		: null;

	const setEnabled = useMutation({
		mutationFn: (enabled: boolean) => {
			if (!client) throw new Error("Host service is not available");
			return client.plugins.setEnabled.mutate({ id: pluginId, enabled });
		},
		onSettled: invalidate,
		onError: (error) => toast.error(error.message),
	});
	const reload = useMutation({
		mutationFn: () => {
			if (!client) throw new Error("Host service is not available");
			return client.plugins.reload.mutate({ id: pluginId });
		},
		onSettled: invalidate,
		onSuccess: () => toast.success("Reloaded"),
		onError: (error) => toast.error(error.message),
	});
	const uninstall = useMutation({
		mutationFn: () => {
			if (!client) throw new Error("Host service is not available");
			return client.plugins.uninstall.mutate({ id: pluginId });
		},
		onSuccess: () => {
			toast.success("Uninstalled");
			invalidate();
			void navigate({ to: "/plugins" });
		},
		onError: (error) => toast.error(error.message),
	});

	if (pluginsQuery.isPending) {
		return (
			<div className="mx-auto w-full max-w-3xl px-6 py-8">
				<Skeleton className="h-32 w-full" />
			</div>
		);
	}
	if (!plugin) {
		return (
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-8">
				<Link
					to="/plugins"
					className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
				>
					<LuArrowLeft className="size-3.5" /> Plugins
				</Link>
				<p className="text-sm text-muted-foreground">
					Plugin not installed: <code>{pluginId}</code>
				</p>
			</div>
		);
	}

	const contributes = plugin.manifest.contributes;
	const permissions = plugin.manifest.permissions ?? [];
	const commands = contributes?.commands ?? [];

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<div
				data-testid="plugin-detail"
				className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8"
			>
				<Link
					to="/plugins"
					className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
				>
					<LuArrowLeft className="size-3.5" /> Plugins
				</Link>

				<div className="flex flex-col items-center gap-3 pt-2 text-center">
					<PluginTile
						pluginId={plugin.id}
						name={plugin.name}
						icon={plugin.manifest.icon}
						size="lg"
					/>
					<div className="flex flex-col items-center gap-1">
						<div className="flex items-baseline gap-2">
							<h1 className="text-xl font-semibold">{plugin.name}</h1>
							<span className="text-sm text-muted-foreground">
								v{plugin.version}
							</span>
						</div>
						<p className="max-w-md text-sm text-muted-foreground">
							{plugin.description || plugin.id}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							aria-label="Reload plugin"
							disabled={reload.isPending || !plugin.enabled}
							onClick={() => reload.mutate()}
						>
							<LuRotateCw className="size-4" />
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon" aria-label="More actions">
									<LuEllipsis className="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									onSelect={() => {
										void navigator.clipboard.writeText(plugin.source);
										toast.success("Source copied");
									}}
								>
									Copy source
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									variant="destructive"
									disabled={uninstall.isPending}
									onSelect={() => uninstall.mutate()}
								>
									<LuTrash2 className="size-3.5" />
									Uninstall
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						<Switch
							aria-label={plugin.enabled ? "Disable plugin" : "Enable plugin"}
							checked={plugin.enabled}
							disabled={setEnabled.isPending}
							onCheckedChange={(checked) => setEnabled.mutate(checked)}
						/>
					</div>
				</div>

				{plugin.status === "error" && plugin.error ? (
					<div className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
						{plugin.error}
					</div>
				) : null}

				<PaletteMock commands={commands} paletteKey={paletteKey} />

				<div className="flex flex-col gap-4">
					<h2 className="text-sm font-semibold">What this plugin adds</h2>
					<ContributionGroup
						icon={<LuZap className="size-3.5" />}
						title="Commands"
						hint="command palette"
						rows={commands.map((c) => ({
							primary: c.title,
							secondary: c.id,
						}))}
					/>
					<ContributionGroup
						icon={<LuLayoutPanelLeft className="size-3.5" />}
						title="Panes"
						hint="workspace pane grid"
						rows={(contributes?.panes ?? []).map((p) => ({
							primary: p.title,
							secondary: p.kind,
						}))}
					/>
					<ContributionGroup
						icon={<LuPanelRight className="size-3.5" />}
						title="Sidebar tabs"
						hint="workspace right sidebar"
						rows={(contributes?.sidebarTabs ?? []).map((t) => ({
							primary: t.label,
							secondary: t.id,
						}))}
					/>
					<ContributionGroup
						icon={<LuSquareTerminal className="size-3.5" />}
						title="Event hooks"
						hint="runs automatically"
						rows={(contributes?.events ?? []).map((e) => ({
							primary: e.on,
							secondary: e.command.join(" "),
						}))}
					/>
					{!contributes?.commands?.length &&
					!contributes?.panes?.length &&
					!contributes?.sidebarTabs?.length &&
					!contributes?.events?.length ? (
						<p className="text-sm text-muted-foreground">
							No declared UI contributions — this plugin runs as a backend
							service.
						</p>
					) : null}
				</div>

				{permissions.length > 0 ? (
					<div className="flex flex-col gap-2">
						<h2 className="text-sm font-semibold">Permissions</h2>
						<div className="flex flex-col rounded-md border border-border/60">
							{permissions.map((permission) => (
								<div
									key={permission}
									className="flex items-baseline gap-3 border-b border-border/40 px-3 py-2 last:border-b-0"
								>
									<code className="shrink-0 rounded bg-fill-hover px-1.5 py-0.5 font-mono text-[11px]">
										{permission}
									</code>
									<span className="text-xs text-muted-foreground">
										{PERMISSION_HELP[permission] ?? "Declared capability"}
									</span>
								</div>
							))}
						</div>
						<p className="text-xs text-muted-foreground/70">
							Permissions are declared by the plugin and shown for review; the
							backend runs with full access on this host, the same as setup
							scripts.
						</p>
					</div>
				) : null}

				<div className="flex flex-col gap-2">
					<h2 className="text-sm font-semibold">Information</h2>
					<div className="flex flex-col rounded-md border border-border/60 text-sm">
						{[
							["Plugin id", plugin.id],
							[
								"Source",
								`${plugin.sourceType === "link" ? "linked · " : ""}${plugin.source}`,
							],
							...(plugin.sourceCommit
								? [["Commit", plugin.sourceCommit.slice(0, 12)] as const]
								: []),
							["Installed", new Date(plugin.installedAt).toLocaleString()],
							["Updated", new Date(plugin.updatedAt).toLocaleString()],
						].map(([label, value]) => (
							<div
								key={label}
								className="flex items-baseline gap-4 border-b border-border/40 px-3 py-2 last:border-b-0"
							>
								<span className="w-24 shrink-0 text-xs text-muted-foreground">
									{label}
								</span>
								<span className="truncate font-mono text-xs">{value}</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
