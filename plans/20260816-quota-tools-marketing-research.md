# Quota-Tracker Marketing Research — AI Subscription Usage Tools

*2026-08-16. Research for Superset's Usage tab (per-account quota % + reset countdowns for Claude Code and Codex, read from local CLI logins) and the future model-dropdown quota meter.*

Sources: five repos cloned to `/tmp/quota-tools-research/` (runway, CodexBar, claudebar, ai-usagebar, omarchy-ai-usage), ccusage README, HN/Reddit threads, X replies to Theo's T3 Code usage-page tweet (retrieved via X API), steipete.me. All quotes verbatim with links.

---

## 1. Per-tool positioning + feature matrix

### Positioning at a glance

| Tool | Stars | Headline pitch | What they lead with |
|---|---|---|---|
| **CodexBar** (steipete) | 20,145 | "Every AI coding limit, in your menu bar. — May your tokens never run out." | Provider breadth (69 providers), plan-around-resets, privacy-first ("without having to login") |
| **ccusage** (ryoppippi) | 17,955 | "Analyze coding (agent) CLI token usage and costs from local data" | Zero-install `npx ccusage`, cost-vs-API-savings on Max plans, 5-hour billing blocks, 16+ agent CLIs, offline |
| **ai-usagebar** (akitaonrails) | 274 | Native Omarchy panel + Waybar widget + tabbed TUI for AI plan usage | Rust rewrite of claudebar, drop-in compatible, multi-surface (panel/bar/TUI), multi-provider, multi Claude accounts |
| **claudebar** (mryll) | 46 | "Waybar widget that shows your Claude AI usage limits — session, weekly, per-model — with colored progress bars and countdown timers" | Pure Bash, zero deps, deep format customization, pacing math |
| **runway** (mstallone) | 42 | "Fast, observable AI usage across every provider and account, right from the macOS menu bar" | Speed benchmarks vs upstream fork (0.29s launch vs 5.4s, 238MB vs 1.09GB RAM), multi-account per provider, no analytics |
| **omarchy-ai-usage** (rodrigo-sntg) | 4 | "AI usage monitoring for Omarchy — track your rate limits directly from Waybar" | CodexBar-for-Linux clone: notifications, sparkline history, TUI |

Positioning notes:
- **CodexBar** won on breadth + no-login. Its "Why" section is four bullets: *plan around resets* ("stop guessing whether to start that long task"), credits/spend, live provider-status incidents, privacy-first. Peter's precursor (Vibe Meter) pitch: "I needed a simple way to track AI spending without constantly checking dashboards" ([steipete.me](https://steipete.me/posts/2025/vibe-meter-monitor-your-ai-costs)). No dedicated CodexBar blog post exists; positioning lives entirely in README/codexbar.app. It spawned a whole ecosystem of community ports (Windows, Android, GNOME, KDE, Waybar, tmux) built on its CLI's JSON output — the CLI-as-platform move is what made it a category standard.
- **runway** is positioned *against* bloat — its README opens with a benchmark table (launch time, popover latency, RAM) because CodexBar/OpenUsage's resource use is the category's best-known wound.
- **ccusage** is the OG: local-log cost analysis, not live quota. Its viral hook was never "avoid limits" — it was "look how much my $200 Max plan would cost at API rates."
- **claudebar/ai-usagebar/omarchy-ai-usage** are the Linux answer; all three cite CodexBar/claudebar lineage in their READMEs. Notably they hit the same undocumented `api.anthropic.com/api/oauth/usage` endpoint Superset uses, and document its aggressive rate limits (429s below ~300s polling).

### Feature matrix

