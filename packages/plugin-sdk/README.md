# @superset/plugin-sdk

Types, manifest schema, and build shims for Superset desktop plugins.

A plugin is **a directory with a `superset-plugin.json` manifest** plus up to two
entries: a backend (`server`) that runs **in-process inside the host-service** on the
machine that owns the workspaces, and a UI bundle (`app`) whose React components render
in **native slots** of the desktop app (right-sidebar tabs, command palette). One
package can target three audiences at once: a panel for humans, actions/events for the
system, and (soon) skills for agents.

**Trust model, stated plainly:** plugins are full-trust code, the same class as
`.superset/config.json` setup scripts. There is no sandbox; there IS containment —
every handler is time-boxed and error-contained, a plugin that throws at load lands as
`status: error` on its row without affecting other plugins or the host, and UI slots
are wrapped in error boundaries. Only install plugins from authors you trust, and read
the manifest (including `permissions`) before installing.

## Quickstart

```bash
superset plugin new my-plugin        # scaffold: manifest + server.ts + app.tsx
cd my-plugin
superset plugin build .              # esbuild the UI bundle → dist/app.js
superset plugin link .               # register the directory in place (dev mode)
```

Open any v2 workspace: your sidebar tab appears next to Files/Changes/Review, and your
commands appear in the command palette. The dev loop is:

```bash
# edit src/… then:
superset plugin build .              # if you changed the UI
superset plugin reload my.plugin-id  # re-reads manifest + reloads backend + UI
```

Linked plugins run from your directory; edits apply on reload. `superset plugin list`
shows every installed plugin with its status (`running` / `error` / `disabled`) and the
load error message when something broke.

## The manifest (`superset-plugin.json`)

```jsonc
{
	"id": "acme.review-board",          // lowercase, dot-namespaced, globally unique
	"name": "Review Board",
	"version": "1.0.0",                 // semver
	"description": "…",
	"minSupersetVersion": "1.22.0",     // optional
	"platforms": ["macos", "linux"],    // optional; omit = all
	"permissions": ["events:subscribe", "workspaces:read"], // declared, shown at install
	"server": "dist/server.js",         // backend entry (see "Backend" below)
	"app": "dist/app.js",               // prebuilt ESM UI bundle (see "UI" below)
	"contributes": {
		"sidebarTabs": [
			{ "id": "board", "label": "Board", "component": "BoardTab" }
		],
		"commands": [
			{ "id": "open", "title": "Review Board: Open",
			  "run": { "type": "open-sidebar-tab", "tabId": "board" } },
			{ "id": "refresh", "title": "Review Board: Refresh",
			  "run": { "type": "action", "action": "refresh" } }
		],
		"events": [
			{ "on": "workspace.created", "command": ["./hooks/on-create.sh"] }
		]
	}
}
```

Rules the validator enforces: ids are `author.plugin-name`; entry paths are relative
with no `..`; UI contributions require an `app` entry; a command's `open-sidebar-tab`
target must exist in `sidebarTabs`. Schema source of truth:
[`src/manifest.ts`](./src/manifest.ts).

### Contribution points

| Point | What it does | Runs code? |
|---|---|---|
| `sidebarTabs` | A tab in the workspace right sidebar rendering your `app` component | UI |
| `commands` | Command-palette entries; `run` either invokes a backend action or opens one of your tabs | backend / none |
| `events` | Spawn an argv command on a lifecycle event, with `SUPERSET_PLUGIN_*` env context — no backend needed | child process |
| `panes` | Reserved (schema exists; the pane slot is not wired yet) | — |
| `themes` | Reserved (not wired yet) | — |

## Backend (`server` entry)

Default-export a factory. Ship prebuilt JS (`dist/server.js`) — it loads with a plain
dynamic import. A TypeScript entry also works for dev links (loaded via jiti).

