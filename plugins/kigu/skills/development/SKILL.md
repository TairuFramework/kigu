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

## Debugging

- **Before changing code, rank the candidate root causes** (top 2-3) with the evidence for each,
  and state which one you are investigating. Do not start editing on the first plausible theory.
- **A hypothesis the user has rejected is dead.** Do not re-pursue it, restate it in different
  words, or "just double-check" it. Move to the next candidate.
- Prefer confirming a theory with a minimal reproduction or failing test before applying the fix;
  apply the fix, then show the reproduction passing.

## Release and versioning

- Versioning is per-package via changesets -- no hard `fixed` lock. Coupled packages are bumped
  together by the releaser's judgement, not enforced config.
- Cross-repo dependencies are published `^` semver ranges, never `workspace:`. Develop across a
  repo boundary via a canary/prerelease publish.
- 1.0 promotion is per-repo, whole: a repo goes 1.0 as a unit once its surface is stable, and
  every package in it goes 1.0 together (SDK-bound packages included -- 1.0 is semver discipline,
  they can still major often).

## Planning and documentation

Persistent plan artifacts live in `docs/agents/plans/`; ephemeral working docs in `docs/superpowers/`.

### Ephemeral (branch lifetime)
```
docs/superpowers/
  specs/    # brainstorming design specs
  plans/    # implementation plans
```
Deleted before the branch merges to main -- the `kigu:complete` skill handles cleanup.

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
6. Complete -- summary to `docs/agents/plans/completed/`, ephemeral files cleaned (`kigu:complete`).
7. Finish -- merge or PR.
8. Archive -- consolidate completed plans into monthly summaries (`kigu:archive`).

### Plan statuses
Statuses apply to completed plans only: `complete`, `partial`, `superseded`, `cancelled`.
Files in `completed/` use `YYYY-MM-DD-slug.<status>.md` plus a `**Status:**` line near the top.
Files in `next/` and `backlog/` use `YYYY-MM-DD-slug.md` -- no status suffix, no Status line.
Archive files use `YYYY-MM-archive-summary.md`.

### Lifecycle skills
Shared via the kigu plugin (enabled through the kigu marketplace in each repo's `.claude/settings.json`):

| Skill | Purpose |
|-------|---------|
| `kigu:dev-loop` | Drive the full development cycle with session resumption |
| `kigu:project-loop` | Manage priorities, roadmap, architecture review, and triage |
| `kigu:complete` | Summarise a finished plan, move it to `completed/`, clean ephemeral files |
| `kigu:archive` | Consolidate completed plans into monthly summaries |
