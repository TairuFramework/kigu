# Stack sync & routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `kigu` the routing + sync hub for the seven-repo stack — a `stack-map` skill over a `stack.json` index, a documented thin-pointer `AGENTS.md` convention, and a trimmed kigu `AGENTS.md`/README — so conventions stop being duplicated and any repo can route to a sibling's docs.

**Architecture:** All deliverables ship inside the existing `kigu` plugin (already installed by every repo via the marketplace) or in kigu's root docs. No runtime code, no generator changes, no CI gate. The `stack-map` skill auto-loads into agent context; `stack.json` is pure data that humans browse and the skill reads.

**Tech Stack:** Markdown skills (`SKILL.md` + frontmatter), JSON data, Biome (formatting/lint), pnpm.

## Global Constraints

- pnpm only — never npm/npx. (verbatim from spec / AGENTS.md)
- No runtime code is added to `kigu`; deliverables are data + docs only.
- `discover-template` is NOT modified — the AGENTS.md shape is a documented convention, not a generator.
- Per-repo docs are never copied into `kigu`; routing uses pointers (GitHub URLs).
- `stack.json` `repos` is a flat list; stack position is encoded only via `dependsOn` (sibling `name`s); references must resolve and the graph stays acyclic (deps point downward).
- Lint every change: `pnpm lint` (`biome check --write ./packages ./plugins`) before commit.

---

### Task 1: `stack.json` index + validation

**Files:**
- Create: `plugins/kigu/skills/stack-map/stack.json`
- Validate: ad-hoc `node -e` command (no test file — kigu ships no runtime code)

**Interfaces:**
- Produces: the data file the `stack-map` skill (Task 2) reads. Top-level keys: `org`, `marketplace`, `publishes` (`@kigu/dev`, `kigu-plugin`), `repos[]`. Each `repos[]` entry: `name`, `scope?`, `kanji`, `role`, `repo`, `docs`, `domainPlugin` (string|null), `dependsOn` (string[] of sibling `name`s).

- [ ] **Step 1: Write `stack.json`**

Create `plugins/kigu/skills/stack-map/stack.json`. Versions copied from current repo state (`@kigu/dev` = `0.1.1` in `packages/dev/package.json`, `kigu-plugin` = `0.1.0` in `plugins/kigu/.claude-plugin/plugin.json`):

```json
{
  "org": "TairuFramework",
  "marketplace": "kigu",
  "publishes": {
    "@kigu/dev": "0.1.1",
    "kigu-plugin": "0.1.0"
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
      "name": "sozai",
      "scope": "@sozai",
      "kanji": "素材",
      "role": "core utilities + external-library wrappers",
      "repo": "https://github.com/TairuFramework/sozai",
      "docs": "docs/",
      "domainPlugin": null,
      "dependsOn": []
    },
    {
      "name": "kokuin",
      "scope": "@kokuin",
      "kanji": "刻印",
      "role": "identity / auth / keys",
      "repo": "https://github.com/TairuFramework/kokuin",
      "docs": "docs/",
      "domainPlugin": "kokuin",
      "dependsOn": ["sozai"]
    },
    {
      "name": "enkaku",
      "scope": "@enkaku",
      "kanji": "遠隔",
      "role": "RPC over multiple transports",
      "repo": "https://github.com/TairuFramework/enkaku",
      "docs": "docs/",
      "domainPlugin": "enkaku",
      "dependsOn": ["sozai", "kokuin"]
    },
    {
      "name": "tejika",
      "scope": "@tejika",
      "kanji": "手近",
      "role": "local-side foundation: CLI / process / server",
      "repo": "https://github.com/TairuFramework/tejika",
      "docs": "docs/",
      "domainPlugin": "tejika",
      "dependsOn": ["enkaku"]
    },
    {
      "name": "kumiai",
      "scope": "@kumiai",
      "kanji": "組合",
      "role": "MLS group messaging",
      "repo": "https://github.com/TairuFramework/kumiai",
      "docs": "docs/",
      "domainPlugin": "kumiai",
      "dependsOn": ["sozai", "kokuin", "enkaku"]
    },
    {
      "name": "mokei",
      "scope": "@mokei",
      "kanji": "模型",
      "role": "MCP toolkit: clients / servers / model providers + host monitoring",
      "repo": "https://github.com/TairuFramework/mokei",
      "docs": "docs/",
      "domainPlugin": "mokei",
      "dependsOn": ["sozai", "enkaku", "tejika"]
    }
  ]
}
```

- [ ] **Step 2: Validate — JSON parses and every `dependsOn` resolves**

Run (from kigu repo root):

```bash
node -e "const fs=require('fs');const s=JSON.parse(fs.readFileSync('plugins/kigu/skills/stack-map/stack.json','utf8'));const n=new Set(s.repos.map(r=>r.name));for(const r of s.repos){for(const d of r.dependsOn){if(d===r.name)throw new Error('self-dep '+r.name);if(!n.has(d))throw new Error('dangling '+d+' in '+r.name);}}console.log('ok',s.repos.length,'repos, all deps resolve');"
```

Expected: `ok 7 repos, all deps resolve`
(Cycle-freedom is guaranteed by construction: every `dependsOn` points to a repo earlier in the list. Confirm by eye.)

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: passes; Biome may reformat `stack.json` — accept the formatting.

- [ ] **Step 4: Commit**

```bash
git add plugins/kigu/skills/stack-map/stack.json
git commit -m "Add stack.json stack index"
```

