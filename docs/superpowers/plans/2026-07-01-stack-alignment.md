# Stack Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring all 7 TairuFramework stack repos to one canonical set of repo-level patterns — shared `docs/` layout, thin root files, centrally-sourced conventions + development guidance, wired shared skills, and a production `docs/stack.md` overview.

**Architecture:** kigu is the source of truth. Phase A defines the canon in kigu (new `development` skill, conventions layout section, aligned workflow skills, `docs/stack.md`, marketplace wiring). Phase B applies it mechanically to each sibling repo — one branch + commit per repo. This is a docs/config project: no unit tests; each task verifies with JSON validity, biome, grep for stale refs, and diff review, then commits.

**Tech Stack:** Markdown skills (SKILL.md + frontmatter), Claude Code plugin marketplace, `.claude/settings.json`, Biome, pnpm.

## Global Constraints

- **pnpm only** — never `npm`/`npx`; `pnpm exec`/`pnpm dlx` for tools.
- **Biome** for any lint/format check: `pnpm exec biome check <paths>`.
- **Commit trailer** on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Commits/docs in normal prose** (caveman mode is chat-only).
- **Dash style:** match the target file's existing style — kigu skill files and sibling `docs/agents/*.md` use `--`; `docs/stack.md` (from `repo-split-design.md`) uses `—`.
- **Each sibling repo is a separate git repo.** Operate with `git -C /Users/paul/dev/yulsi/<repo>`; branch from `main` as `stack-alignment`; never `cd`.
- **Do not scaffold empty folders** — no `.gitkeep`, no empty `plans/*` dirs. Create files only where content exists.
- **Marketplace enablement JSON is identical in every repo** (defined in Task 5, reused verbatim in Phase B).
- **Out of scope:** domain-skill plugins (`discover-template`), `docs/skills/*.skill.md` migration, CI enforcement, copying sibling docs into kigu.

## Canonical templates (referenced by multiple tasks)

**`.claude/settings.json`** (identical every repo):

```json
{
  "extraKnownMarketplaces": {
    "kigu": {
      "source": {
        "source": "github",
        "repo": "TairuFramework/kigu"
      },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "kigu@kigu": true
  }
}
```

**`CLAUDE.md`** (single line, exact):

```
@AGENTS.md
```

**Slim `docs/agents/development.md`** (pointer; `<REPO>` and repo-specific block filled per task):

```markdown
# Development

Shared build, test, and release workflow lives in the kigu `development` skill,
auto-loaded via the kigu plugin. See it for the pnpm / Turbo / SWC / Biome / Vitest
workflow and the `docs/agents/plans/` lifecycle.

## Repo-specific

<repo-specific notes, or: None yet.>
```

**`docs/index.md`** (repo doc entry; `<REPO>` and role filled per task):

```markdown
# <REPO> docs

<one-line repo role>.

- **Stack overview:** https://github.com/TairuFramework/kigu/blob/main/docs/stack.md
- **Conventions & development:** the kigu `conventions` and `development` skills (auto-loaded via the kigu plugin)
- **Architecture:** [agents/architecture.md](./agents/architecture.md)
- **Planning:** [agents/plans/](./agents/plans/)
```

---

## Phase A — kigu canon (working dir `/Users/paul/dev/yulsi/kigu`, branch `stack-docs`)

### Task 1: Create the `development` skill

**Files:**
- Create: `plugins/kigu/skills/development/SKILL.md`

**Interfaces:**
- Produces: skill `development` (name used by Task 2 layout section, Task 3 project-loop artifacts, and every slim `docs/agents/development.md` in Phase B).

- [ ] **Step 1: Write the skill file**

Write `plugins/kigu/skills/development/SKILL.md` with exactly this content (synthesized from the enkaku/tejika/mokei `development.md` files, stale "agents repo / manually propagated" and `docs/plans/` migration lines removed; Agent Conduct is conventions territory, not included here):

````markdown
---
name: development
description: Use when building, testing, or releasing in any stack repo - the shared pnpm/turbo/changesets/biome/vitest workflow and the docs/agents/plans lifecycle.
---

# Development

Shared build, test, and release workflow for every repo in the TairuFramework stack.
Repo-specific additions live in that repo's `docs/agents/development.md`.

## Build system

All repos use pnpm workspaces with Turbo for build orchestration.

### Package management
- Always use `pnpm`, never `npm`; `pnpm exec`/`pnpm dlx`, never `npx`/`pnpx`.
- Use `workspace:^` for internal package dependencies.
- Add shared dependency versions to the pnpm catalog (`pnpm-workspace.yaml`) when possible.
- Each package builds independently. Avoid circular dependencies.

### Compilation
- SWC compiles JavaScript, not tsc. TypeScript is type checking + declaration generation only (strict, ES2025).
- Generated files land in `lib/` and are never edited.

### Standard scripts
Every package has these where applicable:

