# @kigu Tooling-Hub Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `@kigu` repository as the Yulsi stack's tooling hub — publishing shared build/lint/compile config as npm packages and shared AI assets (skills, conventions, discover template) as a Claude Code plugin marketplace.

**Architecture:** One repository, three faces. (1) A pnpm workspace whose `packages/*` are published npm config packages (`@kigu/tsconfig`, `@kigu/biome`, `@kigu/swc`, `@kigu/dev`). (2) A Claude Code plugin marketplace (`.claude-plugin/marketplace.json` + `plugins/kigu/`) bundling the shared workflow skills, a conventions skill (the source of truth, replacing manual `SHARED.md` propagation), an Enkaku-package-preference skill, and a discover template. (3) Root context (`AGENTS.md`/`CLAUDE.md`) pointing at the above.

**Tech Stack:** pnpm 11 workspaces, Biome 2, SWC, TypeScript 6, Turbo, Vitest. Claude Code plugin format. All config packages are data-only (JSON / package manifest) — no compilation step.

## Global Constraints

- **Package manager:** pnpm only (never npm/npx). `packageManager: "pnpm@11.8.0"`.
- **GitHub org / repo:** `TairuFramework/kigu`. npm scope `@kigu`, all packages `publishConfig.access = "public"`.
- **New scope starts at `0.1.0`** for every `@kigu/*` package.
- **TypeScript conventions** (enforced by the conventions skill, apply to any TS authored here): `type` not `interface`; `Array<T>` not `T[]`; never `any`; capital `ID`/`HTTP`/`JWT`/`DID`; ES private `#fields`, never `private`/`readonly` modifiers; no placeholder values to satisfy types.
- **Config values copied verbatim from the current enkaku repo** (do not invent): TypeScript `target es2025`, `module/moduleResolution nodenext`, `strict`, `declaration`, `jsx react-jsx`, `noUncheckedSideEffectImports`. Biome: 2-space indent, line width 100, single quotes, double JSX quotes, trailing commas all, semicolons as-needed, arrow parens always, organize-imports on. SWC: typescript syntax, target esnext, react automatic runtime, `process.env.NODE_ENV=production` optimizer global.
- **Toolchain versions** (pin in `@kigu/dev`, copied from enkaku catalog): `@biomejs/biome ^2.5.0`, `@swc/cli ^0.8.1`, `@swc/core ^1.15.41`, `@types/node ^26.0.0`, `@vitest/ui ^4.1.9`, `del-cli ^7.0.0`, `tsx ^4.22.4`, `turbo ^2.9.18`, `typescript ^6.0.3`, `vitest ^4.1.9`.
- **Skill/doc sources** are the existing `agents/` repo at `/Users/paul/dev/yulsi/agents` (sibling dir). Copy verbatim where instructed.
- This plan covers **kigu setup only**. Extracting `@sozai`/`@kokuin`/`@kumiai` and trimming `@enkaku` are separate downstream plans driven by the rename map in `docs/repo-split-design.md`.

---

### Task 1: Workspace scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `README.md`, `biome.json`, `tsconfig.json`

