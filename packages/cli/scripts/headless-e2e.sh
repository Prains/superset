#!/usr/bin/env bash
#
# Headless-host end-to-end test for a built CLI distribution (Linux only).
# Simulates the #6254 deployment class — a systemd/CLI-launched host on a
# machine that never ran the desktop app — and verifies the full agent-hook
# chain the desktop otherwise provides:
#
#   1. First boot provisions ~/.superset (notify.sh, bin wrappers, zsh/bash
#      bootstrap) and every agent's managed hook config from the tarball's
#      lib/agent-templates — with NO SUPERSET_HOME_DIR in the environment,
#      so the ~/.superset fallback is what's under test.
#   2. The provisioned notify.sh delivers a lifecycle event to
#      notifications.hook and a row lands in terminal_agent_bindings.
#      Unknown terminal ids are accepted (200) but recorded nowhere.
#   3. The login-shell env merge picks up PATH entries only a login shell
#      exports (the host is launched with a stripped systemd-like PATH).
#   4. A restart is idempotent: no file rewrites, no duplicated hook entries.
#
# DESTRUCTIVE: wipes $HOME/.superset, ~/.claude, ~/.agents, ~/.codex,
# ~/.gemini and appends to ~/.profile. Only runs when
# SUPERSET_HEADLESS_E2E=1 — set by build-dist-linux-docker.sh, which runs
# this inside a throwaway container after the smoke test.
#
# Usage: headless-e2e.sh <dist-dir>
#   <dist-dir>  extracted distribution root (contains bin/, lib/, share/)
set -euxo pipefail

DIST="$(cd "${1:?usage: headless-e2e.sh <dist-dir>}" && pwd)"

if [[ "${SUPERSET_HEADLESS_E2E:-}" != "1" ]]; then
  echo "[e2e] refusing to run: wipes \$HOME agent configs. Set SUPERSET_HEADLESS_E2E=1 inside a disposable container." >&2
  exit 1
fi
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[e2e] linux only (stat -c, systemd-like env simulation)" >&2
  exit 1
fi

# ── Fixture: a fresh home with a login-shell-only PATH addition ──────────
rm -rf "$HOME/.superset" "$HOME/.claude" "$HOME/.agents" "$HOME/.codex" "$HOME/.gemini"
mkdir -p /opt/fake-tools/bin
grep -q fake-tools "$HOME/.profile" 2>/dev/null || \
  echo 'export PATH="/opt/fake-tools/bin:$PATH"' >> "$HOME/.profile"

ORG="00000000-0000-4000-8000-0000000000bb"
PORT="$("$DIST/lib/node" -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
HSDIR="$(mktemp -d)"

cleanup() {
  [[ -n "${HSPID:-}" ]] && kill "$HSPID" 2>/dev/null || true
  pkill -f "$DIST/lib/pty-daemon" 2>/dev/null || true
  rm -rf "$HSDIR"
}
trap cleanup EXIT

boot_host() {
  # systemd-like environment: stripped PATH, no SUPERSET_HOME_DIR.
  env -i \
    PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    HOME="$HOME" \
    SHELL=/bin/bash \
    ORGANIZATION_ID="$ORG" \
    AUTH_TOKEN="e2e-token" \
    SUPERSET_API_URL="https://api.superset.sh" \
    PORT="$PORT" HOST_SERVICE_PORT="$PORT" \
    HOST_SERVICE_SECRET="e2e-secret" \
    HOST_DB_PATH="$HSDIR/host.db" \
    HOST_MIGRATIONS_FOLDER="$DIST/share/migrations" \
    "$DIST/bin/superset-host" > "$1" 2>&1 &
  HSPID=$!
}

await_healthy() {
  local ok=0
  for _ in $(seq 1 120); do
    if curl -fsS -m 2 "http://127.0.0.1:$PORT/trpc/health.check" >/dev/null 2>&1; then ok=1; break; fi
    kill -0 "$HSPID" 2>/dev/null || break
    sleep 0.5
  done
  if [[ "$ok" != 1 ]]; then
    echo "[e2e] FAIL host never healthy" >&2
    cat "$1" >&2
    exit 1
  fi
}

boot_host "$HSDIR/host.log"
await_healthy "$HSDIR/host.log"
sleep 3  # let async provisioning (managed skills) and shell-env probe settle

echo "[e2e] === assert: provisioning artifacts ==="
test -x "$HOME/.superset/hooks/notify.sh"
grep -q "Superset agent notification hook" "$HOME/.superset/hooks/notify.sh"
test -f "$HOME/.superset/zsh/.zshrc"
grep -q "133;A" "$HOME/.superset/zsh/.zlogin"
test -f "$HOME/.superset/bash/rcfile"
WRAPPERS=$(ls "$HOME/.superset/bin" | wc -l)
[[ "$WRAPPERS" -ge 12 ]] || { echo "[e2e] FAIL wrappers=$WRAPPERS"; exit 1; }

