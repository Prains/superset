#!/bin/sh
# git credential helper for a sandbox: brokers a credential from host-service
# for each git operation instead of holding one.
#
# Registered scoped to https://github.com so it is never asked about, and never
# answers for, any other host — two production systems (Codespaces, Gitpod)
# shipped the same bug where an unscoped helper handed the GitHub token to
# whatever host served the repo. The host is checked again inside for the same
# reason: git does not verify that a helper's answer matches its question.
#
# Only `get` is implemented. `store`/`erase` are no-ops on purpose: nothing is
# stored, so there is nothing to erase, and git's own in-memory cache is bounded
# by the password_expiry_utc host-service returns.
[ "$1" = "get" ] || exit 0

input=$(cat)
host=$(printf '%s\n' "$input" | sed -n 's/^host=//p' | head -1)
[ "$host" = "github.com" ] || exit 0

# Push scope: git tells the helper which URL it is about to hit but not which
# branch, so the branch is read from the checkout. host-service refuses to mint
# for a push anywhere but the workspace's own branch; that refusal is the one
# control that survives a prompt-injected agent, and it needs this to work.
branch=$(git -C "${GIT_WORK_TREE:-$PWD}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)

printf '%s\n%s\n' "$input" "branch=$branch" |
  curl -sS -f -m 20 -X POST --data-binary @- \
    "http://127.0.0.1:${SUPERSET_SANDBOX_HOST_PORT:-4879}/git-credential" 2>/dev/null