| Feature | CodexBar | runway | claudebar | ai-usagebar | omarchy-ai-usage | ccusage |
|---|---|---|---|---|---|---|
| Quota % + reset countdown | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ blocks only |
| Providers | 69 | 12 | 1 (Claude) | ~17 | 4 | 16+ CLIs (logs) |
| Pace indicators ("will I run out?") | ✅ (+community ports) | ✅ | ✅ ratio + point-based, tolerance bands | ✅ (inherited) | ❌ | ❌ |
| Near-limit notifications | ✅ session quota + weekly-reset confetti | ✅ 3 pace-aware alerts: Almost Out / Cutting It Close / Will Run Out (default off) | ❌ (bar color) | ❌ (bar color) | ✅ 80%/95% thresholds + cooldown | ❌ |
| Menu-bar/panel pinning | ✅ per-provider items or Merge Icons | ✅ pin up to 2 metrics/provider, text or mini-bars | ✅ Waybar | ✅ Waybar/Quattro/GNOME/macOS | ✅ Waybar | ❌ CLI |
| Multi-account per provider | partial (token-account settings) | ✅ core pitch, rename account cards | ❌ | ✅ named Claude accounts, per-account tabs | ❌ | ❌ |
| No-login / reuse local creds | ✅ core pitch | ✅ ("no extra login") | ✅ reads `~/.claude/.credentials.json` | ✅ | ✅ | ✅ local logs only |
| Screen-share masking | ❌ | ✅ auto-swaps strip to wordmark during capture | ❌ | ❌ | ❌ | ❌ |
| CLI / scriptable JSON | ✅ `codexbar` (macOS+Linux), basis of all ports | ✅ one-shot `runway` CLI, cached | ✅ (is a CLI) | ✅ `--json`, `usage --json` | ✅ scripts | ✅ (is a CLI) |
| Local HTTP API | ✅ `codexbar serve` | ✅ `127.0.0.1:6736/v1/limits` | ❌ | ❌ | ❌ | ❌ |
| iOS companion / sync | ❌ (WidgetKit only) | ✅ iOS app + lock-screen widgets, private iCloud sync | ❌ | ❌ | ❌ | ❌ |
| Cost estimates from local logs | ✅ 7/30-day, SQLite-capped | ✅ Today/Yesterday/30d tiles, native (no Node) | ❌ | ⚠️ context overlay only | ❌ | ✅ core feature |
| Usage history / sparklines | ✅ charts | ✅ iOS trend chart | ❌ | ❌ | ✅ ▁▂▃▄▅▆▇█ | ✅ reports |
| Theming | ✅ 21 languages, display controls | ✅ native settings | ✅ Omarchy theme auto-detect + CSS classes | ✅ Omarchy/One Dark | ✅ auto GTK dark/light | ❌ |
| Provider status/incident polling | ✅ badges + icon overlay | ❌ | ⚠️ 429 fallback indicator | ⚠️ stale markers | ⚠️ retry/backoff | ❌ |
| Platform | macOS app; CLI macOS+Linux | macOS 15+; iOS | Linux/Waybar | Linux + macOS + Windows(TUI) | Arch/Omarchy | anywhere (Node) |
| Stale-while-revalidate cache | ✅ adaptive refresh | ✅ instant cached paint, 5-min refresh | ✅ 60s TTL | ✅ atomic + flock | ✅ configurable TTL | n/a |

### Features we hadn't considered (idea bank)

1. **Runway "Memory Explorer"** — a window that discovers every agent memory/instruction file on disk (CLAUDE.md, per-project memories, AGENTS.md, GEMINI.md), with edit/create/delete and an index-sync for Claude's MEMORY.md. Adjacent to usage, same "one place to see agent state" instinct.
2. **Screen-share masking** (runway) — auto-hide usage numbers when macOS reports screen capture; "Token counts and spend never show up in front of an audience." Cheap, delightful, demo-friendly.
3. **Pace-aware notifications** (runway) — not just thresholds: "Will Run Out" *projects* whether you'll exhaust before reset; dedup + re-arm semantics carefully specified.
4. **Pacing indicators** (claudebar) — ↑/→/↓ vs even burn-rate, with tolerance bands and an elapsed-time marker rendered inside the progress bar. Answers "at this rate, will I run out before reset?"
5. **"Remaining" battery framing** (claudebar `--remaining`) — flip from "42% used" to "58% left"; some users think in headroom, not consumption.
6. **Weekly-reset confetti** (CodexBar) — celebration on reset; the reset moment is an emotional event.
7. **Local HTTP API + one-shot CLI for agents** (runway/CodexBar) — *agents themselves* read quota JSON to decide pacing. `codexbar serve` powers ~10 community ports.
8. **iCloud-synced iOS widgets** (runway) — spend/usage on the lock screen, combined across Macs, private CloudKit.
9. **Provider incident badges** (CodexBar) — distinguishes "you're throttled" from "Anthropic is down."
10. **Usage history sparklines + clipboard export** (omarchy-ai-usage).
11. **Auto OAuth token refresh** (claudebar et al.) — refresh the CLI's token when near expiry so the meter never dies while the user is away.
12. **Merge Icons / provider cycling** (CodexBar, ai-usagebar) — one compact item cycling providers, for menu-bar real-estate anxiety.

### What they say about privacy/ToS

