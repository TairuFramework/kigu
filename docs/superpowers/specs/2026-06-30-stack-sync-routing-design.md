# Stack sync & routing — design

Status: approved design (brainstorm complete, 2026-06-30)
Scope: follow-up to `docs/repo-split-design.md`. The five-repo split is done — code ported,
packages published. This spec defines how the now-separate repos stay in sync (conventions,
guardrails) and how an agent or human routes from one repo to another's docs/packages, with
`kigu` as the hub.

## Motivation

The split traded one monorepo for seven sibling repos (`kigu`, `sozai`, `kokuin`, `enkaku`,
`tejika`, `kumiai`, `mokei`). That removed lockstep version churn but opened four gaps:

1. **Guardrails duplicated** — each repo's `AGENTS.md` re-states the same guardrails block by
   hand; it drifts whenever conventions change.
2. **No cross-repo map** — inside repo X there is no single place that says where repo Y's
   docs, packages, or skills live. Agents cannot route.
3. **Version drift** — repos pin different `@kigu/dev` / kigu-plugin versions with no record of
   what the current expectation is.
4. **Docs scattered** — architecture docs that describe the whole stack live in one repo but
   apply to all; there is no shared home.

The split design already named the propagation mechanism: the `kigu` plugin (installed via the
marketplace by every repo) carries the canonical `conventions` skill and shared workflow skills,
and `@kigu/dev` carries configs. This spec adds the missing **routing + sync layer** on top of
that mechanism, without reintroducing copy-based churn.

### Goals

1. Kill guardrail duplication — one canonical source, repos point at it.
2. Give agents and humans a single router from any repo to any sibling's docs/packages.
3. Record expected kigu-owned versions so drift is visible (not gated).
4. Give stack-wide docs one home.

Non-goal: CI enforcement. Consumers are agents and humans; drift surfaces on request, not as a
gate. Non-goal: aggregating sibling docs into `kigu` — docs version with their code and stay
local; routing uses pointers, never copies.

## Consumers

AI agents (working in a cloned repo) and humans (developers browsing). Not CI. This shapes the
form: a **skill** (auto-loaded into agent context on plugin install) wrapping a
**machine-readable data file** (that humans browse and a README links). One source, two readers.

## Architecture

`kigu` is the hub. Every repo already installs the `kigu` plugin via the marketplace, so anything
shipped in that plugin is available everywhere with no per-repo copy. The routing + sync layer is
three things, all centered on `kigu`:

```
kigu plugin (installed everywhere)
  ├─ conventions skill      — canonical coding rules (already exists; source of truth)
  └─ stack-map skill        — NEW router: SKILL.md (how-to) + stack.json (data)
                                 │
kigu/docs/                       │ routes to (pointers, never copies)
  └─ stack-wide arch docs        ▼
                          sibling repos' local docs/  (version with their code)

each repo's root AGENTS.md  — thin pointer to the two skills above (no guardrails copied)
```

- **`stack.json`** — the single source of truth for what the stack contains and what versions
  `kigu` publishes. Pure data.
- **`stack-map` skill** — the how-to-route layer over `stack.json`, auto-loaded into agent
  context.
- **thin-pointer `AGENTS.md`** — a documented convention each repo follows; no machinery.

### Component 1 — `stack.json` (single source)

Location: `plugins/kigu/skills/stack-map/stack.json` (ships with the plugin).

Schema:

```json
{
  "org": "TairuFramework",
  "marketplace": "kigu",
  "publishes": {
    "@kigu/dev": "<current published version>",
    "kigu-plugin": "<current plugin.json version>"
  },
  "repos": [
    {
      "name": "kigu",
      "kanji": "器具",
      "role": "tooling hub: configs + plugin marketplace + conventions",
      "repo": "https://github.com/TairuFramework/kigu",
      "docs": "docs/",
      "domainPlugin": "kigu",
      "dependsOn": []
    },
    {
      "name": "sozai", "scope": "@sozai", "kanji": "素材",
      "role": "core utilities + external-library wrappers",
      "repo": "https://github.com/TairuFramework/sozai",
      "docs": "docs/", "domainPlugin": null, "dependsOn": []
    },
    {
      "name": "kokuin", "scope": "@kokuin", "kanji": "刻印",
      "role": "identity / auth / keys",
      "repo": "https://github.com/TairuFramework/kokuin",
      "docs": "docs/", "domainPlugin": "kokuin", "dependsOn": ["sozai"]
    },
    {
      "name": "enkaku", "scope": "@enkaku", "kanji": "遠隔",
      "role": "RPC over multiple transports",
      "repo": "https://github.com/TairuFramework/enkaku",
      "docs": "docs/", "domainPlugin": "enkaku", "dependsOn": ["sozai", "kokuin"]
    },
    {
      "name": "tejika", "scope": "@tejika", "kanji": "手近",
      "role": "local-side foundation: CLI / process / server",
      "repo": "https://github.com/TairuFramework/tejika",
      "docs": "docs/", "domainPlugin": "tejika", "dependsOn": ["enkaku"]
    },
    {
      "name": "kumiai", "scope": "@kumiai", "kanji": "組合",
      "role": "MLS group messaging",
      "repo": "https://github.com/TairuFramework/kumiai",
      "docs": "docs/", "domainPlugin": "kumiai", "dependsOn": ["sozai", "kokuin", "enkaku"]
    },
    {
      "name": "mokei", "scope": "@mokei", "kanji": "模型",
      "role": "MCP toolkit: clients / servers / model providers + host monitoring",
      "repo": "https://github.com/TairuFramework/mokei",
      "docs": "docs/", "domainPlugin": "mokei", "dependsOn": ["sozai", "enkaku", "tejika"]
    }
  ]
}
```