**Interfaces:**
- Produces: a pnpm workspace globbing `packages/*` and `plugins/*`; root scripts `lint`, `format`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "kigu-repo",
  "version": "0.0.0",
  "author": "Paul Le Cam",
  "type": "module",
  "private": true,
  "packageManager": "pnpm@11.8.0",
  "scripts": {
    "lint": "biome check --write ./packages ./plugins",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "catalog:"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - packages/*

catalog:
  '@biomejs/biome': ^2.5.0

nodeLinker: hoisted
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules
.DS_Store
*.log
.turbo
```

- [ ] **Step 4: Create `README.md`**

```markdown
# kigu (器具)

Shared tooling hub for the Yulsi stack: published build/lint/compile config
(`@kigu/tsconfig`, `@kigu/biome`, `@kigu/swc`, `@kigu/dev`) and a Claude Code
plugin marketplace (workflow skills, conventions, discover template).

See `docs/repo-split-design.md` for the architecture this supports.
```

- [ ] **Step 5: Create root `biome.json` (dogfoods the shared config once Task 3 lands; standalone until then)**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.0/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "json": { "formatter": { "enabled": true } }
}
```

- [ ] **Step 6: Create root `tsconfig.json` (editor convenience only; no build)**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "es2025",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "noEmit": true
  }
}
```

- [ ] **Step 7: Install and verify**

Run: `cd /Users/paul/dev/yulsi/kigu && pnpm install`
Expected: completes, creates `pnpm-lock.yaml`, no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml .gitignore README.md biome.json tsconfig.json pnpm-lock.yaml
git commit -m "chore: scaffold kigu pnpm workspace"
```

---

### Task 2: `@kigu/tsconfig` config package

**Files:**
- Create: `packages/tsconfig/package.json`, `packages/tsconfig/base.json`, `packages/tsconfig/README.md`

**Interfaces:**
- Produces: `@kigu/tsconfig/base.json` — extendable base for every runtime package's `tsconfig.json`.

- [ ] **Step 1: Create `packages/tsconfig/package.json`**

```json
{
  "name": "@kigu/tsconfig",
  "version": "0.1.0",
  "license": "MIT",
  "description": "Shared TypeScript configuration for the Yulsi stack",
  "repository": {
    "type": "git",
    "url": "https://github.com/TairuFramework/kigu",
    "directory": "packages/tsconfig"
  },
  "publishConfig": { "access": "public" },
  "files": ["*.json"],
  "exports": {
    "./base.json": "./base.json"
  }
}
```

- [ ] **Step 2: Create `packages/tsconfig/base.json` (verbatim from enkaku `tsconfig.build.json`)**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "target": "es2025",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "lib": ["es2025"],
    "types": [],
    "declaration": true,
    "jsx": "react-jsx",
    "noUncheckedSideEffectImports": true
  }
}
```

- [ ] **Step 3: Create `packages/tsconfig/README.md`**

```markdown
# @kigu/tsconfig

Shared TypeScript base config.

```json
// a package's tsconfig.json
{
  "extends": "@kigu/tsconfig/base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./lib" },
  "include": ["./src/**/*"]
}
```
```

- [ ] **Step 4: Verify the config resolves via extends**

Run:
```bash
cd /tmp && rm -rf kigu-tsc-check && mkdir kigu-tsc-check && cd kigu-tsc-check && \
cat > tsconfig.json <<'EOF'
{ "extends": "/Users/paul/dev/yulsi/kigu/packages/tsconfig/base.json", "compilerOptions": { "noEmit": true } }
EOF
npx -y typescript@^6.0.3 tsc --showConfig
```
Expected: prints the merged config including `"target": "es2025"` and `"strict": true`. No error.

- [ ] **Step 5: Commit**

```bash
cd /Users/paul/dev/yulsi/kigu
git add packages/tsconfig
git commit -m "feat: add @kigu/tsconfig"
```

---

### Task 3: `@kigu/biome` config package

**Files:**
- Create: `packages/biome/package.json`, `packages/biome/biome.json`, `packages/biome/README.md`

**Interfaces:**
- Produces: `@kigu/biome` — an extendable Biome config (consumers use `"extends": ["@kigu/biome"]`).

- [ ] **Step 1: Create `packages/biome/package.json`**

```json
{
  "name": "@kigu/biome",
  "version": "0.1.0",
  "license": "MIT",
  "description": "Shared Biome configuration for the Yulsi stack",
  "repository": {
    "type": "git",
    "url": "https://github.com/TairuFramework/kigu",
    "directory": "packages/biome"
  },
  "publishConfig": { "access": "public" },
  "files": ["biome.json"],
  "exports": {
    ".": "./biome.json",
    "./biome.json": "./biome.json"
  }
}
```

