/**
 * The workspace contract: everything a runtime must serve to be a Superset
 * workspace, independent of whether that runtime is a laptop's host-service
 * or a cloud sandbox.
 *
 * The contract is a strict subset of host-service's `AppRouter`. Paths are
 * wire-identical on purpose, so host-service complies without a shim; the
 * compliance assertion lives in
 * `packages/host-service/src/trpc/contract-compliance.test-d.ts`.
 *
 * Deliberately NOT in the contract (control-plane, not workspace-plane):
 * `workspaces.*`, `workspaceCreation.*`, `workspaceCleanup.*`, `workspace.*`,
 * `project.*`, `cloud.*`, `issues.*`, and `chat.*`. Creating, listing, and
 * destroying workspaces is something done TO a workspace from outside it — a
 * sandbox cannot create itself.
 */

import type { ContractNamespace } from "./procedure";
import { agentsContract } from "./procedures/agents";
import { attachmentsContract } from "./procedures/attachments";
import { authContract } from "./procedures/auth";
import { configContract } from "./procedures/config";
import { filesystemContract } from "./procedures/filesystem";
import { gitContract } from "./procedures/git";
import { githubContract } from "./procedures/github";
import { healthContract } from "./procedures/health";
import { hostContract } from "./procedures/host";
import { notificationsContract } from "./procedures/notifications";
import { portsContract } from "./procedures/ports";
import { pullRequestsContract } from "./procedures/pull-requests";
import { settingsContract } from "./procedures/settings";
import { terminalContract } from "./procedures/terminal";
import { terminalAgentsContract } from "./procedures/terminal-agents";

export const workspaceContract = {
	terminal: terminalContract,
	git: gitContract,
	filesystem: filesystemContract,
	terminalAgents: terminalAgentsContract,
	ports: portsContract,
	pullRequests: pullRequestsContract,
	attachments: attachmentsContract,
	config: configContract,
	auth: authContract,
	agents: agentsContract,
	settings: settingsContract,
	notifications: notificationsContract,
	github: githubContract,
	host: hostContract,
	health: healthContract,
} as const satisfies ContractNamespace;

export type WorkspaceContract = typeof workspaceContract;

export * from "./errors";
export * from "./events";
export {
	type ContractNamespace,
	type ContractNode,
	DEFAULT_QUERY_TIMEOUT_MS,
	type InferContractInput,
	type InferContractOutput,
	isProcedureContract,
	type ProcedureContract,
	type ProcedureDeprecation,
	type ProcedureExposure,
	type ProcedureKind,
} from "./procedure";
export { agentsContract } from "./procedures/agents";
export { attachmentsContract } from "./procedures/attachments";
export { authContract } from "./procedures/auth";
export { configContract } from "./procedures/config";
export { filesystemContract } from "./procedures/filesystem";
export { gitContract } from "./procedures/git";
export { githubContract } from "./procedures/github";
export { healthContract } from "./procedures/health";
export { hostContract } from "./procedures/host";
export { notificationsContract } from "./procedures/notifications";
export { portsContract } from "./procedures/ports";
export { pullRequestsContract } from "./procedures/pull-requests";
export { settingsContract } from "./procedures/settings";
export {
	createdTerminalSessionSchema,
	createTerminalSessionInputSchema,
	launchTerminalSessionInputSchema,
	terminalContract,
} from "./procedures/terminal";
export { terminalAgentsContract } from "./procedures/terminal-agents";
export * from "./routes";
export * from "./schemas/agents";
export * from "./schemas/filesystem";
export * from "./schemas/git";
export * from "./schemas/terminal";