- **CodexBar**: dedicated "Privacy note" — "It doesn't crawl your filesystem; it reads a small set of known locations… no passwords are stored"; documents every macOS permission and why; points at a community audit ([issue #12](https://github.com/steipete/CodexBar/issues/12)). Agent-aware refresh *asks before* inspecting the process list.
- **runway**: "Runway collects no product analytics or usage statistics" — no crash reporting, no identifiers; deleted the retired analytics ID on upgrade. Claude access "strictly read-only… Claude owns its logins and their rotation." iCloud sync documented as never developer-visible.
- **claudebar**: warns the `/api/oauth/usage` endpoint is "undocumented and has aggressive rate limits" (links anthropics/claude-code#30930) — honest about fragility rather than about ToS.
- **Community ToS anxiety is real**: "Is codexBar (Claude usage tracker) safe to use?" ([r/ClaudeCode](https://www.reddit.com/r/ClaudeCode/comments/1qrlf00)); a Windows-widgets author: "Technically, this is against Anthropic's policy, so be aware" ([r/SideProject](https://www.reddit.com/r/SideProject/comments/1rfakqf)). Nobody has a clean answer; the winning tools answer it with *read-only, local-only, open-source*.

---

## 2. Ranked: what people love (with real quotes)

**#1 — Cost-vs-API-savings framing + vanity token counts** (highest engagement; ccusage's whole growth loop)
- "TIL I spent $7000 worth of tokens in the last month. Awesome project!" — [r/ClaudeAI on ccusage](https://www.reddit.com/r/ClaudeAI/comments/1levs3i)
- "my total tokens used since I started using Claude Code on May 27th was 1,374,439,311 worth around $3397.34" — joshmlewis, [HN](https://news.ycombinator.com/item?id=44317012)
- "I'm on the $100/mo Max plan and have been running $600-800/mo in terms of usage" — extr, [HN ccusage thread](https://news.ycombinator.com/item?id=44610925)
- "cause it's fun to see how much tokens people are guzzling down" — viberank author, [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1lqfcn8)
- ⚠️ Double-edged: see complaint #7 (flexing invites clampdowns).

**#2 — Limit-anxiety relief** (the founding story of nearly every tool)
- "I kept slamming into Claude Code limits mid-session and couldn't find a quick way to see how close I was getting" — Claude Code Usage Monitor author, [HN 245pts](https://news.ycombinator.com/item?id=44317012)
- "very frustrating to get only the Approaching Limit - Usage Will Reset at X time (a few hours wait)" — [r/ClaudeAI](https://safereddit.com/r/ClaudeAI/comments/1lh71x0)
- "I've often exceeded the limit mid-process" — [HN, claudecodeusage 161pts](https://news.ycombinator.com/item?id=46544524)

**#3 — Glanceability / zero-click visibility**
- "Love it, installed and set it to run at Login… I had to always go to claude settings for this." — [HN](https://news.ycombinator.com/item?id=46544524)
- "I was frustrated with recent OpenAI changes to add one more click to look into usage limits. So I made a solution that requires 0 clicks" — Codex Minibar author, [r/codex](https://www.reddit.com/r/codex/comments/1uvfhde)
- "man do I just want a way to quickly glance at my API credits" — teekert, [HN](https://news.ycombinator.com/item?id=44317012)
- "I needed a simple way to track AI spending without constantly checking dashboards" — steipete, [Vibe Meter post](https://steipete.me/posts/2025/vibe-meter-monitor-your-ai-costs)

**#4 — Multi-account / multi-provider juggling** (fastest-growing unmet demand)
- "particularly when you pair it with CodexBar and can easily see your token spend across multiple subscriptions" — mrshu, HN
- "This isn't taking my other account into consideration. I have work and personal separate codex subs" — [X reply to Theo](https://x.com/iM_Nizam10/status/2086786420883202458)
- "Do you guys have native multi-account yet? The one thing I can't do without" — [X](https://x.com/JJdoesTech/status/2086783228950482972). **Theo's answer: "Don't do multi account in app, makes no sense with how harnesses work. CLIProxyAPI is what you want"** ([X](https://x.com/theo/status/2086873017439891895)) — he punted on exactly the thing Superset can do.
- "I have 2 devices one for work and one for personal projects and it would be great if I can track on both" — [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1levs3i)

**#5 — Cross-machine/cross-surface aggregation** (the praised differentiator in Theo's launch)
- "the cross-machine history is the actual feature here" — [X reply](https://x.com/JulienZammit1/status/2086620179493011694)
- Theo's own hook: "uses the actual Claude and Codex history on all your machines, not just the T3 Code usage" — [tweet](https://x.com/theo/status/2086053137115406588)
- "This is the kind of usage dashboard developers actually need. Clean, detailed, and genuinely useful." — [X](https://x.com/Juice_LabAKM/status/2086388017191899638)

**#6 — Free / open-source / zero-install / small-enough-to-audit**
- "I really like how easy it is to run using bunx, pnpx, npx, etc." — [HN on ccusage](https://news.ycombinator.com/item?id=44610925)
- "the entire source is ~400 lines of Swift" (smallness as trust) — [HN](https://news.ycombinator.com/item?id=46544524); cf. "Show HN: A Claude usage menu bar small enough to read before you run it" ([HN](https://news.ycombinator.com/item?id=49210250))

**#7 — Privacy / local-only / no-login** (mostly maker-side positioning, but it answers a real trust objection)
- CodexBar's repo description *is* the pitch: "Show usage stats for OpenAI Codex and Claude Code, **without having to login**"
- "The token never leaves your machine except to Anthropic's own API endpoint" — dev, [HN](https://news.ycombinator.com/item?id=46544524)

**#8 — Reset-timer planning** (weakest standalone theme; usually bundled into glanceability — but it was the top ask in Theo's replies)
- "Will we be able to see our usage limits in there and codex resets?" — [X reply to Theo](https://x.com/thejoaosv/status/2086402203309289979)
- CodexBar's "Why": "stop guessing whether to start that long task"
- Whole products exist on this framing (AgentPace "Know when you'll run out", codexrunway.com "Does Codex Reset Today?") but organic user quotes are scarce.

**Meta-theme: users think vendors should ship this natively**
- "they really should integrate this kind of thing, it is very annoying" — waynenilsen, [HN](https://news.ycombinator.com/item?id=44317012). An IDE that has it built in (Superset) *is* the native version.

---

## 3. Complaints / gaps (= positioning openings)

1. **Inaccurate estimates vs official numbers** — the #1 credibility killer for log-parsing tools.
   - "the live count is completely inaccurate. I just approached my usage limit and ccusage is showing only 15% usage lol" — [r/ClaudeAI](https://safereddit.com/r/ClaudeAI/comments/1lh71x0)
   - "Today I updated ccusage and my total cost went down from 10k to 7k… I guess it was counting duplicate tokens" — [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1levs3i)
   - Loudest reply to Theo's launch: "Is it possible that this is actually correct @theo?" — [quote tweet](https://x.com/orcdev/status/2086238306002407649); a user found JSONL duplicate usage-object double counting: "Collapsing them on the message id cut my totals by ~2x" — [X](https://x.com/underemployed/status/2086509412018008264)
   - → Superset opening: we read the **provider's own quota %** (the same numbers the CLI enforces), not log-derived estimates. Say so loudly.
2. **Memory/CPU bloat** — CodexBar's biggest liability; competitors position directly against it.
   - "The fact that Codexbar takes 7GB of RAM on macOS shows just how little attention to performance/design he pays" — behnamoh, HN
   - "just like CodexBar but uses 0% CPU and 31MB" — CodexPeek pitch, [r/codex](https://www.reddit.com/r/codex/comments/1rq9z6l); runway's whole README opens with the RAM benchmark.
   - → Superset opening: zero extra processes — it lives in the IDE you already run.
3. **Keychain prompts / credential fear / ToS anxiety**
   - "i'm fed up with the keychain prompt" — [r/codex](https://www.reddit.com/r/codex/comments/1r6z1kl); "Is codexBar… safe to use?" — [r/ClaudeCode](https://www.reddit.com/r/ClaudeCode/comments/1qrlf00)
   - "Getting people used to just running code like this that has full access to the system is slightly concerning" — [HN](https://news.ycombinator.com/item?id=44610925)
4. **Breaks when providers change formats/endpoints** — structural fragility of the whole category.
   - "Just days after launch, Anthropic removed the costUSD field from logs. Panic mode!" — ryoppippi, [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1levs3i)
   - claudebar's README warns of 429s on the undocumented usage endpoint below 300s polling.
5. **Platform gaps** — macOS-only spawned a Windows/Android/Linux clone economy ("I built them because I was jealous of all these Mac users sharing their fancy CodexBar app" — [r/SideProject](https://www.reddit.com/r/SideProject/comments/1rfakqf)). Superset ships cross-platform by default.
6. **Scope confusion + coverage gaps** — Theo's repliers immediately asked *what's counted*: "Does it only count the tokens spent through t3code or with any codex/claude usage on the machine?" ([X](https://x.com/khalilabdalmje1/status/2086494091638927369)); "Seems like the Claude one is only seeing the default Claude profile and not my 2 custom profiles" ([X](https://x.com/_watzon/status/2086471687907004896)); "Why doesn't it pick up OpenCode usage?" ([X](https://x.com/AmmarAliShahK/status/2086451821867077963)). Label scope explicitly; handle `CLAUDE_CONFIG_DIR` profiles.
7. **Usage-flexing backlash** — "People spending $5000 of tokens and paying $200 is why we can't have nice things" / "Now everyone will have weekly limits." — [viberank thread](https://www.reddit.com/r/ClaudeAI/comments/1lqfcn8); "you guys yelling about it so loudly from the rooftops is really really not helping your case lol" — swyx, [HN](https://news.ycombinator.com/item?id=44610925). Marketing implication: frame around *planning and headroom*, not bragging about extraction.
8. **Vibe-coded clone fatigue** — "a simple search shows at least a dozen same/similar (better?) solutions" ([HN](https://news.ycombinator.com/item?id=46544524)). Standalone meters are commoditized; the durable position is a meter *attached to an orchestrator that acts on it*.

---

## 4. Implications for Superset

### The unique angle (lead with it)
**No menu-bar app can act on the number.** Every tool above ends at "look at the meter." Superset closes the loop: the same surface that shows per-account quota % *starts agents* — so the model dropdown can rank accounts by headroom and the orchestrator can route work to the account with the most runway. Theo explicitly punted on multi-account ("makes no sense with how harnesses work"); for an agent orchestrator it makes *perfect* sense, and it's our moat.

### Value props to emphasize, in order
1. **Pick the account with the most headroom** — multi-account is the #4 loved theme and the top unanswered ask in Theo's replies. "Start this agent on the login that won't run out."
2. **Official numbers, not estimates** — we show the provider's own quota % (what the CLI itself enforces), sidestepping the category's #1 complaint. Copy: "the same limit Claude Code sees — not a log-file guess."
3. **Plan around resets** — reset countdowns answer "do I start the big refactor now or after reset?" (CodexBar's own "stop guessing whether to start that long task"). For us: "queue the long job for after reset" is a natural automation follow-up.
4. **Zero extra apps, zero login, zero RAM tax** — reads the CLI logins already on disk; no new process (vs "7GB of RAM"), no keychain prompt anxiety, no menu-bar clutter.
5. **Fleet-level anxiety relief** — running 10 agents in parallel burns quota 10x faster; the person most in need of a quota meter is precisely a Superset user. "Know your burn rate before your agents do."

### Marketing language grounded in user quotes
- "Stop slamming into limits mid-session." (mirrors the 245-pt HN founding story)
- "Know whether to start the long task." (CodexBar's proven line)
- "Your real quota — the number Claude Code enforces — not a token-log estimate." (answers "is this actually correct?")
- "Work and personal subs, side by side. Start the agent on whichever has headroom." (mirrors "I have work and personal separate codex subs")
- "No new app. No login. Nothing leaves your machine." (category trust language: no-login + local-only)
- Avoid: leaderboard/bragging framings ("guzzling tokens") — the community actively fears flexing invites tighter limits. Frame as *planning*, not extraction.

### Feature roadmap candidates (borrowed from the field, ranked by fit)
1. **Model-dropdown quota meter + headroom-ranked account picker** (unique; ship next).
2. **Pace projection** ("at this burn rate you'll hit the weekly cap Thursday") — claudebar/runway pacing math; pairs naturally with parallel-agent burn.
3. **Near-limit notifications** with runway's semantics (Almost Out / Will Run Out; projected, deduped, default sensible) — surfaced through Superset's existing notification system.
4. **Scope + profile clarity** — enumerate all `CLAUDE_CONFIG_DIR`/`~/.codex` logins; label exactly what's counted (Theo's repliers demanded this within hours).
5. **Agent-readable quota** — expose quota via superset CLI/MCP so agents can self-pace or defer big jobs until reset (CodexBar's `serve` proved the demand; ~10 community ports built on it).
6. **Screen-share masking** for the Usage tab / any pinned meter (runway; cheap and demo-day-delightful).
7. **Reset-moment affordances** — "resumes at 3:00 PM" countdown → optional auto-start of queued work at reset (nobody has this; it's orchestrator-shaped).
8. Later/nice: usage history sparklines, weekly-reset confetti, provider incident badges ("Anthropic is down" ≠ "you're throttled").

### Positioning sentence (draft)
> Superset shows each account's real quota — the same % Claude Code and Codex enforce — with reset countdowns, right where you launch agents. Start every agent on the account with the most headroom.
