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
- **Repo layout** — conventions skill §7.

## History

The stack began as the single `enkaku` monorepo (JWT RPC that accreted utilities, keystores,
and an MLS stack). It was split in mid-2026 to stop lockstep version churn and give each layer
its own altitude and release cadence. The rename map, codemod, and migration sequencing that
drove the split are preserved in the repos' `docs/agents/plans/archive/` and completed-plan
histories; they are no longer needed to work in the stack.