- [ ] **Step 2: Create `packages/biome/biome.json` (verbatim from enkaku `biome.json`, with the published `$schema` URL instead of the local node_modules path)**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.0/schema.json",
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "includes": ["**"],
    "attributePosition": "auto",
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "arrowParentheses": "always",
      "bracketSameLine": true,
      "bracketSpacing": true,
      "jsxQuoteStyle": "double",
      "quoteProperties": "asNeeded",
      "quoteStyle": "single",
      "semicolons": "asNeeded",
      "trailingCommas": "all"
    }
  },
  "linter": {
    "enabled": true,
    "includes": ["**"],
    "rules": {
      "recommended": true,
      "style": {
        "noParameterAssign": "error",
        "useAsConstAssertion": "error",
        "useDefaultParameterLast": "error",
        "useEnumInitializers": "error",
        "useSelfClosingElements": "error",
        "useSingleVarDeclarator": "error",
        "noUnusedTemplateLiteral": "error",
        "useNumberNamespace": "error",
        "noInferrableTypes": "error",
        "noUselessElse": "error"
      }
    }
  }
}
```

- [ ] **Step 3: Create `packages/biome/README.md`**

```markdown
# @kigu/biome

Shared Biome config.

```json
// a repo's biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.5.0/schema.json",
  "extends": ["@kigu/biome"],
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true }
}
```

Note: per-repo settings like `vcs` stay local; the shared base carries formatter + linter rules.
```

- [ ] **Step 4: Verify the config is valid Biome JSON**

Run:
```bash
cd /Users/paul/dev/yulsi/kigu && npx -y @biomejs/biome@^2.5.0 check packages/biome/biome.json
```
Expected: Biome parses it without configuration errors (it may report "no files to check" or format-clean — the point is no schema/parse error).

- [ ] **Step 5: Commit**

```bash
git add packages/biome
git commit -m "feat: add @kigu/biome"
```

---

### Task 4: `@kigu/swc` config package

**Files:**
- Create: `packages/swc/package.json`, `packages/swc/swc.json`, `packages/swc/README.md`

**Interfaces:**
- Produces: `@kigu/swc/swc.json` — the shared SWC build config, referenced by `swc --config-file`.

- [ ] **Step 1: Create `packages/swc/package.json`**

```json
{
  "name": "@kigu/swc",
  "version": "0.1.0",
  "license": "MIT",
  "description": "Shared SWC configuration for the Yulsi stack",
  "repository": {
    "type": "git",
    "url": "https://github.com/TairuFramework/kigu",
    "directory": "packages/swc"
  },
  "publishConfig": { "access": "public" },
  "files": ["swc.json"],
  "exports": {
    "./swc.json": "./swc.json"
  }
}
```

- [ ] **Step 2: Create `packages/swc/swc.json` (verbatim from enkaku `swc.json`)**

```json
{
  "jsc": {
    "parser": {
      "syntax": "typescript"
    },
    "target": "esnext",
    "transform": {
      "optimizer": {
        "globals": {
          "vars": {
            "process.env.NODE_ENV": "production"
          }
        }
      },
      "react": {
        "runtime": "automatic"
      }
    }
  }
}
```

- [ ] **Step 3: Create `packages/swc/README.md`**

```markdown
# @kigu/swc

Shared SWC build config. Reference it from a package build script:

```json
{
  "scripts": {
    "build:js": "swc src -d ./lib --config-file ../../node_modules/@kigu/swc/swc.json --strip-leading-paths"
  }
}
```
```

- [ ] **Step 4: Verify SWC accepts the config on a sample file**

Run:
```bash
cd /tmp && rm -rf kigu-swc-check && mkdir kigu-swc-check && cd kigu-swc-check && \
echo 'export const x: number = 1' > a.ts && \
npx -y @swc/cli@^0.8.1 a.ts --config-file /Users/paul/dev/yulsi/kigu/packages/swc/swc.json
```
Expected: prints compiled JS (`export const x = 1;`) to stdout, no config error.

- [ ] **Step 5: Commit**

```bash
cd /Users/paul/dev/yulsi/kigu
git add packages/swc
git commit -m "feat: add @kigu/swc"
```

---

### Task 5: `@kigu/dev` toolchain preset

**Files:**
- Create: `packages/dev/package.json`, `packages/dev/README.md`

**Interfaces:**
- Consumes: `@kigu/tsconfig`, `@kigu/biome`, `@kigu/swc` (peer-listed so installing `@kigu/dev` pulls the config packages too).
- Produces: `@kigu/dev` — a single devDependency that installs the shared toolchain + config packages.

- [ ] **Step 1: Create `packages/dev/package.json` (versions pinned from the enkaku catalog; config packages referenced by workspace protocol so they version together in-repo and publish as `^0.1.0`)**

```json
{
  "name": "@kigu/dev",
  "version": "0.1.0",
  "license": "MIT",
  "description": "Shared dev toolchain preset for the Yulsi stack",
  "repository": {
    "type": "git",
    "url": "https://github.com/TairuFramework/kigu",
    "directory": "packages/dev"
  },
  "publishConfig": { "access": "public" },
  "files": ["README.md"],
  "dependencies": {
    "@kigu/biome": "workspace:^",
    "@kigu/swc": "workspace:^",
    "@kigu/tsconfig": "workspace:^",
    "@biomejs/biome": "^2.5.0",
    "@swc/cli": "^0.8.1",
    "@swc/core": "^1.15.41",
    "@types/node": "^26.0.0",
    "@vitest/ui": "^4.1.9",
    "del-cli": "^7.0.0",
    "tsx": "^4.22.4",
    "turbo": "^2.9.18",
    "typescript": "^6.0.3",
    "vitest": "^4.1.9"
  }
}
```

- [ ] **Step 2: Create `packages/dev/README.md`**

```markdown
# @kigu/dev

