# Stack alignment — design

Status: approved design (brainstorm complete, 2026-07-01)
Scope: bring all 7 stack repos to a single, matching set of repo-level patterns —
`docs/` structure, root files, the shared workflow skills, and a production stack
overview entry-point. Follow-up to the completed monorepo split (code ported,
packages published).

## Motivation

The enkaku monorepo split is done: 7 sibling repos under `TairuFramework`
(`kigu`, `sozai`, `kokuin`, `enkaku`, `tejika`, `kumiai`, `mokei`), code ported,
packages published. Now the repos have drifted at the meta level:

- **docs/ diverged into 3 layouts** — `docs/agents/` style, `docs/skills/*.skill.md` +
  `docs/domains|capabilities/` style, and mokei's richer `index.md` + `guides/`.
- **Plans hierarchy is uneven** — enkaku/mokei/tejika have the full
  `plans/{next,backlog,completed,archive}` + `roadmap.md` + `project-loop-state.md`;
  kokuin/kumiai/kigu are backlog-only; sozai has no `docs/agents/` at all.
- **conventions.md / development.md duplicated per repo** — the same shared guidance
  copied into each repo instead of sourced centrally (the old SHARED.md problem, half-solved:
  conventions moved to a kigu skill, development.md did not).
- **CLAUDE.md missing** in sozai, kokuin, kumiai; **README missing** in tejika.
- **The shared workflow skills reach nobody** — no sibling repo actually enables the kigu
  marketplace/plugin, so `dev-loop`/`project-loop`/`complete`/`archive`/`conventions`/
  `stack-map` load in kigu only. The propagation mechanism was designed but never wired.
- **`repo-split-design.md`** frames the stack as an in-progress refactor, not a
  production system, and is not a usable entry-point for someone landing on the stack.

The stack is now in production use. This project makes every repo match one canonical
shape, sources shared guidance from kigu (not per-repo copies), wires the shared skills so
they actually load everywhere, and turns the split-design doc into a production overview.

### Goals

1. **One canonical repo layout** — identical `docs/` tree and root files across all 7 repos.
2. **Shared guidance sourced once** — conventions and development workflow live in kigu skills;
   repos hold thin pointers + repo-specific deltas only.
3. **Shared skills actually load** — every repo enables the kigu marketplace/plugin (committed).
4. **A production stack entry-point** — `docs/stack.md`, the human-readable overview.
5. **Skills aligned to reality** — the workflow skills reference real repos, real paths,
   and the canonical skills (not dead per-repo doc files).

Non-goals: domain-skill plugins per repo (separate discover-template rollout); CI/lint
enforcement of the layout; aggregating sibling docs into kigu; migrating
`docs/skills/*.skill.md`.

## Approach

Convention-first, single spec (approach A). kigu becomes the source of truth first
(skills, overview doc, layout convention), then a mechanical rollout aligns all 7 repos.
One spec, one plan, many tasks. Decompose into a second spec only if the plan proves unwieldy.

## Component 1 — Canonical repo layout

The target every repo matches.

### Root files

| file | shape |
|------|-------|
| `AGENTS.md` | thin-pointer (existing convention, conventions skill §10). Source of truth for repo context. |
| `CLAUDE.md` | single line `@AGENTS.md`. Add to sozai, kokuin, kumiai. |
| `README.md` | human-facing. Add to tejika. |
| `.changeset/` | present where the repo publishes packages. |

### docs/ tree

```
docs/
  index.md              # repo doc entry; links the stack overview (TairuFramework/kigu/docs/stack.md)
  agents/
    architecture.md     # repo-specific
    development.md       # thin: pointer to the `development` skill + repo-specific deltas only
    plans/              # permanent planning — project-loop/dev-loop/complete/archive operate here
      next/ backlog/ completed/ archive/   # created on-demand (no .gitkeep placeholders)
      milestones/                          # optional, when relevant
      roadmap.md  project-loop-state.md    # created on first project-loop write
  reference/            # domain docs (was docs/domains/ | docs/capabilities/)
  guides/               # optional, user-facing (mokei-style)
  superpowers/          # EPHEMERAL — specs/ + plans/, branch-only, deleted before merge to main
```

### Plans naming (enkaku reference convention)

- `completed/`, `next/`, `backlog/`: `YYYY-MM-DD-slug.<status>.md`, status ∈ {`complete`, `partial`}.
- `archive/`: monthly `YYYY-MM-archive-summary.md`.
- `roadmap.md`, `project-loop-state.md`: at `plans/` root.

### On-demand, not scaffolded

No empty placeholder folders. Skills check existence and `mkdir` when they first write.
The layout defines folder names/roles; a repo with no completed work simply has no
`completed/` folder yet. The rollout never creates empty dirs.

### Severs (shared guidance sourced once)

- `docs/agents/conventions.md` → **removed**. Canonical conventions = kigu `conventions` skill.
  Repo-specific-only rules (if any) live in the AGENTS.md guardrails one-liner.
- `docs/agents/development.md` → **kept but slim**: a pointer to the kigu `development` skill
  plus repo-specific-only notes. Shared substance extracted to kigu first.