| Script | Purpose |
|--------|---------|
| `build` | Full build (types + JS) |
| `build:clean` | Remove build artifacts |
| `build:js` | JavaScript compilation via SWC |
| `build:types` | TypeScript declaration generation |
| `test:types` | Type checking via tsc |
| `test:unit` | Unit tests via Vitest |

Root commands: `pnpm run build`, `pnpm run build:types`, `pnpm run build:js`, `pnpm run lint`.

## Testing

Vitest is the test runner.

- `pnpm test` runs type checks + unit tests; `pnpm run test:types` and `pnpm run test:unit` split them.
- Use `test` (not `it`). Import `{ describe, expect, test } from 'vitest'`.
- Test files use `.test.ts`, placed in `test/` or `__tests__/` per repo convention.
- Use async/await for async tests; cover both success and failure.

## Toolchain

Shared across all stack repos, pinned via `@kigu/dev`:

| Tool | Purpose |
|------|---------|
| Biome | Linting and formatting |
| Vitest | Testing |
| pnpm | Package management (catalog for shared deps) |
| Turbo | Build orchestration |
| SWC | JavaScript compilation |
| TypeScript | Type checking + declarations (strict, ES2025) |

## Planning and documentation

Persistent plan artifacts live in `docs/agents/plans/`; ephemeral working docs in `docs/superpowers/`.

### Ephemeral (branch lifetime)
```
docs/superpowers/
  specs/    # brainstorming design specs
  plans/    # implementation plans
```
Deleted before the branch merges to main -- the `/complete` skill handles cleanup.

### Persistent (on main)
```
docs/agents/plans/
  next/       # immediate priorities
  backlog/    # future work, no committed timeline
  completed/  # finished summaries, still referenced by active work
  archive/    # monthly summaries of unreferenced completed plans
  milestones/ # optional -- design docs for current focus areas
  roadmap.md            # repo-local roadmap
  project-loop-state.md # project-loop activity timestamps
```
Folders are created on demand -- a repo with no finished work simply has no `completed/` yet.

### Workflow
1. Brainstorm -- design spec to `docs/superpowers/specs/`.
2. Plan -- implementation plan to `docs/superpowers/plans/`.
3. Execute on a feature branch.
4. Review.
5. QA.
6. Complete -- summary to `docs/agents/plans/completed/`, ephemeral files cleaned (`/complete`).
7. Finish -- merge or PR.
8. Archive -- consolidate completed plans into monthly summaries (`/archive`).

### Plan statuses
Filename suffix and a `**Status:**` line near the top: `complete`, `partial`, `superseded`, `cancelled`.
Completed/next/backlog files use `YYYY-MM-DD-slug.<status>.md`; archive files use `YYYY-MM-archive-summary.md`.

