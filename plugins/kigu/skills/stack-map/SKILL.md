---
name: stack-map
description: Use when working across the TairuFramework stack — to find a sibling repo's docs, packages, or conventions, understand cross-repo dependencies, or check kigu version drift.
---

# Stack map

The stack is seven sibling repos under the `TairuFramework` GitHub org. This skill is the router
between them. The data lives in `stack.json` (next to this file); this document is how to use it.

## The repos

Read `stack.json`. Each `repos[]` entry has:

- `name` — short repo name (also the GitHub repo name).
- `scope` — npm scope (`@sozai`, …); absent for `kigu`, which publishes `@kigu/dev` only.
- `kanji` — the Japanese source word.
- `role` — one-line purpose.
- `repo` — GitHub URL.
- `docs` — docs path within the repo (relative).
- `domainPlugin` — name of the repo's local Claude plugin, or `null`.
- `dependsOn` — sibling `name`s this repo builds on (the downward DAG).

`publishes` records the current expected versions of kigu-owned artifacts (`@kigu/dev`,
`kigu-plugin`) — the baseline for the drift check below.

## Routing to a sibling's docs

To reach repo Y's docs from anywhere:

1. Look up Y in `stack.json`.
2. If Y is cloned locally as a sibling, read `<clone>/<docs>`.
3. Otherwise fetch from GitHub: `WebFetch` `<repo>/tree/main/<docs>` (or a raw file URL under it).

Dependencies:

- **Down-deps** (what Y builds on): Y's `dependsOn`.
- **Up-deps** (what builds on Y): every repo whose `dependsOn` contains Y (reverse lookup).

## Conventions

Canonical coding rules are NOT here — they live in the `kigu:conventions` skill (also in the kigu
plugin, already in context). This skill only routes; it never restates rules.

## Version drift check (on request)

When asked whether the working repo is current:

1. Read its `@kigu/dev` pin (`package.json` devDependencies) and its installed kigu-plugin version.
2. Compare to `stack.json.publishes`.
3. Report behind / current / ahead per artifact. Informational — there is no gate.

## Adding or editing a repo

`stack.json` is hand-edited. Keep `repos` a flat list; encode stack position only via `dependsOn`
(sibling names that already exist in the list — no dangling references, and the graph stays
acyclic, i.e. deps point downward only). Every repo's root `AGENTS.md` follows the thin-pointer
shape documented in the `kigu:conventions` skill.