Field notes:

- **Flat `repos` list** — no second-class "consumers" array. Position in the stack is encoded
  entirely by `dependsOn` (the DAG). `tejika` and `mokei` are full members, just higher up.
- `repo` is the **GitHub URL** (agents `WebFetch` raw docs from it; humans click). Not a local
  path — local clone layout is not assumed.
- `dependsOn` lists sibling `name`s only (not package-level deps). Down-deps = follow the list;
  up-deps = reverse lookup.
- `domainPlugin` = the name of that repo's local domain plugin, or `null` if it has none.
- `publishes` = the current expected versions of `kigu`-owned artifacts; the drift baseline.
- `mokei`'s deps (`sozai`, `enkaku`, `tejika`) were confirmed from its package manifests at
  spec time; update if its dependency surface changes.

### Component 2 — `stack-map` skill (the router)

Location: `plugins/kigu/skills/stack-map/` — `SKILL.md` + `stack.json`.

`SKILL.md` description (the auto-load trigger), approximately:

> Use when working across the TairuFramework stack — to find a sibling repo's docs, packages, or
> conventions, understand cross-repo dependencies, or check kigu version drift.

`SKILL.md` body covers:

1. **Stack overview** — how to read `stack.json`: the repos, their roles/scopes, and the
   `dependsOn` DAG.
2. **Routing protocol** — to reach repo Y's docs from repo X: look up Y in `stack.json`, take its
   `repo` URL + `docs/` path, `WebFetch` the raw docs (or note Y is not cloned locally).
   Down-deps via `dependsOn`; up-deps via reverse lookup.
3. **Drift check (on request)** — read the working repo's pinned `@kigu/dev` and kigu-plugin
   versions, compare to `stack.json.publishes`, report behind / ahead / current. No gating.
4. **Conventions pointer** — one line: canonical coding rules live in the `conventions` skill.
5. **Schema + thin-AGENTS.md reference** — documents the `stack.json` schema (so a new repo can
   be added by hand) and points to the conventions skill for the AGENTS.md shape.

`stack.json` stays pure data; `SKILL.md` holds all the how-to. Humans read `stack.json`
directly; a short README section in `kigu` links it.

### Component 3 — thin-pointer `AGENTS.md` convention

Every repo's root `AGENTS.md` is repo-specific and thin — no guardrails copied. Shape:

```markdown
# <repo>

> Conventions: kigu `conventions` skill (canonical — do not restate).
> Stack map / sibling docs: kigu `stack-map` skill.

## What this repo is
<one paragraph, repo-specific>

## Guardrails
See the `conventions` skill. Repo-specific only: <anything genuinely local, e.g. pnpm only>.
```

`CLAUDE.md` stays `@AGENTS.md` (the existing pattern). Because the guardrails live only in the
`conventions` skill, changing a rule never requires editing seven repos.

This is a **documented convention, not a generator**. The shape is documented in the
`conventions` skill; `stack.json`'s schema is documented in the `stack-map` skill. New repos and
edits apply it by hand. `discover-template` is **not** modified.

### Component 4 — stack-wide docs home

Architecture docs that describe the whole stack (`docs/repo-split-design.md`, this spec, future
cross-cutting docs) live in `kigu/docs/`. Per-repo docs stay in their own repo and version with
their code; `stack-map` routes to them. No doc is ever copied between repos.

## Data flow

Agent in `enkaku` needs `kokuin`'s token docs:

1. `stack-map` skill is in context (kigu plugin installed).
2. Agent reads `stack.json`, finds `kokuin` → `repo` URL + `docs/`.
3. Agent `WebFetch`es the raw docs path, or reads the local clone if present.

Conventions question, any repo: the `conventions` skill is already in context — answer directly,
no routing.

Version drift, on request: read the repo's pins, diff against `stack.json.publishes`, report.

## Validation

This is a data + docs change; `kigu` ships no runtime code, so no package tests.

- `stack.json` must be valid JSON, and every `dependsOn` entry must resolve to a real
  `repos[].name` (no dangling references, no cycles). The `stack-map` skill asserts this on read
  — no standalone script.
- The `stack-map` skill's routing and drift steps are exercised by following them once by hand
  against a real sibling repo during implementation.

## Deliverables (in `kigu`)

1. `plugins/kigu/skills/stack-map/SKILL.md` + `plugins/kigu/skills/stack-map/stack.json` — the
   new router skill and its data.
2. `plugins/kigu/skills/conventions/SKILL.md` — add a section documenting the thin-`AGENTS.md`
   shape.
3. `kigu/docs/` — confirmed home for stack-wide docs (already true; note it).
4. `kigu/AGENTS.md` — trim to the thin-pointer form and add the `stack-map` pointer.
5. Short README section in `kigu` linking `stack.json` for human browsing.

## Follow-up (out of `kigu` scope)

Each sibling repo (`sozai`, `kokuin`, `enkaku`, `tejika`, `kumiai`, `mokei`) currently carries a
hand-written guardrails block in its `AGENTS.md`. Trim each to the thin-pointer form — one small
PR per repo. Tracked separately from the `kigu` changes above.
