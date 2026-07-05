# kigu

> **For AI agents:** Tooling hub for the stack. No runtime code is imported from here by apps.

## What this repo is

Two outputs, one repo:

1. **npm config package** (`packages/dev`): `@kigu/dev` — a toolchain preset bundling the Biome, SWC, and TypeScript configs alongside the tools that consume them, so deps and configs stay in sync. Other repos extend these.
2. **Claude Code plugin marketplace** (`.claude-plugin/marketplace.json` + `plugins/kigu/`): shared workflow skills (`dev-loop`, `learning-loop`, `project-loop`, `complete`, `archive`, `audit`), the canonical `conventions` and `development` skills, `stack-map`, `stack-packages`, `discover-template`, and lifecycle hooks (`plugins/kigu/hooks/`: post-edit lint + type-check, in-place-sed guard).

## Conventions

The canonical coding conventions live in the `conventions` skill
(`plugins/kigu/skills/conventions/SKILL.md`) — the single source of truth that
replaces the old manually-propagated `SHARED.md`. Follow it for any code authored
here or in consuming repos.

Cross-repo routing — find a sibling repo's docs/packages, map dependencies, or check version
drift — lives in the `stack-map` skill (`plugins/kigu/skills/stack-map/`).

## How consuming repos use kigu

- Add `@kigu/dev` as a devDependency; extend `@kigu/dev/tsconfig.json`, `["@kigu/dev/biome.json"]`, and `@kigu/dev/swc.json`.
- Reference the `kigu` marketplace and install the `kigu` plugin; add a local domain plugin per repo (instantiate `discover-template`).
- Reference the CI: call `TairuFramework/kigu/.github/workflows/<name>@main` (reusable workflows) and `TairuFramework/kigu/setup@main` (the setup action in custom jobs). See `.github/README.md`.

## Guardrails

See the `conventions` skill (canonical — do not restate). Repo-specific only: pnpm only; no
runtime code is imported from here; do not edit generated files.

See `docs/stack.md` for the stack overview (roles, dependency graph, how the repos hold together).
