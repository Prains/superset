import type { z } from "zod";

export type ProcedureKind = "query" | "mutation" | "subscription";

/**
 * Who may reach a procedure.
 *
 * - `authenticated`: requires the host bearer token (host-service's
 *   `protectedProcedure`/`queryProcedure`). The default.
 * - `public`: deliberately unauthenticated and safe to expose anywhere,
 *   including through the relay.
 * - `loopback-only`: deliberately unauthenticated, but only because the
 *   caller is an in-workspace agent hook dialing 127.0.0.1. A runtime that
 *   serves the contract MUST NOT route these from any remote transport
 *   (relay, tunnel, public ingress) — see `notifications.hook`.
 */
export type ProcedureExposure = "authenticated" | "public" | "loopback-only";

export interface ProcedureDeprecation {
	/** Contract path this procedure is expected to be renamed to. */
	replacement: string;
	reason: string;
}

export interface ProcedureSpec<
	Input extends z.ZodType = z.ZodType,
	Output extends z.ZodType = z.ZodType,
> {
	kind: ProcedureKind;
	/** `z.void()` for procedures that take no input. */
	input: Input;
	output: Output;
	exposure: ProcedureExposure;
	/**
	 * Server-side timeout budget for query procedures, in milliseconds.
	 * Omitted means `DEFAULT_QUERY_TIMEOUT_MS`. Meaningless for mutations
	 * and subscriptions, which carry no blanket budget.
	 */
	timeoutMs?: number;
	deprecated?: ProcedureDeprecation;
}

export interface ProtocolNamespace {
	[name: string]: ProtocolNode;
}

export type ProtocolNode = ProcedureSpec | ProtocolNamespace;

/**
 * Default budget applied by host-service's `queryProcedure` timeout
 * middleware when a procedure sets no `meta.timeoutMs`.
 */
export const DEFAULT_QUERY_TIMEOUT_MS = 5_000;

export function isProcedureSpec(node: ProtocolNode): node is ProcedureSpec {
	return "kind" in node && "input" in node && "output" in node;
}

/** Client-visible input type of a protocol node (or namespace of them). */
export type InferProtocolInput<Node> = Node extends ProcedureSpec
	? z.infer<Node["input"]>
	: { [Key in keyof Node]: InferProtocolInput<Node[Key]> };

/** Client-visible output type of a protocol node (or namespace of them). */
export type InferProtocolOutput<Node> = Node extends ProcedureSpec
	? z.infer<Node["output"]>
	: { [Key in keyof Node]: InferProtocolOutput<Node[Key]> };