One devDependency that brings the whole Yulsi toolchain (Biome, SWC, TypeScript,
Turbo, Vitest, tsx, del-cli) plus the `@kigu` config packages.

```jsonc
// a repo's package.json
{
  "devDependencies": { "@kigu/dev": "^0.1.0" }
}
```

Then extend the configs: `@kigu/tsconfig/base.json`, `["@kigu/biome"]`,
`@kigu/swc/swc.json`.
```

- [ ] **Step 3: Verify it installs cleanly in-repo**

Run: `cd /Users/paul/dev/yulsi/kigu && pnpm install`
Expected: resolves `@kigu/dev` with workspace links to the three config packages and the pinned external toolchain; no peer/resolution errors.

- [ ] **Step 4: Commit**

```bash
git add packages/dev pnpm-lock.yaml
git commit -m "feat: add @kigu/dev toolchain preset"
```

---

### Task 6: Plugin + marketplace scaffold

**Files:**
- Create: `.claude-plugin/marketplace.json`, `plugins/kigu/.claude-plugin/plugin.json`

**Interfaces:**
- Produces: a `yulsi` marketplace exposing one plugin `kigu`; subsequent tasks add skills under `plugins/kigu/skills/`.

- [ ] **Step 1: Create `plugins/kigu/.claude-plugin/plugin.json`**

```json
{
  "name": "kigu",
  "version": "0.1.0",
  "description": "Shared Yulsi development plugin: workflow skills, conventions, and discovery.",
  "author": { "name": "Paul Le Cam" }
}
```

- [ ] **Step 2: Create `.claude-plugin/marketplace.json`**

```json
{
  "name": "yulsi",
  "owner": { "name": "Paul Le Cam" },
  "plugins": [
    {
      "name": "kigu",
      "source": "./plugins/kigu",
      "description": "Shared Yulsi development plugin: workflow skills, conventions, and discovery."
    }
  ]
}
```

- [ ] **Step 3: Verify JSON validity**

Run: `cd /Users/paul/dev/yulsi/kigu && node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8')); JSON.parse(require('fs').readFileSync('plugins/kigu/.claude-plugin/plugin.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin plugins/kigu/.claude-plugin
git commit -m "feat: scaffold kigu plugin + yulsi marketplace"
```

---

### Task 7: Migrate workflow skills from `agents/`

**Files:**
- Create: `plugins/kigu/skills/{archive,complete,dev-loop,project-loop}/SKILL.md` (copied verbatim from `/Users/paul/dev/yulsi/agents/skills/`)

**Interfaces:**
- Consumes: existing skill files in the `agents/` repo.
- Produces: the four shared workflow skills inside the kigu plugin.

- [ ] **Step 1: Copy the four skills verbatim**

```bash
cd /Users/paul/dev/yulsi/kigu
mkdir -p plugins/kigu/skills
for s in archive complete dev-loop project-loop; do
  mkdir -p "plugins/kigu/skills/$s"
  cp "/Users/paul/dev/yulsi/agents/skills/$s/SKILL.md" "plugins/kigu/skills/$s/SKILL.md"