### Lifecycle skills
Shared via the kigu plugin (enabled through the kigu marketplace in each repo's `.claude/settings.json`):

| Skill | Purpose |
|-------|---------|
| `/dev-loop` | Drive the full development cycle with session resumption |
| `/project-loop` | Manage priorities, roadmap, architecture review, and triage |
| `/complete` | Summarise a finished plan, move it to `completed/`, clean ephemeral files |
| `/archive` | Consolidate completed plans into monthly summaries |
````

- [ ] **Step 2: Verify frontmatter + no stale refs**

Run: `grep -n "agents repo\|manually propagated\|docs/plans/" plugins/kigu/skills/development/SKILL.md`
Expected: no output (empty).

Run: `head -4 plugins/kigu/skills/development/SKILL.md`
Expected: shows `name: development` and a `description:` line.

- [ ] **Step 3: Biome check**

Run: `pnpm exec biome check ./plugins`
Expected: passes (info-only allowed; no errors).

- [ ] **Step 4: Commit**

```bash
git add plugins/kigu/skills/development/SKILL.md
git commit -m "Add shared development skill

Canonical build/test/release workflow and plans lifecycle for every stack
repo, synthesized from the per-repo development.md files. Repos now point at
this instead of copying it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Add "Canonical repo layout" section to the conventions skill

**Files:**
- Modify: `plugins/kigu/skills/conventions/SKILL.md` (append after the existing final section §10)

**Interfaces:**
- Consumes: skill `development` (Task 1) — referenced in the layout text.
- Produces: readable layout convention (referenced by `docs/index.md` links and the rollout).

- [ ] **Step 1: Read the current end of the file**

Run: `tail -30 plugins/kigu/skills/conventions/SKILL.md`
Confirm the last section is `## 10.` (AGENTS.md shape) so the new section appends as `## 11.`.

- [ ] **Step 2: Append the layout section**

Append this section to `plugins/kigu/skills/conventions/SKILL.md` (use `--`, matching the file's dash style):

````markdown

## 11. Canonical repo layout

Every stack repo matches one shape. Shared guidance is sourced from kigu skills, not copied.

### Root files
- `AGENTS.md` -- thin pointer (see §10). Source of truth for repo context.
- `CLAUDE.md` -- single line `@AGENTS.md`.
- `README.md` -- human-facing.
- `.changeset/` -- present where the repo publishes packages.

### docs/ tree
```
docs/
  index.md              # repo doc entry; links the stack overview (TairuFramework/kigu/docs/stack.md)
  agents/
    architecture.md     # repo-specific
    development.md       # thin: pointer to the `development` skill + repo-specific deltas only
    plans/              # permanent planning -- project-loop/dev-loop/complete/archive operate here
      next/ backlog/ completed/ archive/   # created on demand (no placeholder dirs)
      milestones/                          # optional
      roadmap.md  project-loop-state.md    # created on first project-loop write
  reference/            # domain docs
  guides/               # optional, user-facing
  superpowers/          # EPHEMERAL -- specs/ + plans/, branch-only, deleted before merge
```

### Rules
- Conventions are NOT duplicated per repo -- this skill is canonical. No `docs/agents/conventions.md`.
- Shared build/test/release workflow lives in the `development` skill. Each repo's
  `docs/agents/development.md` is a thin pointer plus repo-specific notes only.
- Domain reference docs live under `docs/reference/` (one name -- not `domains/` or `capabilities/`).
- Plan folders are created on demand; never scaffold empty ones.
- The shared skills load because each repo's committed `.claude/settings.json` enables the
  kigu marketplace and the `kigu` plugin.
````

- [ ] **Step 3: Verify**

Run: `grep -n "## 11. Canonical repo layout" plugins/kigu/skills/conventions/SKILL.md`
Expected: one match.

Run: `pnpm exec biome check ./plugins`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add plugins/kigu/skills/conventions/SKILL.md
git commit -m "Document canonical repo layout in conventions skill

Adds section 11 defining the shared docs/ tree and root files every stack repo
matches, and the sourcing rules (conventions and development guidance come from
kigu skills, not per-repo copies).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Align the 4 workflow skills to reality

**Files:**
- Modify: `plugins/kigu/skills/project-loop/SKILL.md`
- Modify: `plugins/kigu/skills/dev-loop/SKILL.md`
- Modify: `plugins/kigu/skills/complete/SKILL.md` (verify only, likely no change)
- Modify: `plugins/kigu/skills/archive/SKILL.md` (verify only, likely no change)

**Interfaces:**
- Consumes: skills `conventions`, `development` (Tasks 1-2).

- [ ] **Step 1: Fix project-loop "Path Context"**

In `plugins/kigu/skills/project-loop/SKILL.md`, replace the "## Path Context" paragraph (which names `sakui, enkaku, kubun, mokei` and "The agents repo…") with:

```markdown
## Path Context

All paths assume this skill runs inside a stack repo (sozai, kokuin, enkaku, tejika,
kumiai, mokei). The kigu hub repo carries no plans hierarchy of its own -- project-loop
is shared from the kigu plugin but operates in the consuming repo's `docs/agents/plans/`.
```

- [ ] **Step 2: Point project-loop Review at the skills, not dead files**

In `plugins/kigu/skills/project-loop/SKILL.md`, in the **Review** mode "Conventions" sub-check, replace the line referencing `docs/agents/conventions.md` with:

```markdown
- Spot-check a sample of code files against the `conventions` skill rules
```

In the same Review mode, in the "Architecture" sub-check, leave `docs/agents/architecture.md` and `AGENTS.md` as-is (still valid).

- [ ] **Step 3: Fix project-loop Artifacts table**

In the "### Read-only" Artifacts table, remove the `docs/agents/conventions.md` and
`docs/agents/development.md` rows and replace them with:

```markdown
| the `conventions` skill | Canonical code conventions (kigu plugin) |
| the `development` skill | Canonical build/test/release workflow (kigu plugin) |
```

Also mark optionality: in the read-only table, change the `milestones/` row purpose to
`Optional -- detailed design docs for current focus areas`.

- [ ] **Step 4: Note on-demand folders in project-loop**

In the "### 1. Session Start" scan step (item 3, the `Scan docs/agents/plans/...` line), append a sentence:

```markdown
Folders and the roadmap/state files may not exist yet -- they are created on demand; treat missing ones as empty, not errors.
```

- [ ] **Step 5: Scrub dev-loop**

Run: `grep -n "conventions.md\|sakui\|kubun\|agents repo" plugins/kigu/skills/dev-loop/SKILL.md`
If any match, fix it (dev-loop should reference `docs/agents/plans/next/` and the stage skills only — replace any `conventions.md` mention with "the `conventions` skill"). If no match, no change.

- [ ] **Step 6: Verify complete + archive have no stale refs**

Run: `grep -n "sakui\|kubun\|agents repo\|manually propagated" plugins/kigu/skills/complete/SKILL.md plugins/kigu/skills/archive/SKILL.md`
Expected: no output. (These skills already use correct `docs/agents/plans/` paths; leave them unchanged.)

- [ ] **Step 7: Whole-plugin stale-ref sweep**

Run: `grep -rn "sakui\|kubun\|the agents repo\|manually propagated to" plugins/kigu/skills/`
Expected: no output.

- [ ] **Step 8: Biome + commit**

Run: `pnpm exec biome check ./plugins` → passes.

```bash
git add plugins/kigu/skills/project-loop/SKILL.md plugins/kigu/skills/dev-loop/SKILL.md
git commit -m "Align workflow skills to the current stack

project-loop no longer names retired repos or reads the removed
docs/agents/conventions.md and development.md -- it points at the conventions
and development skills, marks milestones/next optional, and treats plan folders
as created on demand. dev-loop scrubbed of stale references.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Rewrite repo-split-design.md → docs/stack.md and add kigu docs/index.md

**Files:**
- Rename+rewrite: `docs/repo-split-design.md` → `docs/stack.md`
- Create: `docs/index.md`
- Modify: `AGENTS.md` (pointer at bottom)
- Modify: `README.md` (pointer line)

**Interfaces:**
- Produces: `docs/stack.md` (linked by every repo's `docs/index.md` in Phase B).

- [ ] **Step 1: Create docs/stack.md**

Create `docs/stack.md` with this content (production overview; migration/codemod/blast-radius detail dropped to a short History footer; uses `—` em-dash matching the source doc):

````markdown
# The TairuFramework stack

Status: production (2026). Seven sibling repositories under the `TairuFramework` GitHub org,
split out of the original enkaku monorepo — code ported, packages published, cross-repo deps
on published `^` ranges. This is the entry-point overview; each repo owns its own docs.

## Repos

Dependencies point strictly downward (no cycles). kigu is the tooling hub consumed by all.

```
kigu (器具) ── tooling hub: @kigu/dev configs + Claude Code plugin marketplace + conventions
   │
   ▼
sozai (素材)  ←  kokuin (刻印)  ←  enkaku (遠隔)  ←  kumiai (組合)
 core            identity          RPC              MLS / group
                                     ▲
                                  tejika (手近) — local-side foundation
                                  mokei (模型) — MCP toolkit
```

| repo | kanji | scope | role | depends on |
|------|-------|-------|------|-----------|
| kigu | 器具 | `@kigu` | tooling hub: configs + plugin marketplace + conventions | — |
| sozai | 素材 | `@sozai` | core utilities + external-library wrappers | — |
| kokuin | 刻印 | `@kokuin` | identity / auth / keys | sozai |
| enkaku | 遠隔 | `@enkaku` | RPC framework | sozai, kokuin |
| tejika | 手近 | `@tejika` | local-side foundation (CLI / process / server) | enkaku |
| kumiai | 組合 | `@kumiai` | MLS group messaging | sozai, kokuin, enkaku |
| mokei | 模型 | `@mokei` | MCP toolkit: clients / servers / providers + host monitoring | sozai, enkaku, tejika |

GitHub: `https://github.com/TairuFramework/<repo>`. The machine-readable index (scopes, URLs,
docs paths, dependency edges) is `stack.json` in the `stack-map` skill.

## How the stack holds together

- **Shared toolchain** — every repo adds `@kigu/dev` as a devDependency and extends
  `@kigu/dev/tsconfig.json`, `@kigu/dev/biome.json`, `@kigu/dev/swc.json`. Config churn is
  devDep-only and never forces a consumer republish.
- **Shared AI assets** — every repo enables the kigu marketplace and `kigu` plugin (via a
  committed `.claude/settings.json`), so the conventions, development, workflow, and stack-map
  skills load everywhere. See the `conventions` and `development` skills for the canon.
- **Shared CI** — repos call `TairuFramework/kigu/.github/workflows/<name>@main` and the
  `TairuFramework/kigu/setup@main` action.
- **Independent versioning** — cross-repo deps are published `^` ranges, not `workspace:`.
  Each repo promotes to 1.0 as a unit on its own cadence (foundations first: sozai, kokuin →
  enkaku at RPC-API freeze → kumiai last).

## Finding your way around

- **A sibling's docs** — every repo has `docs/index.md`, `docs/agents/architecture.md`, and
  `docs/reference/`. Route via the `stack-map` skill.
- **Conventions / build workflow** — the `conventions` and `development` skills (kigu plugin).
- **Repo layout** — conventions skill §11.

## History

The stack began as the single `enkaku` monorepo (JWT RPC that accreted utilities, keystores,
and an MLS stack). It was split in mid-2026 to stop lockstep version churn and give each layer
its own altitude and release cadence. The rename map, codemod, and migration sequencing that
drove the split are preserved in the repos' `docs/agents/plans/archive/` and completed-plan
histories; they are no longer needed to work in the stack.
````

- [ ] **Step 2: Remove the old file**

Run: `git rm docs/repo-split-design.md`
(The rewrite lives in `docs/stack.md`; the old path must not linger.)

- [ ] **Step 3: Create kigu docs/index.md**

Create `docs/index.md`:

```markdown
# kigu docs

器具 -- the stack's tooling hub: the `@kigu/dev` config preset and the Claude Code plugin marketplace.

- **Stack overview:** [stack.md](./stack.md)
- **Conventions & development:** the `conventions` and `development` skills in `plugins/kigu/skills/`
- **Cross-repo routing:** the `stack-map` skill (`plugins/kigu/skills/stack-map/`)
- **Planning:** [agents/plans/](./agents/plans/)
```

- [ ] **Step 4: Update AGENTS.md pointer**

In `AGENTS.md`, replace the final line
`See \`docs/repo-split-design.md\` for the broader monorepo-split architecture.`
with:
`See \`docs/stack.md\` for the stack overview (roles, dependency graph, how the repos hold together).`

- [ ] **Step 5: Update README.md pointer**

In `README.md`, replace the line
`See \`docs/repo-split-design.md\` for the architecture this supports.`
with:
`See \`docs/stack.md\` for the stack overview this tooling supports.`

- [ ] **Step 6: Verify no dangling references**

Run: `grep -rn "repo-split-design" . --include=*.md`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add docs/stack.md docs/index.md AGENTS.md README.md
git rm --cached docs/repo-split-design.md 2>/dev/null; true
git commit -m "Rewrite repo-split-design as production stack overview

docs/stack.md replaces docs/repo-split-design.md: reframed from an in-progress
monorepo split to a production overview of the seven-repo stack -- roles,
dependency graph, and how the repos share toolchain, AI assets, and CI.
Migration detail reduced to a History footer. Adds kigu docs/index.md and
updates the AGENTS.md/README pointers.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wire kigu's own marketplace enablement + slim development.md

**Files:**
- Create: `.claude/settings.json`
- Create: `docs/agents/development.md`

**Interfaces:**
- Produces: the canonical `.claude/settings.json` reused verbatim in every Phase B task.

- [ ] **Step 1: Check for an existing settings file**

Run: `cat .claude/settings.json 2>/dev/null; echo "---"`
If it exists with other keys, MERGE the two keys below in rather than overwriting. If absent, create it.

- [ ] **Step 2: Write .claude/settings.json**

Write `.claude/settings.json` with the canonical marketplace JSON (see Canonical templates above): `extraKnownMarketplaces.kigu` → github `TairuFramework/kigu`, and `enabledPlugins."kigu@kigu": true`.

- [ ] **Step 3: Write kigu slim development.md**

Create `docs/agents/development.md` from the slim template:

```markdown
# Development

Shared build, test, and release workflow lives in the kigu `development` skill,
auto-loaded via the kigu plugin. See it for the pnpm / Turbo / SWC / Biome / Vitest
workflow and the `docs/agents/plans/` lifecycle.

## Repo-specific

kigu publishes `@kigu/dev` (the config preset) and hosts the plugin marketplace. No runtime
code. Do not edit generated files; the marketplace source of truth is `.claude-plugin/marketplace.json`.
```

- [ ] **Step 4: Verify JSON validity**

Run: `pnpm exec biome check .claude/settings.json`
Expected: passes (valid JSON).

Run: `grep -n "kigu@kigu" .claude/settings.json`
Expected: one match.

- [ ] **Step 5: Commit**

```bash
git add .claude/settings.json docs/agents/development.md
git commit -m "Enable the kigu marketplace in kigu and add slim development.md

Commits the .claude/settings.json that registers the kigu marketplace and
enables the kigu plugin, and a thin docs/agents/development.md pointing at the
development skill. This settings file is the template every sibling repo adopts.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase B — sibling rollout

Each task operates in one sibling repo via `git -C /Users/paul/dev/yulsi/<repo>`. Common per-repo
preamble (each task starts here): confirm a clean tree, branch from `main`.

```bash
git -C /Users/paul/dev/yulsi/<repo> status --short   # expect clean
git -C /Users/paul/dev/yulsi/<repo> checkout main
git -C /Users/paul/dev/yulsi/<repo> pull --ff-only 2>/dev/null; true
git -C /Users/paul/dev/yulsi/<repo> checkout -b stack-alignment
```

If the tree is not clean, STOP and report — do not stash or discard.

Every Phase B task ends by validating the settings JSON and committing on the `stack-alignment` branch. Sibling repos are NOT merged by this plan; finishing each PR is a separate step per repo.

### Task 6: Align sozai

**State:** no `docs/agents/` at all; has `docs/domains/`, `docs/skills/`, `docs/README.md`; root `README.md` present; no `CLAUDE.md`.

**Files (in `/Users/paul/dev/yulsi/sozai`):**
- Create: `CLAUDE.md`, `.claude/settings.json`, `docs/index.md`, `docs/agents/architecture.md`, `docs/agents/development.md`
- Rename: `docs/domains/` → `docs/reference/`

- [ ] **Step 1:** Run the Phase B preamble for `sozai`.
- [ ] **Step 2:** Write `CLAUDE.md` = `@AGENTS.md` (single line).
- [ ] **Step 3:** Write `.claude/settings.json` = canonical marketplace JSON.
- [ ] **Step 4:** Rename domain docs: `git -C /Users/paul/dev/yulsi/sozai mv docs/domains docs/reference`. Then grep for inbound links: `grep -rn "docs/domains" /Users/paul/dev/yulsi/sozai --include=*.md` and update any hit to `docs/reference`.
- [ ] **Step 5:** Write `docs/agents/development.md` from the slim template; Repo-specific block: `Core utility layer (async, codec, schema, stream, runtime, ...). runtime-expo versions independently against the Expo SDK.`
- [ ] **Step 6:** Write `docs/agents/architecture.md` with real minimal content:

```markdown
# Architecture

sozai (素材, "raw material") is the core utility layer of the stack: stable, low-altitude
packages with no upward dependencies.

## Packages

async, codec, event, execution, flow, generator, log, otel, patch, result, runtime, schema,
stream -- the stable fixed group. `runtime-expo` versions independently (bound to the Expo SDK).

## Position in the stack

Bottom of the dependency graph -- everything else depends downward on sozai; sozai depends on
nothing in the stack. See the stack overview: https://github.com/TairuFramework/kigu/blob/main/docs/stack.md
```

- [ ] **Step 7:** Write `docs/index.md` from the template; role line: `素材 -- the stack's core utility layer.`
- [ ] **Step 8:** Validate: `pnpm exec biome check /Users/paul/dev/yulsi/sozai/.claude/settings.json` passes; `git -C /Users/paul/dev/yulsi/sozai status --short` shows the expected adds/renames.
- [ ] **Step 9:** Commit:

```bash
git -C /Users/paul/dev/yulsi/sozai add -A
git -C /Users/paul/dev/yulsi/sozai commit -m "Align repo layout with the stack canon

Adds docs/agents/{architecture,development}.md, docs/index.md, CLAUDE.md, and the
committed .claude/settings.json enabling the kigu marketplace. Renames docs/domains
to docs/reference. development.md is a thin pointer to the shared development skill.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 7: Align kokuin

**State:** `docs/agents/plans/` (backlog only), `docs/capabilities/`, `docs/skills/`; root `README.md` present; no `CLAUDE.md`; no architecture/development/conventions.

**Files (in `/Users/paul/dev/yulsi/kokuin`):**
- Create: `CLAUDE.md`, `.claude/settings.json`, `docs/index.md`, `docs/agents/architecture.md`, `docs/agents/development.md`
- Rename: `docs/capabilities/` → `docs/reference/`

- [ ] **Step 1:** Phase B preamble for `kokuin`.
- [ ] **Step 2:** Write `CLAUDE.md` = `@AGENTS.md`.
- [ ] **Step 3:** Write `.claude/settings.json` = canonical JSON.
- [ ] **Step 4:** `git -C /Users/paul/dev/yulsi/kokuin mv docs/capabilities docs/reference`; grep `docs/capabilities` in `--include=*.md` and update hits to `docs/reference`.
- [ ] **Step 5:** Write `docs/agents/development.md` (slim); Repo-specific: `Identity layer: token, capability, and per-environment keystores. KeyEntry/KeyStore contracts live in @kokuin/token.`
- [ ] **Step 6:** Write `docs/agents/architecture.md`:

```markdown
# Architecture

kokuin (刻印, "engraved seal") is the identity / auth / keys layer.

## Packages

token, capability, and per-environment keystores (browser, node, deterministic, expo,
electron, ledger-device). The `KeyEntry` / `KeyStore` contracts live in `@kokuin/token`.
The BOLOS on-device firmware pairing with `ledger-device` lives under `apps/ledger`.

## Position in the stack

Depends downward on sozai; consumed by enkaku and kumiai. See the stack overview:
https://github.com/TairuFramework/kigu/blob/main/docs/stack.md
```

- [ ] **Step 7:** Write `docs/index.md`; role line: `刻印 -- the stack's identity / auth / keys layer.`
- [ ] **Step 8:** Validate JSON + status.
- [ ] **Step 9:** Commit (same message body as Task 6, adjusting the renamed dir to `docs/capabilities`→`docs/reference`).

### Task 8: Align enkaku

**State:** full plans tree; `docs/agents/{architecture,development,conventions}.md`; `docs/capabilities/`, `docs/skills/`; thin `CLAUDE.md`; root `README.md`.

**Files (in `/Users/paul/dev/yulsi/enkaku`):**
- Create: `.claude/settings.json`, `docs/index.md`
- Replace: `docs/agents/development.md` (→ slim)
- Delete: `docs/agents/conventions.md`
- Rename: `docs/capabilities/` → `docs/reference/`

- [ ] **Step 1:** Phase B preamble for `enkaku`.
- [ ] **Step 2:** Write `.claude/settings.json` = canonical JSON.
- [ ] **Step 3:** Delete the duplicate: `git -C /Users/paul/dev/yulsi/enkaku rm docs/agents/conventions.md`.
- [ ] **Step 4:** Grep for references to the deleted file: `grep -rn "agents/conventions.md" /Users/paul/dev/yulsi/enkaku --include=*.md`. Update any hit to point at "the `conventions` skill".
- [ ] **Step 5:** Replace `docs/agents/development.md` with the slim template; Repo-specific: `RPC framework (protocol, transport, client, server, standalone + transports and React/Electron bindings). Integration tests in tests/integration/; run a package's tests with pnpm run test:unit --filter=@enkaku/<pkg>.`
- [ ] **Step 6:** `git -C /Users/paul/dev/yulsi/enkaku mv docs/capabilities docs/reference`; update any `docs/capabilities` md links to `docs/reference`.
- [ ] **Step 7:** Write `docs/index.md`; role line: `遠隔 -- the stack's RPC framework.` (architecture.md already exists; the index links it.)
- [ ] **Step 8:** Validate JSON + status. Confirm `conventions.md` is gone: `test ! -f /Users/paul/dev/yulsi/enkaku/docs/agents/conventions.md && echo OK`.
- [ ] **Step 9:** Commit:

```bash
git -C /Users/paul/dev/yulsi/enkaku add -A
git -C /Users/paul/dev/yulsi/enkaku commit -m "Align repo layout with the stack canon

Removes the duplicated docs/agents/conventions.md (now the kigu conventions
skill), slims docs/agents/development.md to a pointer, renames docs/capabilities
to docs/reference, and adds docs/index.md plus the committed .claude/settings.json
enabling the kigu marketplace.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 9: Align tejika

**State:** full plans tree; `docs/agents/{architecture,development,conventions}.md` (development has an extra §9 "Agent Conduct"); thin `CLAUDE.md`; **no root README**; no `docs/capabilities`/`domains`.

**Files (in `/Users/paul/dev/yulsi/tejika`):**
- Create: `.claude/settings.json`, `docs/index.md`, `README.md`
- Replace: `docs/agents/development.md` (→ slim; the §9 Agent Conduct content is conventions territory, covered by the conventions skill — do not carry it into the pointer)
- Delete: `docs/agents/conventions.md`

- [ ] **Step 1:** Phase B preamble for `tejika`.
- [ ] **Step 2:** Write `.claude/settings.json` = canonical JSON.
- [ ] **Step 3:** `git -C /Users/paul/dev/yulsi/tejika rm docs/agents/conventions.md`; grep+fix inbound refs as in Task 8 Step 4.
- [ ] **Step 4:** Replace `docs/agents/development.md` with the slim template; Repo-specific: `Local-side foundation (env, process, server, cli, ui). Consumes @enkaku 0.18 (client, protocol, server, socket, http-serve). Integration tests at tests/integration/.`
- [ ] **Step 5:** Write root `README.md`:

```markdown
# tejika (手近)

手近 -- the local-side foundation of the stack: shared packages for CLI tooling, local
process/daemon lifecycle, local HTTP servers, and path/port resolution. The counterpart to
enkaku (遠隔, remote); it consumes enkaku's RPC client/server and transports.

See [`AGENTS.md`](./AGENTS.md) for agent guidance and
[the stack overview](https://github.com/TairuFramework/kigu/blob/main/docs/stack.md).
```

- [ ] **Step 6:** Write `docs/index.md`; role line: `手近 -- the stack's local-side foundation (CLI / process / server).`
- [ ] **Step 7:** Validate JSON + status; confirm `conventions.md` gone.
- [ ] **Step 8:** Commit:

```bash
git -C /Users/paul/dev/yulsi/tejika add -A
git -C /Users/paul/dev/yulsi/tejika commit -m "Align repo layout with the stack canon

Adds the missing root README, docs/index.md, and the committed .claude/settings.json
enabling the kigu marketplace. Removes the duplicated docs/agents/conventions.md and
slims docs/agents/development.md to a pointer (agent-conduct guidance now lives in the
conventions skill).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 10: Align kumiai

**State:** `docs/agents/plans/` (backlog only); root `README.md` present; no `CLAUDE.md`; no architecture/development/conventions; no capabilities/domains.

**Files (in `/Users/paul/dev/yulsi/kumiai`):**
- Create: `CLAUDE.md`, `.claude/settings.json`, `docs/index.md`, `docs/agents/architecture.md`, `docs/agents/development.md`

- [ ] **Step 1:** Phase B preamble for `kumiai`.
- [ ] **Step 2:** Write `CLAUDE.md` = `@AGENTS.md`.
- [ ] **Step 3:** Write `.claude/settings.json` = canonical JSON.
- [ ] **Step 4:** Write `docs/agents/development.md` (slim); Repo-specific: `MLS group-messaging layer (mls, broadcast, hub-protocol/client/server/tunnel, rpc). Locked group while pre-1.0.`
- [ ] **Step 5:** Write `docs/agents/architecture.md`:

```markdown
# Architecture

kumiai (組合, "union / cooperative") is the MLS group-messaging layer -- the top of the stack.

## Packages

mls (E2EE identity + membership via MLS -- the crypto core), broadcast (generic fan-out),
the hub subsystem (hub-protocol, hub-client, hub-server, hub-tunnel), and rpc. Locked group
while pre-1.0 (young, tightly coupled).

## Position in the stack

Depends downward on sozai, kokuin, and enkaku; nothing depends on kumiai. See the stack
overview: https://github.com/TairuFramework/kigu/blob/main/docs/stack.md
```

- [ ] **Step 6:** Write `docs/index.md`; role line: `組合 -- the stack's MLS group-messaging layer.`
- [ ] **Step 7:** Validate JSON + status.
- [ ] **Step 8:** Commit (same body as Task 6, no rename — drop the "Renames…" sentence).

### Task 11: Align mokei

**State:** full plans tree (no `next/`); `docs/agents/{architecture,development,conventions}.md`; **`docs/index.md` already exists**; `docs/guides/`; thin `CLAUDE.md`; root `README.md`.

**Files (in `/Users/paul/dev/yulsi/mokei`):**
- Create: `.claude/settings.json`
- Replace: `docs/agents/development.md` (→ slim)
- Modify: `docs/index.md` (align to the canonical template; keep any mokei-specific links to `guides/`)
- Delete: `docs/agents/conventions.md`
- Keep: `docs/guides/` untouched

- [ ] **Step 1:** Phase B preamble for `mokei`.
- [ ] **Step 2:** Write `.claude/settings.json` = canonical JSON.
- [ ] **Step 3:** `git -C /Users/paul/dev/yulsi/mokei rm docs/agents/conventions.md`; grep+fix inbound refs.
- [ ] **Step 4:** Replace `docs/agents/development.md` with the slim template; Repo-specific: `MCP toolkit (clients, servers, model providers, host monitoring). Integration tests in integration-tests/; llms.txt provides an LLM doc index; uses Enkaku for streaming/transport.`
- [ ] **Step 5:** Read the existing `docs/index.md`. Align it to the canonical template: ensure it links the stack overview (`https://github.com/TairuFramework/kigu/blob/main/docs/stack.md`), the conventions & development skills, `agents/architecture.md`, and `agents/plans/`. Preserve existing links into `guides/` by adding a `- **Guides:** [guides/](./guides/)` line.
- [ ] **Step 6:** Validate JSON + status; confirm `conventions.md` gone.
- [ ] **Step 7:** Commit:

```bash
git -C /Users/paul/dev/yulsi/mokei add -A
git -C /Users/paul/dev/yulsi/mokei commit -m "Align repo layout with the stack canon

Removes the duplicated docs/agents/conventions.md, slims docs/agents/development.md
to a pointer, aligns docs/index.md to the canonical shape (keeping the guides links),
and adds the committed .claude/settings.json enabling the kigu marketplace.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final validation

- [ ] **V1: kigu biome clean** — `pnpm exec biome check ./packages ./plugins` → no errors.
- [ ] **V2: development skill loads** — `test -f plugins/kigu/skills/development/SKILL.md && head -2 plugins/kigu/skills/development/SKILL.md`.
- [ ] **V3: no stale skill refs** — `grep -rn "sakui\|kubun\|the agents repo\|manually propagated to\|agents/conventions.md" plugins/kigu/skills/` → empty.
- [ ] **V4: overview renamed** — `test ! -f docs/repo-split-design.md && test -f docs/stack.md && echo OK`; `grep -rn "repo-split-design" . --include=*.md` → empty.
- [ ] **V5: every repo has settings + CLAUDE + index** — for each of sozai, kokuin, enkaku, tejika, kumiai, mokei (and kigu): confirm `.claude/settings.json` contains `kigu@kigu`, `CLAUDE.md` exists, `docs/index.md` exists, and no `docs/agents/conventions.md` remains.
- [ ] **V6: tejika README** — `test -f /Users/paul/dev/yulsi/tejika/README.md`.
- [ ] **V7: reference renames** — `test -d /Users/paul/dev/yulsi/sozai/docs/reference && test -d /Users/paul/dev/yulsi/kokuin/docs/reference && test -d /Users/paul/dev/yulsi/enkaku/docs/reference`.

## Notes on execution

- Phase A commits land on kigu's current `stack-docs` branch. Phase B lands one `stack-alignment`
  branch per sibling repo — these are not merged by this plan; each repo's PR/merge is a separate
  finishing step.
- If a subagent cannot run bash in a sibling repo, the controller performs that task's file
  operations directly (Read/Write/Edit + git via the Bash tool), matching the plan steps.
- Sibling repos may carry uncommitted work — the preamble halts on a dirty tree rather than
  stashing. Report and wait for the user.
