import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { toast } from "@superset/ui/sonner";
import { useCallback, useMemo, useState } from "react";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	MAX_CARDS,
	useFreeSoloBoardStore,
} from "renderer/stores/free-solo-board";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import {
	type HostSession,
	HostTerminalsProbe,
} from "./components/HostTerminalsProbe";

interface AddCardDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function AddCardDialog({ open, onOpenChange }: AddCardDialogProps) {
	const { workspaces, cache } = useHostWorkspaces();
	const { machineId } = useLocalHostService();
	const addCard = useFreeSoloBoardStore((state) => state.addCard);
	const cards = useFreeSoloBoardStore((state) => state.cards);
	const { submit } = useWorkspaceCreates();

	// Keyed by hostUrl. Absent = still loading, null = the probe for that
	// host settled into an error, an array = its live session list. Kept
	// distinct so the dialog can tell "still checking" from "came back
	// empty" from "couldn't check" instead of silently rendering a short
	// list as if it were the complete one.
	const [sessionsByHost, setSessionsByHost] = useState<
		Record<string, HostSession[] | null>
	>({});

	const handleResult = useCallback(
		(hostUrl: string, sessions: HostSession[] | null) => {
			setSessionsByHost((previous) => ({ ...previous, [hostUrl]: sessions }));
		},
		[],
	);

	// One probe per host, not per workspace — terminal.list without a
	// workspaceId already returns every live session on that host.
	const hostUrls = useMemo(() => {
		const urls = new Set<string>();
		for (const workspace of workspaces) {
			const url = cache.resolveHostUrl(workspace.hostId);
			if (url) urls.add(url);
		}
		return [...urls];
	}, [workspaces, cache]);

	// A workspace whose host has no resolvable URL at all can't be probed —
	// no HostTerminalsProbe gets mounted for it, so it never contributes a
	// sessionsByHost entry. Count those hosts alongside ones whose probe
	// mounted but errored: both mean the "Running terminals" list below is
	// missing data, not that the missing host simply has nothing running.
	const unresolvedHostCount = useMemo(() => {
		const ids = new Set<string>();
		for (const workspace of workspaces) {
			if (!cache.resolveHostUrl(workspace.hostId)) ids.add(workspace.hostId);
		}
		return ids.size;
	}, [workspaces, cache]);
	const pendingHostCount = hostUrls.filter(
		(url) => sessionsByHost[url] === undefined,
	).length;
	const erroredHostCount = hostUrls.filter(
		(url) => sessionsByHost[url] === null,
	).length;
	const unreachableHostCount = unresolvedHostCount + erroredHostCount;

	const boardedTerminalIds = new Set(cards.map((card) => card.terminalId));
	const isFull = cards.length >= MAX_CARDS;
	// Read through the *current* hostUrls only — a stale key left behind by a
	// host whose URL changed (host-service restarts move ports) would
	// otherwise double up its sessions under two different keys.
	const sessions = hostUrls.flatMap((url) => sessionsByHost[url] ?? []);
	const workspaceById = new Map(
		workspaces.map((workspace) => [workspace.id, workspace]),
	);

	const add = (
		workspaceId: string,
		terminalId: string,
		createOnAttach?: boolean,
	) => {
		addCard({ workspaceId, terminalId, createOnAttach });
		onOpenChange(false);
	};

	const addScratchSession = () => {
		const handle = submit({
			// The local machine, not any workspace's own host — a scratch
			// session always lives where the desktop app is running.
			hostId: machineId,
			snapshot: {
				id: crypto.randomUUID(),
				projectId: null,
				name: "Free Solo session",
			},
		});
		onOpenChange(false);
		toast.promise(
			handle.completed.then((outcome) => {
				if (!outcome.ok) throw new Error(outcome.error);
				// The session is a real workspace now regardless of what
				// happens next — the board never deletes workspaces, so a
				// full board here just means "created, but not added".
				const cardId = addCard({
					workspaceId: outcome.workspaceId,
					terminalId: crypto.randomUUID(),
					createOnAttach: true,
				});
				if (cardId === null) {
					throw new Error(
						"Session created, but the board filled up before it could be added — find it in the sidebar.",
					);
				}
			}),
			{
				loading: "Creating session…",
				success: "Session created",
				error: (error) =>
					error instanceof Error ? error.message : String(error),
			},
		);
	};

	return (
		<>
			{open &&
				hostUrls.map((hostUrl) => (
					<HostTerminalsProbe
						key={hostUrl}
						hostUrl={hostUrl}
						onResult={handleResult}
					/>
				))}
			<CommandDialog
				open={open}
				onOpenChange={onOpenChange}
				title="Add a terminal to the board"
				description="Pick a running terminal, start a new one in a workspace, or spin up a scratch session."
			>
				<CommandInput placeholder="Search terminals and workspaces…" />
				{pendingHostCount > 0 && (
					<p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
						Checking {pendingHostCount} host
						{pendingHostCount === 1 ? "" : "s"}…
					</p>
				)}
				{unreachableHostCount > 0 && (
					<p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
						{unreachableHostCount} host
						{unreachableHostCount === 1 ? "" : "s"} unreachable — their running
						terminals aren't listed.
					</p>
				)}
				<CommandList>
					<CommandEmpty>Nothing found.</CommandEmpty>
					<CommandGroup heading="Running terminals">
						{sessions.map((session) => {
							const workspace = workspaceById.get(session.workspaceId);
							if (!workspace) return null;
							const alreadyOnBoard = boardedTerminalIds.has(session.terminalId);
							const disabled = alreadyOnBoard || isFull;
							// A disabled CommandItem gets pointer-events: none (see
							// command.tsx), so a `title` tooltip on it would never fire —
							// the reason has to be visible text instead.
							const reason = alreadyOnBoard
								? "On the board"
								: isFull
									? "Board is full"
									: null;
							return (
								<CommandItem
									key={session.terminalId}
									value={`${workspace.name} ${session.title ?? ""} ${session.terminalId}`}
									disabled={disabled}
									onSelect={() => add(workspace.id, session.terminalId)}
								>
									<span className="truncate">
										{workspace.name} — {session.title ?? "Terminal"}
									</span>
									{reason && (
										<span className="ml-auto text-xs text-muted-foreground">
											{reason}
										</span>
									)}
								</CommandItem>
							);
						})}
					</CommandGroup>
					<CommandGroup heading="New terminal in…">
						{workspaces.map((workspace) => {
							const disabled = isFull || !workspace.hostReachable;
							const reason = !workspace.hostReachable
								? "Host unreachable"
								: isFull
									? "Board is full"
									: null;
							return (
								<CommandItem
									key={workspace.id}
									value={`new ${workspace.name} ${workspace.id}`}
									disabled={disabled}
									onSelect={() =>
										// Mint the id here and let the WS attach create the
										// session host-side — no launcher, no awaited mutation.
										add(workspace.id, crypto.randomUUID(), true)
									}
								>
									<span className="truncate">{workspace.name}</span>
									{reason && (
										<span className="ml-auto text-xs text-muted-foreground">
											{reason}
										</span>
									)}
								</CommandItem>
							);
						})}
					</CommandGroup>
					<CommandGroup heading="Scratch">
						<CommandItem
							value="empty session"
							disabled={isFull}
							onSelect={addScratchSession}
						>
							<span className="truncate">Empty session</span>
							{isFull && (
								<span className="ml-auto text-xs text-muted-foreground">
									Board is full
								</span>
							)}
						</CommandItem>
					</CommandGroup>
				</CommandList>
			</CommandDialog>
		</>
	);
}
