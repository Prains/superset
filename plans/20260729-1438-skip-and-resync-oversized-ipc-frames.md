# Skip-and-resync oversized terminal IPC frames instead of aborting the stream

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template in `.agents/skills/create-plan/SKILL.md`.

## Purpose / Big Picture

Superset runs terminals through two custom binary protocols, and both of them currently treat an oversized frame as a fatal error. In the pty-daemon protocol the receiving end destroys the entire Unix socket connection — which is shared by every terminal session on the machine — so one bad frame kills every pane at once. In the desktop terminal-host protocol the decoder throws, and although a recent fix latches the error so it no longer floods the UI, the terminal that hit it is still dead until the user restarts it.

After this change, both decoders handle an oversized frame the way the Orca terminal does (a design we verified by reading its source): they read the frame header, see that the declared length exceeds the cap, and then consume exactly that many bytes from the stream without buffering them — staying byte-aligned with the sender the whole time. The stream survives, later frames parse normally, and the worst case shrinks from "every terminal dies" to "one write was dropped and a warning was logged." A sender-side guard is also added so our own code can never emit an oversized frame in the first place.

The result is demonstrable with unit tests: feed a decoder a frame that declares a 100MB payload, followed by normal frames, and observe that the normal frames still decode. Before this change the same input throws (desktop) or kills the connection (daemon).

## Assumptions

- The 8MB cap in the pty-daemon protocol and the 64MB cap in the desktop terminal-host protocol are correct ceilings and should not change. All legitimate traffic is far below them (input is chunked to 1MB or 8KB respectively; output flushes are ≤128KB–256KB).
- No legitimate producer in the current codebase emits a frame near either cap, so adding a sender-side "throw on oversized encode" guard cannot break real traffic. This must be confirmed during Milestone 3 (see Open Questions).
- A frame whose *header* is intact but whose declared length is over the cap is the only oversize case worth recovering from. If the stream is structurally corrupt (garbage where a header should be), no local recovery can restore alignment, and the existing abort/latch behavior is the right response.

## Open Questions

- When the daemon skips an oversized frame, should anything be surfaced to the renderer (e.g., a one-time error event on the affected session), or is a server-side `console.warn` enough? Impacts Plan of Work Milestone 1 and Validation. Current plan: log-only, because the skipped frame's session id lives inside the JSON we are discarding, so we cannot reliably attribute it. Decision Log placeholder below.
- ~~What `--buffer-bytes` value does host-service's DaemonSupervisor pass when spawning the daemon...~~ **Resolved 2026-07-29**: it never passes one at any call site. See Decision Log — this no longer blocks Milestone 3.

## Progress

- [ ] Milestone 1: pty-daemon `FrameDecoder` skip-and-resync + tests.
- [ ] Milestone 2: desktop `PtySubprocessFrameDecoder` skip-and-resync + tests.
- [ ] Milestone 3: sender-side encode guards + audit of legitimate frame sizes.
- [ ] Milestone 4: full validation (`bun run lint`, `bun run typecheck`, targeted `bun test` suites) and commit.

## Surprises & Discoveries

- `session.ts`'s catch around `subprocessDecoder.push(chunk)` (`apps/desktop/src/main/terminal-host/session.ts:276-291`, daemon reading subprocess stdout) does not latch and does not broadcast `SUBPROCESS_ERROR` — it only `console.error`s. `SUBPROCESS_ERROR` is a separate mechanism (`handleSubprocessFrame`'s `PtySubprocessIpcType.Error` case), triggered only when the subprocess itself sends an explicit Error frame over an otherwise-working decoder.
  Worse: `PtySubprocessFrameDecoder.push()` throws the oversize error (`pty-subprocess-ipc.ts:87-91`) *before* resetting `headerOffset`/`frameType`/`payload` (the resets are at lines 93-97, after the throw). So today, once this catch fires once, the decoder is left permanently wedged at `headerOffset === HEADER_BYTES`: every subsequent stdout chunk re-throws immediately on the same stale header, before consuming any new bytes. Ordinary PTY output silently stops reaching the renderer forever, with `console.error` spamming per chunk and no user-visible signal at all — a stronger failure than "the terminal is dead until restarted" (that phrase describes the separate, better-behaved `stdinCorrupted` latch on the input side). Milestone 2's skip-and-resync fixes this as a side effect, since the decoder never enters this wedged state once oversize stops throwing.
  Confirmed 2026-07-29 by tracing the throw in `push()` against the state resets that follow it.

