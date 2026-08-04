# relay-do — Cloudflare Durable Objects relay (prototype)

Wire-compatible port of `apps/relay` to Cloudflare Workers + Durable Objects.
Speaks the exact same tunnel protocol (`@superset/shared/tunnel-protocol`) and
HTTP surface (`/tunnel`, `/hosts/:hostId/trpc/*`, `/hosts/:hostId/*` WS,
`/hosts/:hostId/_whoowns`, `/health`), so host-services and clients need zero
changes — point them at this URL via the `relay-url-override` PostHog flag.

## Why

One Durable Object per `hostId` replaces the parts of the Fly relay that exist
only because tunnels live on specific machines: the Upstash directory, the Lua
register/unregister/sweep scripts, fly-replay routing, the 6PN WebSocket
bridge, and the deploy drain choreography. Cloudflare routes every request for
a hostId to its DO globally. WebSocket hibernation keeps idle tunnels (most of
the fleet) out of billable duration.

## Architecture

- **Worker** (`src/index.ts`): stateless edge layer. JWT verification (JWKS)
  and `host.checkAccess` (LRU-cached per isolate) run here so slow auth work
  never blocks the single-threaded DO. Forwards to the host's DO by
  `idFromName(hostId)`.
- **`HostTunnel` DO** (`src/host-tunnel.ts`): terminates the host-service
  control WS and all client channel WSs for one host. Frame routing is a local
  tag lookup. Pings the host every 30s via a DO alarm (90s pong deadline,
  matching the Fly relay's 3-missed-pings window). Session state lives in DO
  storage so it survives hibernation.

## Deploy

```bash
cd apps/relay-do
bunx wrangler login       # Cloudflare account for superset
bun run deploy            # deploys superset-relay-do to <account>.workers.dev
```

Before first deploy, confirm `NEXT_PUBLIC_API_URL` in `wrangler.jsonc` matches
the Fly relay's secret of the same name (it is the JWT issuer/audience — a
mismatch 401s everything).

## Canary

Set the `relay-url-override` PostHog flag payload for your user only:

```json
{ "url": "https://superset-relay-do.<account>.workers.dev" }
```

Desktop, CLI, host-service, and the API's Slack-agent path all resolve the
relay URL through this flag, so your hosts tunnel into the DO relay while
everyone else stays on Fly. Roll back by clearing the flag.

## What the prototype should prove

1. Keystroke round-trip latency vs the Fly relay (the one thing we can't fix
   in our code if it's bad — no TCP_NODELAY control on Workers).
2. Large terminal output bursts stay under the 1MB-per-WS-message DO limit.
3. Host reconnect behavior through a `wrangler deploy` (DO restarts close all
   sockets; hosts should be back within their ~1s reconnect backoff).

## Known parity gaps (acceptable for the experiment)

- No Sentry; Workers observability (`wrangler tail`, dashboard logs) instead.
- No synthetic self-check loop.
- No `setOnline` debounce — flapping reconnects write online/offline
  per transition instead of coalescing within 250ms.
- No in-band `drain` message before deploys; hosts fall back to their normal
  reconnect backoff (1s base) instead of the instant-reconnect fast path.
- `_whoowns`/`/hosts` return `region: "cf"`; unauthorized requests to an
  offline host get 403 (Fly returns 503 because it checks tunnel presence
  before access).