done
```

- [ ] **Step 2: Verify each skill has YAML frontmatter with `name` and `description`**

Run:
```bash
cd /Users/paul/dev/yulsi/kigu
for s in archive complete dev-loop project-loop; do echo "== $s =="; head -5 "plugins/kigu/skills/$s/SKILL.md"; done
```
Expected: each prints a leading `---` frontmatter block containing `name:` and `description:` lines.

- [ ] **Step 3: Commit**

```bash
git add plugins/kigu/skills
git commit -m "feat: migrate workflow skills (dev-loop, project-loop, complete, archive)"
```

---

### Task 8: Conventions skill (source of truth)

**Files:**
- Create: `plugins/kigu/skills/conventions/SKILL.md`

**Interfaces:**
- Produces: the `conventions` skill — replaces manual `SHARED.md` → `docs/agents/conventions.md` propagation. Its body is the canonical conventions; root docs derive from it (Task 11).

- [ ] **Step 1: Create the skill file with frontmatter, then append the canonical conventions body**

```bash
cd /Users/paul/dev/yulsi/kigu
mkdir -p plugins/kigu/skills/conventions
cat > plugins/kigu/skills/conventions/SKILL.md <<'EOF'
---
name: conventions
description: Use when writing or editing code in any Yulsi repo - canonical TypeScript, formatting, build, testing, planning, and agent-conduct conventions shared across the stack.
---

EOF
# Append the canonical conventions (sections 1-9) verbatim from the agents repo,
# skipping its top-of-file H1 + intro paragraph (first 5 lines).
tail -n +6 /Users/paul/dev/yulsi/agents/SHARED.md >> plugins/kigu/skills/conventions/SKILL.md
```

- [ ] **Step 2: Verify the skill contains both frontmatter and the conventions content**

Run:
```bash
cd /Users/paul/dev/yulsi/kigu
head -4 plugins/kigu/skills/conventions/SKILL.md
grep -c 'interface' plugins/kigu/skills/conventions/SKILL.md
```
Expected: frontmatter block at top (`---`, `name: conventions`, `description:`, `---`); grep count ≥ 1 (the "use `type` instead of `interface`" rule is present).

- [ ] **Step 3: Commit**

```bash
git add plugins/kigu/skills/conventions
git commit -m "feat: add conventions skill (canonical, from SHARED.md)"
```

---

### Task 9: Enkaku package-preference skill

**Files:**
- Create: `plugins/kigu/skills/enkaku-packages/SKILL.md`

**Interfaces:**
- Produces: the `enkaku-packages` skill — ported from `agents/ENKAKU.md`, telling agents which stack packages to prefer over third-party libs. Carries a note that package names are pre-split and will be remapped per `docs/repo-split-design.md`.

- [ ] **Step 1: Create the skill with frontmatter + a rename note, then append the reference body**

```bash
cd /Users/paul/dev/yulsi/kigu
mkdir -p plugins/kigu/skills/enkaku-packages
cat > plugins/kigu/skills/enkaku-packages/SKILL.md <<'EOF'
---
name: enkaku-packages
description: Use when building features in any Yulsi app (sakui, kubun, mokei, tejika) - which Yulsi stack packages to prefer over third-party alternatives, with usage notes.
---

> **Note:** Package names below reflect the pre-split layout. After the repo
> split, these scopes change per `docs/repo-split-design.md` — e.g.
> `@enkaku/schema` → `@sozai/schema`, `@enkaku/token` → `@kokuin/token`,
> `@enkaku/hd-keystore` → `@kokuin/deterministic`. Update this skill when the
> split lands.

