# Weekly Docs Update

Review recently merged PRs and update documentation to reflect any new features, changed behavior, or removed functionality.

## Instructions

1. **Find PRs merged in the last 7 days**
   - Use `gh pr list --state merged --search "merged:>=$(date -d '7 days ago' +%Y-%m-%d)" --json number,title,body,url,mergedAt,files --limit 50` to get all recently merged PRs
   - For each PR, read the title, body, and changed files to understand what changed

2. **Read the current docs**
   - Read `apps/docs/content/docs/meta.json` to understand the doc structure
   - Read each existing doc page in `apps/docs/content/docs/` to understand current content

3. **Identify docs that need updating**

   For each merged PR, determine if it affects documentation by checking:

   | Change Type | Docs Action |
   |-------------|-------------|
   | New user-facing feature | Add section to relevant doc page, or create new page if it's a major feature area |
   | Changed behavior/UI | Update the relevant doc page to reflect new behavior |
   | New keyboard shortcut | Update `keyboard-shortcuts.mdx` |
   | New terminal feature | Update `terminal-integration.mdx` or `terminal-presets.mdx` |
   | New MCP capability | Update `mcp-server.mdx` |
   | New agent feature | Update `agent-integration.mdx` |
   | Agent status, activity strip, dock badge, or notification changes | Update `agent-status.mdx` |
   | Tasks/PRs view changes | Update `tasks.mdx` |
   | File explorer, built-in editor, or search changes | Update `editor.mdx` |
   | New workspace feature | Update `workspaces.mdx` |
   | Changed port behavior | Update `ports.mdx` |
   | New setup/teardown script feature | Update `setup-teardown-scripts.mdx` |
   | Diff viewer or PR review changes | Update `diff-viewer.mdx` |
   | New or changed CLI command/flag | Update `cli/cli-reference.mdx`. Verify flags and output shapes against the command source in `packages/cli/src/commands/` - never document a contract from memory |
   | SDK changes | Update `sdk/reference.mdx` or `sdk/advanced.mdx` |
   | Remote workspaces / relay / hosts changes | Update `remote-workspaces.mdx` |
   | Automations changes | Update `automations.mdx` |
   | Slack bot changes | Update `use-with-slack.mdx` |
   | Orchestration skill changes | Update `orchestration.mdx` |
   | Onboarding or install requirement changes | Update `install.mdx` |
   | IDE integration changes | Update `use-with-ide.mdx` |
   | Linear integration changes | Update `use-with-linear.mdx` |
   | Monorepo changes | Update `using-monorepos.mdx` |
   | Customization changes | Update `customization.mdx` |
   | Fix for an issue users hit (from a bug-report PR) | Consider a `troubleshooting.mdx` entry (symptom → fix) if users may still hit older versions or need a workaround |
   | Removed feature | Remove or update the relevant section |
   | Internal-only change (CI, refactor, dev tooling) | **Skip** - no docs update needed |

   Workflow-shaped changes (a new way of working, not a single feature) may also warrant an update to a recipe in `recipes/`, or rarely a new recipe. Recipes follow a fixed shape: `<Callout type="info" title="Use when">` at the top, then The Idea, Steps with a copyable prompt, and Variations.

4. **Skip if nothing needs updating**
   - If no merged PRs require documentation changes, make no edits and report that docs are up to date
   - Do NOT make changes for the sake of making changes - only update docs when PRs genuinely introduced user-facing changes that aren't already documented

5. **Make targeted edits**
   - Edit existing doc files rather than rewriting them
   - Match the writing style and formatting of the existing content
   - Keep changes minimal and focused - only add/update what the PRs changed
   - Preserve all existing content that is still accurate

6. **Creating new doc pages** (rare - only for major new feature areas)
   - Create at `apps/docs/content/docs/slug-name.mdx`
   - Use this frontmatter format:
     ```mdx
     ---
     title: Page Title
     description: Brief description of what this page covers
     ---
     ```
   - Add the new page slug to `apps/docs/content/docs/meta.json` in the appropriate section. Sections are separator entries with plain names (`---Core Features---`, `---Integrations---`, `---Configuration---`, etc.); pick by content type: feature reference → Core Features, external service how-to → Integrations, config/tuning → Configuration, workflow pattern → Recipes
   - Feature pages should get one product screenshot when a good one exists. Beautified shots live in `apps/marketing/public/changelog/`; copy the file into `apps/docs/public/images/` with a short descriptive name rather than referencing across apps
   - `Card`/`Cards`, `Callout`, and a set of lucide icons are registered in `apps/docs/src/mdx-components.tsx` for use in MDX

7. **Writing style - two voices, by section**
   - **Funnel pages** (overview, install, first-workspace, superset-model, recipes/): coaching voice is intentional - second person, workflow prescriptions, copyable prompts. Match it; don't neutralize it
   - **Everything else** (Core Features, CLI, SDK, Integrations, Configuration): neutral reference voice - concise, practical, no marketing language
   - **Lead with what the user can do** - Not implementation details
   - **Use bullet points** for feature lists, **##** headings, short sentences, no fluff
   - **FAQ vs Troubleshooting boundary**: `faq.mdx` is for what/why one-liners; `troubleshooting.mdx` is for symptom → fix walkthroughs. Don't grow the FAQ with fix procedures

8. **Validate before finishing**
   - Run `bun run --cwd apps/docs typecheck` (compiles all MDX) and `bun run lint`; both must exit clean

## Existing doc pages for reference

Read these to match the format and style:
- `apps/docs/content/docs/agent-status.mdx` - Feature doc example (neutral voice, screenshot, cross-links)
- `apps/docs/content/docs/recipes/race-agents.mdx` - Recipe format (Use-when callout, steps, copyable prompt)
- `apps/docs/content/docs/cli/cli-reference.mdx` - Reference doc example (`<Command>` blocks with exact contracts)
- `apps/docs/content/docs/keyboard-shortcuts.mdx` - Simple reference table example

## Output

Edit the relevant doc files. If no updates are needed, make no changes and report that documentation is already up to date.
