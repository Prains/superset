import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Spinner } from "@superset/ui/spinner";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import stripAnsi from "strip-ansi";
import { GhAuthTerminal } from "./GhAuthTerminal";

const GH_AUTH_COMMAND =
	"gh auth login --hostname github.com --git-protocol https --web";
const GH_INSTALL_COMMAND = `brew install gh && ${GH_AUTH_COMMAND}`;

const ONE_TIME_CODE_PATTERN = /one-time code: ([A-Z0-9]{4}-[A-Z0-9]{4})/;

export type GhAuthDialogMode = "auth" | "install";

type Phase = "running" | "checking" | "success" | "failed";

interface GhAuthDialogProps {
	open: boolean;
	mode: GhAuthDialogMode;
	onOpenChange: (open: boolean) => void;
	/** Fired when the gh process exits so the caller can re-check auth status. */
	onExit: () => void;
}

export function GhAuthDialog({
	open,
	mode,
	onOpenChange,
	onExit,
}: GhAuthDialogProps) {
	const [phase, setPhase] = useState<Phase>("running");
	const [attempt, setAttempt] = useState(0);
	const [oneTimeCode, setOneTimeCode] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const outputBufferRef = useRef("");
	const closeTimerRef = useRef<number | null>(null);
	const onExitRef = useRef(onExit);
	onExitRef.current = onExit;

	useEffect(() => {
		if (!open) return;
		setPhase("running");
		setAttempt(0);
		setOneTimeCode(null);
		setCopied(false);
		outputBufferRef.current = "";
		return () => {
			if (closeTimerRef.current !== null) {
				window.clearTimeout(closeTimerRef.current);
				closeTimerRef.current = null;
			}
		};
	}, [open]);

	const handleOutput = (data: string) => {
		if (oneTimeCode) return;
		outputBufferRef.current = (outputBufferRef.current + data).slice(-4096);
		const match = stripAnsi(outputBufferRef.current).match(
			ONE_TIME_CODE_PATTERN,
		);
		if (match?.[1]) setOneTimeCode(match[1]);
	};

	const handleTerminalExit = () => {
		setPhase("checking");
		onExitRef.current();
		void electronTrpcClient.system.detectGhCli
			.query()
			.then((status) => {
				if (status.installed && status.authenticated) {
					setPhase("success");
					closeTimerRef.current = window.setTimeout(() => {
						onOpenChange(false);
					}, 1500);
				} else {
					setPhase("failed");
				}
			})
			.catch(() => setPhase("failed"));
	};

	const handleRetry = () => {
		setPhase("running");
		setOneTimeCode(null);
		setCopied(false);
		outputBufferRef.current = "";
		setAttempt((prev) => prev + 1);
	};

	const handleCopyCode = () => {
		if (!oneTimeCode) return;
		void navigator.clipboard.writeText(oneTimeCode);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 2000);
	};

	const processActive = phase === "running" || phase === "checking";
	const isInstall = mode === "install";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="max-w-[752px] gap-4"
				onInteractOutside={(event) => {
					if (processActive) event.preventDefault();
				}}
				onFocusOutside={(event) => {
					if (processActive) event.preventDefault();
				}}
			>
				<DialogHeader>
					<DialogTitle>
						{isInstall ? "Install GitHub CLI" : "Sign in to GitHub CLI"}
					</DialogTitle>
					<DialogDescription>
						{isInstall
							? "Homebrew installs the GitHub CLI, then the sign-in flow starts below. "
							: "Follow the prompts below. "}
						Confirm authenticating Git with your GitHub credentials, then press
						Enter to open your browser and enter the one-time code shown here.
					</DialogDescription>
				</DialogHeader>
				{oneTimeCode && phase !== "success" && (
					<div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
						<div>
							<p className="text-xs text-muted-foreground">One-time code</p>
							<p className="select-text cursor-text font-mono text-lg font-semibold tracking-widest">
								{oneTimeCode}
							</p>
						</div>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={handleCopyCode}
						>
							{copied ? (
								<>
									<LuCheck className="size-3.5" />
									Copied
								</>
							) : (
								<>
									<LuCopy className="size-3.5" />
									Copy
								</>
							)}
						</Button>
					</div>
				)}
				{phase === "success" ? (
					<div className="flex h-[240px] w-full items-center justify-center rounded-md border">
						<div className="flex flex-col items-center gap-2">
							<LuCheck className="size-6 text-emerald-500" strokeWidth={2.5} />
							<p className="text-sm font-medium text-foreground">
								{isInstall
									? "GitHub CLI installed and signed in"
									: "Signed in to GitHub"}
							</p>
						</div>
					</div>
				) : (
					<div className="h-[240px] w-full overflow-hidden rounded-md bg-[#151110] p-2">
						{open && (
							<GhAuthTerminal
								key={attempt}
								command={isInstall ? GH_INSTALL_COMMAND : GH_AUTH_COMMAND}
								onExit={handleTerminalExit}
								onOutput={handleOutput}
							/>
						)}
					</div>
				)}
				{phase === "checking" && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Spinner className="size-3.5" />
						Checking sign-in status…
					</div>
				)}
				{phase === "failed" && (
					<div className="flex items-center justify-between gap-2">
						<p className="text-sm text-destructive">
							{isInstall
								? "Install or sign-in canceled or failed."
								: "Sign-in canceled or failed."}
						</p>
						<Button type="button" size="sm" onClick={handleRetry}>
							Retry
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
