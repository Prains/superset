# Built-in "Superset CLI" preset

Ship a synthetic, app-provided preset in every user's preset bar that opens a terminal and
runs `superset --help`. Goal: teach users the CLI exists at the place they already launch
things — point-of-use discovery, not an announcement. No agent session, no prompt injection;
just show the command surface in a real terminal they can keep typing into.

Works out of the box because the bundled CLI shim (`~/.superset/bin/superset`) is already on
PATH inside every Superset-spawned terminal — yet nothing in the app ever uses or mentions it
beyond one banner on the Automations page.

## UX

Preset bar (`V2PresetsBar`), after the user's own presets:

```
[ ⌘1 claude ] [ ⌘2 codex ] [ ⌘3 run ] │ [ >_ Superset CLI · Built-in ]
```

- Chip shows a new `superset-cli` icon (terminal glyph) + "Built-in" micro-badge. No numbered
  hotkey (built-ins sit outside the `OPEN_PRESET_1..9` index).
- Tooltip: "Script workspaces, agents, and automations from any terminal — agents can use it
  too."
- Click → new terminal tab running `superset --help`. The user lands in a live shell with the
  full command tree printed, cursor ready.
- Manage dropdown (existing Eye/EyeOff rows): built-in row gets the same visibility toggle,
  backed by user preferences instead of the preset row (see Data).

Command choice: `superset --help` for v1. Alternatives considered — bare `superset` (same
output), `superset status` (assumes host running). A follow-on nicety: append one hint line,
e.g. `superset --help && echo '→ agents in Superset terminals can run these commands too'` —
decide at implementation.

## Architecture decisions

1. **Synthetic, merged at read time — never a persisted row.** Precedent: the `superset` chat
   agent in `useV2AgentChoices` (`renderer/hooks/useV2AgentChoices/useV2AgentChoices.ts`).
   Seeding a real `v2TerminalPresets` row is rejected: it would trip
   `useDefaultV2TerminalPresets`'s `existingPresets.length > 0` init guard, existing users
   (already initialized) would never get it, it would be deletable-forever, and the command
   couldn't be updated later. Merge-at-read also respects the 20260505 learnings doc (no
   `kind` discriminator on rows — the synthetic never touches the schema).
2. **Slug id `"superset-cli"`.** Slugs and UUIDs must not collide (`resolveHostAgentConfig`,
   `portableAgentValue` depend on it).
3. **Plain command preset — existing launch path.** `commands: ["superset --help"]`, no
   `agentId`, so `resolvePresetLaunchCommands` uses the command string as-is and
   `useV2PresetExecution` → `terminal.createSession({ initialCommand })` does the rest. No
   host-service changes, no agent dependency of any kind.

## Data changes

- `v2UserPreferencesSchema` (+ `DEFAULT_V2_USER_PREFERENCES`), in
  `CollectionsProvider/dashboardSidebarLocal/schema.ts`: add
  `hiddenBuiltinPresetIds: string[]` (default `[]`). Bounded (known slug set), singleton —
  satisfies the localStorage policy. `pinnedToBar` can't be used: `v2TerminalPresets.update()`
  throws on a row that doesn't exist in the collection.
- New hook `renderer/hooks/useBuiltinPresets/` exporting
  `BUILTIN_CLI_PRESET = { id: "superset-cli", name: "Superset CLI", description,
  commands: ["superset --help"] }` and `useBuiltinPresets()` (applies feature flag +
  hidden ids; hidden entries are still returned so manage surfaces can un-hide).
- Icon: reuse the existing `superset` key in `PRESET_ICONS` via `getPresetIcon("superset",
  isDark)` — no new assets needed.

## Edge cases

- **Project-targeted presets:** merge the synthetic AFTER `filterMatchingPresetsForProject`,
  so it never shadows or suppresses project-scoped auto-apply presets.
- **v1→v2 migration ledger:** untouched — no row exists, no `agentId`/name collision possible.
- **Shim missing (`bundled-cli.ts` returned `missing`/`skipped`):** `superset --help` prints
  command-not-found. Acceptable for v1 — the terminal error is at least honest. The
  Settings/CLI status surface (separate plan) is the real fix; once that tRPC status exists,
  the chip can hide or warn when the shim is absent.
- **Hotkey/sequential code paths:** built-ins are excluded from `getPresetLaunchPlan`
  sequencing and hotkey indexing; exactly one behavior (click → launch).

## Rollout & telemetry

- Gate on a PostHog flag `BUILTIN_CLI_PRESET` (`FEATURE_FLAGS` in
  `packages/shared/src/constants.ts`), ramp like `V1_AUTO_MIGRATION`. Experimental-settings
  toggle rejected: opt-in defeats the discovery purpose.
- Events: `builtin_preset_launched` (presetId), `builtin_preset_hidden` /
  `builtin_preset_unhidden`.

## Out of scope (separate plans)

- Settings → CLI section, onboarding "get more" step, desktop notice, Automations-banner
  dismissal fix (CLI surfacing plan).
- "Created via CLI" workspace provenance badge.
- An agent-driven "Orchestrator" built-in preset (launch an agent primed with
  `superset:orchestrate`) — considered, deferred; requires prompt injection via `agents.run`
  and an installed-agent dependency. This CLI preset is the v1.

## Build order

1. `hiddenBuiltinPresetIds` preference + `builtin-presets` module + feature flag plumbing.
2. Icon assets + `resolveV2PresetIconKey` case.
3. `V2PresetsBar` merge + chip + badge + manage-dropdown visibility row.
4. Telemetry events; tests (merge logic, hidden ids, no hotkey index shift, project-filter
   non-interference).
