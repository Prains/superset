/**
 * The workspace protocol: the zod schemas for everything a runtime must serve
 * to be a Superset workspace, independent of whether that runtime is a
 * laptop's host-service or a cloud sandbox.
 *
 * The package is schemas and nothing else. Drift is prevented by shared object
 * identity, not by a compliance checker: both runtimes pass these exact schema
 * objects to their `.input()` / `.output()` calls, so they cannot disagree
 * about a shape. tRPC's own `inferRouterInputs` / `inferRouterOutputs` cover
 * client-side type inference, so nothing here reimplements them.
 *
 * Modules mirror host-service's router layout
 * (`src/trpc/router/<namespace>/<namespace>.ts`) one-for-one. Exports are
 * namespace-prefixed — `terminalListOutput`, `gitGetStatusInput` — so a flat
 * import never collides. A `Schema` suffix marks a building block shared by
 * several procedures or nested inside another schema; `Input` / `Output` mark
 * a procedure's wire boundary.
 *
 * Deliberately NOT in the protocol (control-plane, not workspace-plane):
 * `workspaces.*`, `workspaceCreation.*`, `workspaceCleanup.*`, `workspace.*`,
 * `project.*`, `cloud.*`, `issues.*`, and `chat.*`. Creating, listing, and
 * destroying workspaces is something done TO a workspace from outside it — a
 * sandbox cannot create itself.
 */

export * from "./agents";
export * from "./attachments";
export * from "./auth";
export * from "./config";
export * from "./errors";
export * from "./events";
export * from "./filesystem";
export * from "./git";
export * from "./github";
export * from "./health";
export * from "./host";
export * from "./notifications";
export * from "./ports";
export * from "./pull-requests";
export * from "./routes";
export * from "./settings";
export * from "./shared";
export * from "./terminal";
export * from "./terminal-agents";