## Decision Log

- Decision: Oversized frames are skipped silently at the protocol layer with a `console.warn`; structurally corrupt streams keep the existing fatal behavior (daemon: destroy connection; desktop subprocess: latch and stop decoding).
  Rationale: Skipping is only sound when the length header is trustworthy. Orca's decoder (src/relay/protocol.ts in the Orca repo) makes the same distinction and documents that throwing mid-buffer "corrupts every future frame."
  Date/Author: 2026-07-29 / Claude (pending user confirmation).
- Decision placeholder: renderer-visible signal for skipped daemon frames (see Open Questions).
- Decision: The Milestone 3 `encodeFrame` oversize-throw guard applies unconditionally, including to the snapshot/replay call site — no chunking needed, no unguarded carve-out.
  Rationale: `packages/host-service/src/daemon/DaemonSupervisor.ts` (`spawn()`, ~lines 1019-1028) never passes `--buffer-bytes` to the daemon child process at any call site — `commandArgs` only ever includes `--socket=${socketPath}`. So `bufferCap` always resolves to `DEFAULT_BUFFER_BYTES` = 64KB (`packages/pty-daemon/src/SessionStore/SessionStore.ts:4`), three orders of magnitude under the 8MB `MAX_FRAME_BYTES` cap. Re-grep for `--buffer-bytes` across `packages/host-service` at Milestone 3 execution time to confirm no call site was added since, but no design work is needed here.
  Date/Author: 2026-07-29 / Claude (verified via grep, pending user confirmation).
- Decision: `session.ts`'s catch around subprocess-stdout decoding and the `stdinCorrupted` latch in `pty-subprocess.ts` are kept after Milestone 2 as defensive/future-proofing code, not because they guard an existing reachable structural-corruption path — `PtySubprocessFrameDecoder.push()`'s oversize check is currently its *only* throw condition, and Milestone 2 removes it. See Surprises & Discoveries and Milestone 2 for detail.
  Date/Author: 2026-07-29 / Claude (pending user confirmation).

## Outcomes & Retrospective

To be written at completion.

## Context and Orientation

This work spans one app and two packages in the Bun + Turborepo monorepo:

- `apps/desktop` — the Electron desktop app. Its main process spawns a terminal-host daemon which in turn spawns one *PTY subprocess* per terminal session. (A PTY, "pseudo-terminal", is the kernel object that makes a program believe it is attached to a real terminal.) Daemon and subprocess talk over the subprocess's stdin/stdout using a tiny length-prefixed binary protocol defined in `apps/desktop/src/main/terminal-host/pty-subprocess-ipc.ts`.
- `packages/pty-daemon` — a standalone daemon that owns PTYs for the v2 terminal stack. Clients (package `packages/host-service`) connect over a Unix domain socket and exchange length-prefixed frames defined in `packages/pty-daemon/src/protocol/framing.ts`.
- `packages/host-service` — the local service that bridges renderer WebSockets to the pty-daemon. Its `DaemonClient` (`packages/host-service/src/terminal/DaemonClient/DaemonClient.ts`) already chunks terminal input into 1MB frames (added alongside the #5569 fix on this branch).

"Length-prefixed framing" means every message on the wire starts with a fixed-size header that declares how many payload bytes follow. The receiver reads the header, then reads exactly that many bytes. The two protocols differ in header shape:

- Desktop terminal-host: 5-byte header — 1 byte frame type + 4 bytes little-endian payload length. Cap: `MAX_FRAME_BYTES = 64MB` (`pty-subprocess-ipc.ts:28`). On a declared length over the cap, `PtySubprocessFrameDecoder.push` currently throws (`pty-subprocess-ipc.ts:87-91`) — before resetting `headerOffset`/`frameType`/`payload` (those resets are at lines 93-97, after the throw). Two independent call sites feed this decoder:
  - Subprocess reading commands from stdin (`apps/desktop/src/main/terminal-host/pty-subprocess.ts`): catches the throw and, since the #5569 fix, latches (`stdinCorrupted`) — sends one `sendError` (which the daemon relays to the renderer as `SUBPROCESS_ERROR` via `session.ts`'s `handleSubprocessFrame` `Error` case), then discards all further input.
  - Daemon reading subprocess stdout (`apps/desktop/src/main/terminal-host/session.ts:276-291`): the catch here only `console.error`s and does not broadcast anything. Because the throw fires before the state reset, this decoder is left permanently wedged once triggered — see Surprises & Discoveries.
- pty-daemon: 4-byte big-endian total length, then 4-byte big-endian JSON length, then UTF-8 JSON, then an optional binary payload tail. Cap: `MAX_FRAME_BYTES = 8MB` (`framing.ts:18`). `FrameDecoder.drain` currently throws on `totalLen > MAX_FRAME_BYTES` (`framing.ts:61-63`). The server catches any decode throw and calls `socket.destroy()` (`packages/pty-daemon/src/Server/Server.ts:376-389`) — the connection is shared by all sessions, so this kills every terminal at once. The same `FrameDecoder` runs client-side in `DaemonClient.onData`.

Why this matters even after #5569: the root cause of that bug (a queue flush double-writing a buffer after backpressure) is fixed, and input is now chunked below both caps. But the abort-on-oversize behavior remains a single point of failure with maximal blast radius — any future producer bug, version skew between daemon and client, or stream corruption from an unforeseen source detonates every session instead of degrading gracefully. Orca (a comparable Electron terminal we studied) explicitly discards oversized frames whole to stay synchronized; Warp avoids framing entirely on its PTY hop. This plan adopts the Orca approach.

Existing tests that matter:

- `packages/pty-daemon/src/protocol/framing.test.ts` — includes an oversize test at line ~50 asserting `toThrow(/frame too large/)`; this assertion changes.
- `apps/desktop/src/main/terminal-host/session.test.ts` — has fakes (`FakeChildProcess`, `sendFrame`) reused for new decoder tests; also contains the #5569 backpressure regression test.
- `apps/desktop/src/main/terminal-host/` has no dedicated test file for `pty-subprocess-ipc.ts` yet; Milestone 2 creates one.
- `packages/host-service/src/terminal/DaemonClient/DaemonClient.node-test.ts` — end-to-end tests against a real daemon `Server`, run with `bun run test:integration:daemon` from `packages/host-service` (note: the DaemonSupervisor test in that script needs `bun run build:daemon` in `packages/pty-daemon` first; without it that one file fails for environmental reasons).

## Plan of Work

### Milestone 1: pty-daemon FrameDecoder skip-and-resync

Modify `packages/pty-daemon/src/protocol/framing.ts` only in the `FrameDecoder` class; `encodeFrame`, `decodeFrame`, and the wire format itself do not change.

Give `FrameDecoder` a discard mode. Add two private fields: `discardRemaining: number` (bytes still to throw away; 0 means normal parsing) and a `skippedFrames: number` counter, plus an optional constructor callback `onOversizedFrame?: (declaredBytes: number) => void`. In `drain()`, when `totalLen > MAX_FRAME_BYTES`, instead of throwing: record `discardRemaining = HEADER_BYTES + totalLen` minus however many of those bytes are already buffered, drop the buffered portion, invoke the callback, and continue the loop. At the top of `drain()`'s loop, consume up to `discardRemaining` bytes from the buffer before attempting to read a header. This belongs in `drain()` alone, not duplicated into `push()`: both real call sites (`Server.ts:376-390`, `DaemonClient.onData`) always call `push()` immediately followed by `drain()`, so `push()` can keep its current simple append and `drain()` is the only place that ever needs to know about discard state. Discarded bytes must never be accumulated — the whole point is O(1) memory while skipping. Keep the existing throws for `totalLen < INNER_JSON_LEN_BYTES`, `jsonLen` exceeding the frame body, and `JSON.parse` failures: those indicate structural corruption where skipping cannot restore alignment, and the server's destroy-the-connection response remains correct for them.

In `packages/pty-daemon/src/Server/Server.ts`, pass the callback when constructing each connection's decoder so the daemon logs `[pty-daemon] skipped oversized frame (<n> bytes declared)` via `console.warn` (the daemon's stderr already goes to its log file). No other server change: with oversize no longer throwing, the existing catch block naturally stops firing for this case. Mirror the same callback in `DaemonClient` (`packages/host-service/src/terminal/DaemonClient/DaemonClient.ts`) where it constructs its `FrameDecoder`, logging via `console.warn`.