EOF
# Append the package-preference reference verbatim, skipping its H1 (first 2 lines).
tail -n +3 /Users/paul/dev/yulsi/agents/ENKAKU.md >> plugins/kigu/skills/enkaku-packages/SKILL.md
```

- [ ] **Step 2: Verify**

Run:
```bash
cd /Users/paul/dev/yulsi/kigu
head -4 plugins/kigu/skills/enkaku-packages/SKILL.md
grep -c 'Preference Table' plugins/kigu/skills/enkaku-packages/SKILL.md
```
Expected: frontmatter at top; grep count = 1.

- [ ] **Step 3: Commit**

```bash
git add plugins/kigu/skills/enkaku-packages
git commit -m "feat: add enkaku-packages preference skill (from ENKAKU.md)"
```

---

### Task 10: Discover template skill

**Files:**
- Create: `plugins/kigu/skills/discover-template/SKILL.md`

**Interfaces:**
- Produces: `discover-template` — a fill-in template each runtime repo instantiates as its own local `discover` skill (listing that repo's domains). No prior discover skill exists; this is authored fresh.

- [ ] **Step 1: Create the template skill**

```bash
cd /Users/paul/dev/yulsi/kigu
mkdir -p plugins/kigu/skills/discover-template
cat > plugins/kigu/skills/discover-template/SKILL.md <<'EOF'
---
name: discover-template
description: Use when setting up a new Yulsi repo's local discover skill - a template for progressive capability discovery that each repo instantiates with its own domains.
---

# Discover template

Copy this into a runtime repo's local plugin as `skills/discover/SKILL.md` and
replace every `{{...}}` slot. The instantiated skill is the entry point agents
use to explore that repo's capabilities.

## Frontmatter to use in the instantiated skill

```yaml
---
name: discover
description: Use when exploring {{REPO_NAME}} capabilities - progressive discovery of this repo's domain skills.
---
```

## Body template

```markdown
# {{REPO_NAME}} discovery

{{ONE_LINE_REPO_PURPOSE}}

## Domains

Load the domain skill matching your task:

{{#each DOMAINS}}
- `/{{REPO_SLUG}}:{{this.slug}}` — {{this.summary}}
{{/each}}

## Conventions

This repo follows the shared Yulsi conventions — see the `conventions` skill
(from the `kigu` plugin). Repo-specific deltas, if any, are listed below.

{{REPO_SPECIFIC_NOTES}}
```

## Instantiation checklist

- [ ] Replace `{{REPO_NAME}}`, `{{REPO_SLUG}}`, `{{ONE_LINE_REPO_PURPOSE}}`.
- [ ] List one `DOMAINS` entry per domain skill the repo ships.
- [ ] Fill or remove `{{REPO_SPECIFIC_NOTES}}`.
- [ ] Place the result at `plugins/<repo>/skills/discover/SKILL.md` and add the
      plugin to the repo's marketplace reference.
EOF
```

- [ ] **Step 2: Verify**

Run: `cd /Users/paul/dev/yulsi/kigu && head -4 plugins/kigu/skills/discover-template/SKILL.md && grep -c '{{REPO_NAME}}' plugins/kigu/skills/discover-template/SKILL.md`
Expected: frontmatter at top; grep count ≥ 1.

- [ ] **Step 3: Commit**

```bash
git add plugins/kigu/skills/discover-template
git commit -m "feat: add discover-template skill"
```

---

### Task 11: Root context (AGENTS.md / CLAUDE.md)

**Files:**
- Create: `AGENTS.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: the conventions skill (Task 8) as the source of truth.
- Produces: root agent context that describes the repo and points at the plugin/skills instead of duplicating conventions.

- [ ] **Step 1: Create `AGENTS.md`**