---

### Task 2: `stack-map` skill (the router)

**Files:**
- Create: `plugins/kigu/skills/stack-map/SKILL.md`

**Interfaces:**
- Consumes: `stack.json` from Task 1 (sibling file).
- Produces: an auto-loaded skill. Its frontmatter `description` is the trigger; the body documents routing, drift check, and the `stack.json` schema referenced by Task 3.

- [ ] **Step 1: Write `SKILL.md`**

Create `plugins/kigu/skills/stack-map/SKILL.md`:

````markdown
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

Canonical coding rules are NOT here — they live in the `conventions` skill (also in the kigu
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
shape documented in the `conventions` skill.
````

- [ ] **Step 2: Verify frontmatter + key sections present**

Run:

```bash
grep -q '^name: stack-map$' plugins/kigu/skills/stack-map/SKILL.md && grep -q '^## Routing to a sibling' plugins/kigu/skills/stack-map/SKILL.md && grep -q '^## Version drift check' plugins/kigu/skills/stack-map/SKILL.md && echo "skill ok"
```

Expected: `skill ok`

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add plugins/kigu/skills/stack-map/SKILL.md
git commit -m "Add stack-map router skill"
```

---

### Task 3: Document thin-pointer AGENTS.md shape in conventions skill

**Files:**
- Modify: `plugins/kigu/skills/conventions/SKILL.md` (append a new section after section 9, the current last section)

**Interfaces:**
- Consumes: nothing.
- Produces: the canonical description of the thin `AGENTS.md` shape, referenced by the `stack-map` skill and applied by hand in every repo.

- [ ] **Step 1: Append section 10 to the conventions skill**

Append to the end of `plugins/kigu/skills/conventions/SKILL.md`:

````markdown

## 10. Root AGENTS.md shape

Every repo's root `AGENTS.md` is thin and repo-specific. It never restates the guardrails — those
live in this skill — and `CLAUDE.md` is just `@AGENTS.md`. Changing a shared rule then touches
only this skill, never every repo.

Shape:

```markdown
# <repo>

> Conventions: kigu `conventions` skill (canonical — do not restate).
> Stack map / sibling docs: kigu `stack-map` skill.

## What this repo is
<one paragraph, repo-specific>

## Guardrails
See the `conventions` skill. Repo-specific only: <anything genuinely local, e.g. pnpm only>.
```
````

- [ ] **Step 2: Verify the section landed**

Run:

```bash
grep -q '^## 10. Root AGENTS.md shape' plugins/kigu/skills/conventions/SKILL.md && echo "section ok"
```

Expected: `section ok`

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add plugins/kigu/skills/conventions/SKILL.md
git commit -m "Document thin-pointer AGENTS.md shape in conventions skill"
```

---

### Task 4: Trim kigu's own AGENTS.md + link stack.json from README

**Files:**
- Modify: `AGENTS.md` (kigu root)
- Modify: `README.md` (kigu root)

**Interfaces:**
- Consumes: the `stack-map` skill (Task 2) and the conventions section (Task 3) it now points to.
- Produces: kigu's root context files in thin-pointer form (guardrails de-duplicated, stack-map referenced).

- [ ] **Step 1: Add a stack-map pointer to the Conventions section of `AGENTS.md`**

In `AGENTS.md`, find the Conventions section paragraph that ends:

```
replaces the old manually-propagated `SHARED.md`. Follow it for any code authored
here or in consuming repos.
```

Insert immediately after it:

```

Cross-repo routing — find a sibling repo's docs/packages, map dependencies, or check version
drift — lives in the `stack-map` skill (`plugins/kigu/skills/stack-map/`).
```

- [ ] **Step 2: Replace the duplicated Guardrails block in `AGENTS.md` with a pointer**

In `AGENTS.md`, replace this block:

```markdown
## Guardrails

- pnpm only (never npm/npx).
- `type` not `interface`; `Array<T>` not `T[]`; never `any`; capital `ID`/`HTTP`/`JWT`/`DID`; ES `#fields`, never `private`/`readonly`.
- Do not edit generated files.
```

with:

```markdown
## Guardrails

See the `conventions` skill (canonical — do not restate). Repo-specific only: pnpm only; no
runtime code is imported from here; do not edit generated files.
```

- [ ] **Step 3: Link `stack.json` from `README.md`**

In `README.md`, after the line:

```
Code plugin marketplace (workflow skills, conventions, discover template).
```

insert:

```

The `stack-map` skill (`plugins/kigu/skills/stack-map/stack.json`) is the cross-repo index:
every stack repo with its scope, GitHub URL, docs path, and dependencies.
```

- [ ] **Step 4: Verify edits**

Run:

```bash
grep -q 'stack-map' AGENTS.md && grep -q 'stack-map' README.md && ! grep -q 'capital `ID`/`HTTP`' AGENTS.md && echo "edits ok"
```

Expected: `edits ok` (the verbatim guardrail rules are gone from AGENTS.md; stack-map is referenced in both files)

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md README.md
git commit -m "Trim kigu AGENTS.md to thin-pointer form, link stack index"
```

---

## Follow-up (separate, out of this plan's scope)

Each sibling repo (`sozai`, `kokuin`, `enkaku`, `tejika`, `kumiai`, `mokei`) still carries a
hand-written guardrails block in its `AGENTS.md`. Trim each to the thin-pointer shape from
section 10 of the conventions skill — one small PR per repo. Not part of this kigu plan.