Update `packages/pty-daemon/src/protocol/framing.test.ts`: change the existing oversize test from asserting a throw to asserting that (a) the oversized frame produces no output, (b) the callback fired with the declared size, and (c) a valid frame appended *after* the oversized frame's bytes decodes correctly. Add a test where the oversized frame's bytes arrive split across many `push()` calls (e.g., a declared 20MB payload delivered in 64KB chunks) to prove discard mode spans chunk boundaries with stable memory, and a test where the discard boundary lands mid-chunk so the tail of the same chunk begins the next valid frame.

### Milestone 2: desktop PtySubprocessFrameDecoder skip-and-resync

Apply the same design to `PtySubprocessFrameDecoder` in `apps/desktop/src/main/terminal-host/pty-subprocess-ipc.ts`. This decoder is already streaming and stateful (header bytes accumulate in a fixed 5-byte buffer), so the change is: when `payloadLength > MAX_FRAME_BYTES`, set a `discardRemaining = payloadLength` field instead of throwing, reset the header state, and in the main `push()` loop consume up to `discardRemaining` bytes from the incoming chunk before resuming header parsing. Add the same optional `onOversizedFrame` callback.

Callers: `apps/desktop/src/main/terminal-host/pty-subprocess.ts` (subprocess reading commands from stdin) and `apps/desktop/src/main/terminal-host/session.ts` (daemon reading events from subprocess stdout). Both construct the decoder; pass a callback that logs one warning (subprocess: `sendError` once via the existing `stdinCorrupted`-adjacent path is NOT reused — a skipped frame is not corruption; just `console.error` to stderr). Keep the `stdinCorrupted` latch in `pty-subprocess.ts` and the try/catch in `session.ts` in place, but as defensive/future-proofing code rather than an active guard: the oversize check is currently the *only* throw condition in `PtySubprocessFrameDecoder.push()` (unlike the pty-daemon protocol, which retains two other genuine structural-corruption checks — see Milestone 1). Once it becomes skip-and-resync, `push()` has no remaining path that throws, so both handlers become unreachable unless a future change adds a new throw condition to the decoder. Don't describe them in code (comments included) as guarding an existing corruption case, since there isn't one left.

Create `apps/desktop/src/main/terminal-host/pty-subprocess-ipc.test.ts` (Bun test, colocated per AGENTS.md) covering: round-trip encode/decode of typed frames; oversized declared length is skipped and the following frame decodes; discard spanning multiple chunks; header split across chunks (existing behavior, previously untested).

### Milestone 3: sender-side guards and size audit

A skipped frame still means lost data, so senders must be unable to produce one. In `packages/pty-daemon/src/protocol/framing.ts`, make `encodeFrame` throw with a descriptive message if the computed `totalLen` exceeds `MAX_FRAME_BYTES` — failing loudly at the sender, where the bug is, instead of silently poisoning the peer.