echo "[e2e] === assert: managed hook configs ==="
"$DIST/lib/node" -e '
  const s = require("fs").readFileSync(`${process.env.HOME}/.claude/settings.json`, "utf8");
  const hooks = JSON.parse(s).hooks;
  const want = ["SessionStart","SessionEnd","UserPromptSubmit","Stop","StopFailure","PostToolUse","PostToolUseFailure","PermissionRequest"];
  const missing = want.filter((k) => !(k in hooks));
  if (missing.length) { console.error("missing:", missing); process.exit(1); }
  const cmd = hooks.Stop[0].hooks[0].command;
  if (!cmd.includes("$SUPERSET_HOME_DIR/hooks/notify.sh")) { console.error("bad cmd:", cmd); process.exit(1); }
  console.log("[e2e] claude hook groups OK");
'
test -f "$HOME/.codex/hooks.json"
test -f "$HOME/.gemini/settings.json"

echo "[e2e] === assert: managed skills from bundled templates ==="
test -f "$HOME/.claude/skills/superset/skills/doctor/SKILL.md"
ls "$HOME/.agents/skills" | grep -q "superset-doctor"

echo "[e2e] === assert: login-shell PATH merge ==="
grep -q "login-shell PATH entries into process env" "$HSDIR/host.log"

echo "[e2e] === assert: notify.sh -> notifications.hook -> host DB ==="
# Seed a real workspace + terminal session; the hook deliberately ignores
# unknown terminal ids (it is unauthenticated), which we also assert below.
NODE_PATH="$DIST/lib/node_modules" HOST_DB="$HSDIR/host.db" "$DIST/lib/node" -e '
  const db = require("better-sqlite3")(process.env.HOST_DB);
  db.prepare("insert into workspaces (id, worktree_path, branch, type, created_at, updated_at) values (?,?,?,?,?,?)")
    .run("e2e-ws-1", "/tmp/e2e-ws", "main", "worktree", Date.now(), 0);
  db.prepare("insert into terminal_sessions (id, origin_workspace_id, status, created_at) values (?,?,?,?)")
    .run("e2e-terminal-1", "e2e-ws-1", "active", Date.now());
'

fire_hook() {
  echo '{"hook_event_name":"Stop","session_id":"e2e-session-1"}' | \
    env SUPERSET_TERMINAL_ID="$1" \
        SUPERSET_AGENT_ID="claude" \
        SUPERSET_DEBUG_HOOKS=1 \
        SUPERSET_HOST_AGENT_HOOK_URL="http://127.0.0.1:$PORT/trpc/notifications.hook" \
        bash "$HOME/.superset/hooks/notify.sh" 2>&1 || true
}

STATUS=$(fire_hook "e2e-unknown-terminal")
echo "$STATUS" | grep -q "host-service dispatched status=200"
STATUS=$(fire_hook "e2e-terminal-1")
echo "$STATUS"
echo "$STATUS" | grep -q "host-service dispatched status=200"

( cd /tmp && NODE_PATH="$DIST/lib/node_modules" HOST_DB="$HSDIR/host.db" "$DIST/lib/node" -e '
  const db = require("better-sqlite3")(process.env.HOST_DB);
  const rows = db.prepare("select terminal_id, agent_id, agent_session_id from terminal_agent_bindings").all();
  console.log("[e2e] terminal_agent_bindings:", JSON.stringify(rows));
  if (rows.length !== 1) { console.error("expected exactly 1 binding (unknown terminal must be ignored)"); process.exit(1); }
  if (!rows.some((r) => r.terminal_id === "e2e-terminal-1" && r.agent_id === "claude" && r.agent_session_id === "e2e-session-1")) process.exit(1);
' )

echo "[e2e] === assert: idempotent re-provisioning on restart ==="
kill "$HSPID"; wait "$HSPID" 2>/dev/null || true
NOTIFY_MTIME1=$(stat -c %Y "$HOME/.superset/hooks/notify.sh")
boot_host "$HSDIR/host2.log"
await_healthy "$HSDIR/host2.log"
NOTIFY_MTIME2=$(stat -c %Y "$HOME/.superset/hooks/notify.sh")
[[ "$NOTIFY_MTIME1" == "$NOTIFY_MTIME2" ]] || { echo "[e2e] FAIL notify.sh rewritten on unchanged content"; exit 1; }
CLAUDE_HOOK_COUNT=$("$DIST/lib/node" -e 'console.log(JSON.parse(require("fs").readFileSync(`${process.env.HOME}/.claude/settings.json`,"utf8")).hooks.Stop.length)')
[[ "$CLAUDE_HOOK_COUNT" == "1" ]] || { echo "[e2e] FAIL duplicate hook entries after re-provision: $CLAUDE_HOOK_COUNT"; exit 1; }

echo "[e2e] ALL HEADLESS E2E CHECKS PASSED"