```markdown
# kigu

> **For AI agents:** Tooling hub for the Yulsi stack. No runtime code is imported from here by apps.

## What this repo is

Two outputs, one repo:

1. **npm config packages** (`packages/*`): `@kigu/tsconfig`, `@kigu/biome`, `@kigu/swc`, and `@kigu/dev` (toolchain preset). Other repos extend these.
2. **Claude Code plugin marketplace** (`.claude-plugin/marketplace.json` + `plugins/kigu/`): shared workflow skills (`dev-loop`, `project-loop`, `complete`, `archive`), the canonical `conventions` skill, `enkaku-packages`, and `discover-template`.

## Conventions

The canonical coding conventions live in the `conventions` skill
(`plugins/kigu/skills/conventions/SKILL.md`) — the single source of truth that
replaces the old manually-propagated `SHARED.md`. Follow it for any code authored
here or in consuming repos.

## How consuming repos use kigu

- Add `@kigu/dev` as a devDependency; extend `@kigu/tsconfig/base.json`, `["@kigu/biome"]`, and `@kigu/swc/swc.json`.
- Reference the `yulsi` marketplace and install the `kigu` plugin; add a local domain plugin per repo (instantiate `discover-template`).

## Guardrails

- pnpm only (never npm/npx).
- `type` not `interface`; `Array<T>` not `T[]`; never `any`; capital `ID`/`HTTP`/`JWT`/`DID`; ES `#fields`, never `private`/`readonly`.
- Do not edit generated files.

See `docs/repo-split-design.md` for the broader monorepo-split architecture.
```

- [ ] **Step 2: Create `CLAUDE.md`**

```markdown
@AGENTS.md
```

- [ ] **Step 3: Verify**

Run: `cd /Users/paul/dev/yulsi/kigu && test -f AGENTS.md && head -1 CLAUDE.md`
Expected: prints `@AGENTS.md`.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: add root agent context"
```

---

### Task 12: Consumer smoke test + final verification

**Files:**
- Create: `tests/consumer-fixture/` (temporary fixture proving the config packages extend correctly end-to-end), then remove it.

**Interfaces:**
- Consumes: `@kigu/tsconfig`, `@kigu/biome`, `@kigu/swc` as a real downstream package would.

- [ ] **Step 1: Build a throwaway consumer fixture that extends all three configs**

```bash
cd /tmp && rm -rf kigu-consumer && mkdir kigu-consumer && cd kigu-consumer
cat > tsconfig.json <<'EOF'
{
  "extends": "/Users/paul/dev/yulsi/kigu/packages/tsconfig/base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./lib", "noEmit": true },
  "include": ["./src/**/*"]
}
EOF
cat > biome.json <<'EOF'
{
  "$schema": "https://biomejs.dev/schemas/2.5.0/schema.json",
  "extends": ["/Users/paul/dev/yulsi/kigu/packages/biome/biome.json"]
}
EOF
mkdir src && echo 'export const greeting: string = "hi"' > src/index.ts
```

- [ ] **Step 2: Verify type-check through the extended tsconfig**

Run: `cd /tmp/kigu-consumer && npx -y typescript@^6.0.3 tsc -p tsconfig.json`
Expected: exits 0 (the strict es2025 config type-checks the sample file cleanly).

- [ ] **Step 3: Verify Biome runs through the extended config**

Run: `cd /tmp/kigu-consumer && npx -y @biomejs/biome@^2.5.0 check src/index.ts`
Expected: Biome runs using the extended formatter/linter rules (reports clean or fixable findings) — no config-resolution error.

- [ ] **Step 4: Verify SWC compiles through the shared config**

Run: `cd /tmp/kigu-consumer && npx -y @swc/cli@^0.8.1 src/index.ts --config-file /Users/paul/dev/yulsi/kigu/packages/swc/swc.json`
Expected: prints compiled JS, no error.

- [ ] **Step 5: Clean up the fixture**

Run: `rm -rf /tmp/kigu-consumer /tmp/kigu-tsc-check /tmp/kigu-swc-check`
Expected: no output, fixtures removed (nothing committed to the repo).

- [ ] **Step 6: Final repo verification**

Run:
```bash
cd /Users/paul/dev/yulsi/kigu
pnpm install && pnpm run lint && git status --short
```
Expected: install clean; lint passes; `git status` shows a clean tree (all work committed).

---

## Out of scope (downstream plans / follow-ups)

- **Base agents** (e.g. `cavecrew`) in `plugins/kigu/agents/`: no source content exists yet; populate when shared agents are defined.
- **`enkaku-packages` rename pass:** update package names to the post-split scopes (`@sozai/*`, `@kokuin/*`, `@kumiai/*`) when the actual extractions land.
- **Extracting `@sozai` / `@kokuin` / `@kumiai` and trimming `@enkaku` to 0.18.0:** separate plans driven by the rename map in `docs/repo-split-design.md`.
- **Consumer migration** (kubun/mokei adopting `@kigu/dev` + marketplace): after the runtime repos publish.
- **Publishing** the `@kigu/*` packages to npm and pushing the repo: do when the user approves a release.