- `docs/agents/architecture.md` → repo-specific, stays.
- `docs/domains/` and `docs/capabilities/` → renamed to `docs/reference/` (one name everywhere).
- `docs/skills/*.skill.md` + per-repo domain plugin → **out of scope**, left untouched.

Result: `docs/agents/` holds `architecture.md` + slim `development.md` + `plans/`.

## Component 2 — Skills in the kigu plugin

### New: `development` skill

Shared build/test/release workflow: pnpm (never npm/npx), turbo orchestration,
changesets, biome, vitest, `workspace:^` internal deps, the pnpm catalog. Authored by
reviewing/combining/rewriting the existing `docs/agents/development.md` files
(enkaku, tejika, mokei, kokuin, …) into one canonical version. Auto-loaded like `conventions`.

### `conventions` skill — add "Canonical repo layout" section

A new section (sibling to the existing §10 AGENTS.md-shape) documenting the Component 1
tree + root files, so the layout is a readable convention, not just a rollout artifact.
conventions stays focused on code conventions otherwise — dev workflow lives in the
separate `development` skill.

### Align the 4 workflow skills to reality

- **project-loop** — remove stale repo names (`sakui`/`kubun` → current stack repos;
  "agents repo" → `kigu`). Review mode and the Artifacts table point at the `conventions`
  and `development` **skills**, not `docs/agents/conventions.md` / `development.md`. Mark
  `milestones/` and `next/` optional. Reflect on-demand folder creation.
- **dev-loop** — scrub any `conventions.md` reference; paths otherwise correct.
- **complete** — ephemeral handling already correct; light reinforcement only.
- **archive** — correct as-is; touch only if a path drifts.

## Component 3 — Marketplace enablement (committed)

Each repo commits a `.claude/settings.json` (not `.local`) that registers the kigu
marketplace (`TairuFramework/kigu`) and enables the `kigu` plugin, so
`dev-loop`/`project-loop`/`complete`/`archive`/`conventions`/`development`/`stack-map`
load in every repo. The exact keys (`extraKnownMarketplaces` / `enabledPlugins` or the
current Claude Code schema) are verified against the real config format before writing —
not guessed. This is what turns "shared skills" from design into fact.

## Component 4 — Stack overview doc

Rename `docs/repo-split-design.md` → `docs/stack.md`, reframed from "monorepo split refactor"
to production stack overview:

- The 7 repos: kanji, role, npm scope, GitHub URL, downward dependency graph (no cycles).
- Production status — split done, packages published, `^`-range cross-repo deps,
  per-repo 1.0 cadence.
- Where each repo's docs live + how to route — points to the `stack-map` skill and
  `stack.json` (machine-readable index).
- Pointers to the canonical `conventions` + `development` skills + the repo layout.
- Migration/codemod/blast-radius sections dropped (historical) or reduced to a short
  History footer.

THE human-readable entry-point. Every repo's `docs/index.md` links to it. Complements the
agent-facing `stack-map` skill + `stack.json` data (narrative vs router vs machine data).

## Component 5 — Rollout across the 7 repos

Order: **kigu first** (define the canon — skills, layout section, `docs/stack.md`), then each
sibling aligned in its own working dir, on its own branch, with its own commit(s). Each repo
is a separate git repo; one branch + PR/merge per repo.

Per-repo deltas (the plan verifies exact current state before touching each):

| repo | work |
|------|------|
| **kigu** | new `development` skill · conventions layout section · align 4 skills · rewrite → `docs/stack.md` · add `docs/index.md` · wire own `.claude/settings.json` |
| **sozai** | create `docs/agents/{architecture.md, development.md (slim)}` · add CLAUDE.md · `domains/`→`reference/` · drop conventions.md dup · `index.md` · wire |
| **kokuin** | add CLAUDE.md · drop conventions.md dup · `capabilities/`→`reference/` · slim development.md · `index.md` · wire |
| **enkaku** | drop conventions.md dup · slim development.md · `capabilities/`→`reference/` · `index.md` · wire |
| **tejika** | add README · slim development.md · `index.md` · wire |
| **kumiai** | add CLAUDE.md · add architecture.md + slim development.md · `index.md` · wire |
| **mokei** | slim development.md · keep `guides/` · `index.md` · wire |

Missing files are created as aligned stubs/pointers, not deep-authored docs — exception:
sozai's `architecture.md` gets real minimal content (it has none). Plans folders are left
on-demand; the rollout does not scaffold empty trees.

## Success criteria

1. All 7 repos have the same `docs/` layout, `CLAUDE.md`, and `README.md` (root files present).
2. No repo carries a `docs/agents/conventions.md`; every `docs/agents/development.md` is a thin
   pointer to the `development` skill.
3. The `development` skill exists in kigu and captures the shared workflow; the `conventions`
   skill has the repo-layout section.
4. The 4 workflow skills contain no stale repo names and no references to the dead per-repo
   conventions/development files.
5. Every repo's committed `.claude/settings.json` enables the kigu marketplace/plugin;
   invoking `/dev-loop` (or any shared skill) in any sibling resolves.
6. `docs/stack.md` exists as the production overview; `docs/repo-split-design.md` is gone;
   every repo's `docs/index.md` links the overview.