```ts
import type { SupersetPluginApi } from "@superset/plugin-sdk";

export default async function plugin(api: SupersetPluginApi) {
	api.log("loaded");

	// Named actions: invokable from your UI (ctx.invokeAction), your palette
	// commands, and `superset plugin invoke`.
	api.actions.register("refresh", async (params, { workspaceId }) => {
		return { ok: true };
	});

	// Persistent KV (per-plugin, JSON values ≤256KB, survives restarts).
	await api.storage.set("count", 1);
	const count = await api.storage.get<number>("count");

	// Low-volume lifecycle events. "*" receives every kind.
	api.events.on("agent.lifecycle", (event) => {
		// event.kind, event.workspaceId?, event.payload, event.occurredAt
	});

	// Push ephemeral payloads to your mounted UI components.
	api.realtime.publish({ type: "tick", count });

	// Supervised repeating task; cleared on unload/reload.
	api.background.interval(60_000, async () => {});

	// Live (non-archived) workspaces on this host: id, name, branch, type, projectId.
	const workspaces = await api.workspaces.list();

	return { dispose() {/* optional cleanup on unload/reload */} };
}
```

Event kinds: `workspace.created|updated|deleted`, `project.created|updated|deleted`,
`agent.lifecycle` (normalized hook events: `Start`, `Stop`, `PermissionRequest`,
`Failed`, `Attached`, `Detached`), `terminal.exit`, `port.added|removed`. High-volume
streams (terminal output, fs events) are deliberately not exposed.

Containment semantics you can rely on: the factory has 10s to return; action handlers
are time-boxed at 10s; event handlers at 5s (fire-and-forget, errors logged, never
propagated); a failed load tears down everything the factory registered.

## UI (`app` entry)

The `app` bundle is an ESM file whose **named exports** are React components referenced
by `component` in the manifest. `superset plugin build` produces it: esbuild with
`react` / `react/jsx-runtime` aliased to shims that read the host's React instance at
runtime — your components render in the host tree (hooks work, one React). Don't import
`react-dom`, and don't rely on Tailwind classes; use inline styles or ship a
`dist/app.css` sibling (auto-injected). Theme colors are available as the host's CSS
variables.

```tsx
import type { PluginSlotProps } from "@superset/plugin-sdk/ui";
import { useEffect, useState } from "react";

export function BoardTab({ ctx }: PluginSlotProps) {
	// ctx.pluginId, ctx.workspaceId
	// ctx.invokeAction(name, params?) → your backend action
	// ctx.onRealtime(handler) → payloads from api.realtime.publish (returns unsubscribe)
	const [state, setState] = useState<unknown>(null);
	useEffect(() => ctx.onRealtime(setState), [ctx]);
	return <div style={{ padding: 16 }}>{JSON.stringify(state)}</div>;
}
```

The `ctx` prop contract is additive-only within an SDK major.

## Installing plugins

```bash
superset plugin install ./some-dir            # copy into ~/.superset/plugins/<id>
superset plugin install owner/repo            # git clone (github shorthand) …
superset plugin install owner/repo --ref v1.2 # … pinned to a tag/branch, commit recorded
superset plugin link .                        # dev: run from the directory in place
superset plugin enable|disable|reload|uninstall <id>
superset plugin invoke <id> <action> --params '{"x":1}'
```

Install shows a preview (id, version, permissions, contribution counts) before anything
runs. Installs re-validate the manifest from the managed copy; the UI picks up
install/enable/disable/reload within ~2s (lifecycle events), no app restart needed.
State lives in the host DB (`plugins`, `plugin_kv`), so plugin data survives app and
host restarts; `uninstall` removes the managed checkout but a linked directory is never
deleted.

## Examples

- [`examples/hello-superset`](./examples/hello-superset) — minimal: counter tab,
  palette commands, realtime push, KV persistence.
- [`examples/agent-board`](./examples/agent-board) — a real feature: live board of
  every agent across workspaces (working / needs you / done), built on
  `agent.lifecycle` events. ~200 lines.

## Current limits (honest list)

- Slots today: right-sidebar tab + palette commands. Pane kinds, file views, settings
  pages, and keybindings are schema-reserved but not wired.
- `permissions` are declared and shown at install, not yet enforced — the backend runs
  with the host-service's full capability.
- No marketplace/registry yet; install is path/git only.
- SDK version is 0.x: contracts may change until the first tagged release.

## How this compares (for the curious)

The design borrows deliberately: manifest-first contributions readable without running
code (VS Code), full-trust-plus-containment in-process execution and the
one-package-many-audiences shape (bb), spawn-a-command event hooks and the
low-volume-events-only rule (herdr). Research and rationale:
`plans/20260815-plugin-system-surfaces.md`.
