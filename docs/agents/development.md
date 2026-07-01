# Development

Shared build, test, and release workflow lives in the kigu `development` skill,
auto-loaded via the kigu plugin. See it for the pnpm / Turbo / SWC / Biome / Vitest
workflow and the `docs/agents/plans/` lifecycle.

## Repo-specific

kigu publishes `@kigu/dev` (the config preset) and hosts the plugin marketplace. No runtime
code. Do not edit generated files; the marketplace source of truth is `.claude-plugin/marketplace.json`.
