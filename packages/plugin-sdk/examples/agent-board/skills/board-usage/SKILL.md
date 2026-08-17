---
name: board-usage
description: Check the live status of every coding agent on this host (working, blocked, done) via the Agent Board plugin. Use when asked what agents are doing, whether anything is blocked, or before dispatching more agents.
---

# Agent Board

The Agent Board Superset plugin tracks every agent session on this host in
real time. Query it from any terminal:

```bash
superset x board --json
```

Returns cards: `{terminalId, workspaceName, branch, agentId, status, at}` with
status in `working | blocked | failed | done | idle | ended`. `blocked` means
the agent is waiting on a human decision — surface those first.

An HTTP mirror exists for tooling without the CLI:
`GET http://127.0.0.1:<host-port>/plugins/superset.agent-board/http/board`.