Before landing that throw, audit every producer of daemon frames for maximum size: `DaemonClient.input` (chunked to 1MB — safe), daemon output frames (PTY reads, bounded by read buffer sizes — verify the constant), and snapshot/replay frames (`packages/pty-daemon/src/SessionStore/snapshot.ts` encodes a session's ring buffer; the cap is `bufferCap`, default 64KB via `DEFAULT_BUFFER_BYTES` in `SessionStore.ts:4`, but overridable by the `--buffer-bytes` CLI arg in `packages/pty-daemon/src/main.ts`). Confirmed 2026-07-29: `DaemonSupervisor.spawn()` (`packages/host-service/src/daemon/DaemonSupervisor.ts:1019-1028`) never passes `--buffer-bytes` at any call site — only `--socket=`. `bufferCap` therefore always defaults to 64KB in practice, three orders of magnitude under the 8MB cap, so no chunking is needed and `encodeFrame` can be guarded unconditionally, including for the snapshot call site. Re-grep for `--buffer-bytes` across `packages/host-service` at execution time to confirm no call site was added since this plan was written.

The desktop protocol's senders (`sendFrameToSubprocess` in session.ts chunks writes to 8KB; subprocess output flushes at ≤128KB) are three orders of magnitude below the 64MB cap; a mirror guard in `createFrameHeader`/`writeFrame` is optional and low-value — skip it unless the audit finds a large producer.

### Milestone 4: validation and commit

Run the full validation batch (see Concrete Steps), fix anything it surfaces, and commit on the current branch (`fix-large-paste-input`) with a conventional-commit message such as `fix(desktop,pty-daemon): skip oversized IPC frames instead of aborting the stream`. Do not push without the user's explicit go-ahead (repository owner preference).

## Concrete Steps

All commands run from the repo root unless noted.

Targeted tests while developing:

    bun test packages/pty-daemon/src/protocol/framing.test.ts
    # Expected: all pass, including the rewritten oversize tests

    cd apps/desktop && bun test src/main/terminal-host/
    # Expected: all pass (38 existing + new pty-subprocess-ipc tests)

    cd packages/host-service && bun run test:integration:daemon
    # Expected: DaemonClient.node-test.ts all pass. DaemonSupervisor.node-test.ts
    # requires `bun run build:daemon` in packages/pty-daemon first; if the bundle
    # is missing it fails with "Daemon bundle missing at .../pty-daemon.js" —
    # that failure is environmental, not caused by this change.

Final validation batch (per AGENTS.md rule 7, lint must exit 0 — warnings fail CI):

    bun run lint:fix
    bun run lint        # must exit 0
    bun run typecheck   # 35 tasks successful
    bun test packages/pty-daemon
    cd apps/desktop && bun test src/main/terminal-host/

## Validation and Acceptance

Acceptance is behavioral, proven by unit tests rather than manual paste (an oversized frame can no longer be produced from the UI now that input is chunked — that is the point):

1. Constructing a pty-daemon `FrameDecoder`, pushing a frame whose header declares a payload above 8MB followed by that many filler bytes and then a valid `{ type: "ping" }`-style frame, `drain()` yields only the valid frame, the oversized callback fired once, and no error was thrown. The same holds when the filler arrives across dozens of `push()` calls.
2. The equivalent holds for `PtySubprocessFrameDecoder` with its 64MB cap.
3. `encodeFrame` with a payload over 8MB throws an error naming the size and the cap.
4. A daemon `Server` connection that receives an oversized frame stays connected (covered implicitly: `Server.ts`'s destroy path only runs on decoder throw, and the new framing tests prove oversize no longer throws; optionally assert directly in an integration test if cheap).
5. The full suites listed in Concrete Steps pass, and `bun run lint` / `bun run typecheck` are clean.

## Idempotence and Recovery

All edits are ordinary source changes on a git branch; re-running any step is safe. If a milestone goes wrong, `git checkout -- <file>` restores the previous state — note that this branch already carries the #5569 fix commit (`6f4e33021`), so revert to that commit, not to `main`, if a hard reset is needed. The wire format is untouched, so mixed old/new versions of daemon and client remain compatible: a new client against an old daemon simply keeps today's abort behavior on the daemon side.

## Artifacts and Notes

The failure mode being eliminated, from the daemon server (`packages/pty-daemon/src/Server/Server.ts:376-389`):

    socket.on("data", (chunk) => {
        try {
            conn.decoder.push(chunk);
            for (const frame of conn.decoder.drain()) {
                this.dispatch(conn, frame.message as ClientMessage, frame.payload);
            }
        } catch (err) {
            conn.send({ type: "error", message: (err as Error).message, code: "EPROTO" });
            socket.destroy();   // <- kills every session on this shared connection
        }
    });

Orca's prior art (paraphrased from its `src/relay/protocol.ts` FrameDecoder): when a declared length exceeds the cap, discard exactly that many bytes and continue; the code comment notes that throwing "would leave the buffer in a partially consumed state … corrupting every future frame."

## Interfaces and Dependencies

No new dependencies. The only interface changes are additive and internal:

    // packages/pty-daemon/src/protocol/framing.ts
    export class FrameDecoder {
        constructor(opts?: { onOversizedFrame?: (declaredBytes: number) => void });
        push(chunk: Buffer): void;          // unchanged signature; never throws for oversize
        drain(): DecodedFrame[];            // unchanged signature; still throws on structural corruption
    }
    export function encodeFrame(message: unknown, payload?: Uint8Array): Buffer;
    // now throws Error(`frame too large to encode: <n> bytes (cap <cap>)`) when over cap

    // apps/desktop/src/main/terminal-host/pty-subprocess-ipc.ts
    export class PtySubprocessFrameDecoder {
        constructor(opts?: { onOversizedFrame?: (declaredBytes: number) => void });
        push(chunk: Buffer): PtySubprocessFrame[];  // never throws for oversize
    }

Both protocols' constants (`MAX_FRAME_BYTES` 8MB / 64MB) are unchanged.
