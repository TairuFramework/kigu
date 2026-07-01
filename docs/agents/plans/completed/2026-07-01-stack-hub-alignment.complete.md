# Stack hub: routing + alignment

**Status:** complete
**Date:** 2026-07-01

Turned kigu into the stack's hub — the router to every sibling repo and the single source of
shared conventions, workflow, and repo structure — and brought all 7 repos to one canonical
shape. Follow-up to the completed monorepo split (code ported, packages published). Delivered in
two phases.

## Phase 1 — routing & sync foundation

- **`stack.json`** (`plugins/kigu/skills/stack-map/`) — flat index of all 7 repos: name, kanji,
  npm scope, GitHub URL, docs path, domain plugin, downward `dependsOn` edges. GitHub URLs, not
  relative paths. Single source of truth for cross-repo structure.
- **`stack-map` skill** — routes to a sibling's docs/packages, maps cross-repo dependencies,
  checks kigu version drift on request.
- **conventions skill "Root AGENTS.md shape"** — the thin-pointer convention: each repo's
  AGENTS.md is short and repo-specific, never restates the shared guardrails (those live in the
  conventions skill), and `CLAUDE.md` is just `@AGENTS.md`.
- kigu's own AGENTS.md trimmed to that shape; README links the stack index.

Key decision: kigu routes, it does not aggregate — docs stay in their owning repos. Flat repo
list (no separate "consumers" array); tejika/mokei are stack members like the rest.

## Phase 2 — full repo alignment

- **`development` skill** — canonical build/test/release workflow + plans lifecycle, synthesized
  from the per-repo `development.md` copies; includes a Release/versioning section (changesets,
  `^` cross-repo ranges, per-repo 1.0 cadence).
- **conventions skill** — added the "Canonical repo layout" section; removed the
  Build/Testing/Dependency/Planning sections it used to carry (now owned by the development
  skill) and renumbered the rest. Simplicity First now tells agents to prefer a stack package
  (via the `stack-packages` skill) before adding a dependency or writing local utilities.
- **Workflow skills aligned** — project-loop/dev-loop scrubbed of retired repo names and dead
  `docs/agents/conventions.md` reads; point at the conventions + development skills; plan
  folders created on demand; `milestones/`+`next/` optional.
- **`stack-packages` skill** — renamed from `enkaku-packages` (it spans four scopes now) with
  every package remapped to the post-split layout, deferring to stack.json/stack-map for scopes.
- **`docs/stack.md`** — production stack overview (roles, downward dep graph, shared
  toolchain/AI-assets/CI), replacing `docs/repo-split-design.md`. Added kigu `docs/index.md`.
- **Marketplace wiring** — every repo gained a committed `.claude/settings.json` enabling the
  kigu marketplace + `kigu@kigu` plugin, so the shared skills actually load everywhere (they
  reached no repo before this).
- **Sibling rollout** — sozai/kokuin/enkaku/tejika/kumiai/mokei each aligned: thin
  `development.md` pointer, removed duplicate `conventions.md`, `domains/`|`capabilities/` →
  `reference/`, added missing `CLAUDE.md`/`README.md`/`docs/index.md`, real `architecture.md`
  where absent.

Key decisions: shared guidance is sourced once from kigu skills, never copied per repo (the
SHARED.md problem, finished) — conventions = code standards, development = build/test/release,
both auto-load via the plugin. `docs/superpowers/` (specs/plans) is ephemeral, branch-only,
deleted before merge; permanent planning lives in `docs/agents/plans/`, created on demand — no
empty scaffolding. Domain-skill plugins per repo, CI enforcement, and doc aggregation were
explicit non-goals.

## Notes

- Sibling repo changes were applied here but committed separately by the maintainer (some trees
  carried unrelated pre-existing work).
