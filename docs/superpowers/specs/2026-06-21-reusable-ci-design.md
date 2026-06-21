# Reusable GitHub CI for kigu — design

Status: approved design (brainstorm complete, 2026-06-21)
Scope: make `kigu` host shared, reusable GitHub Actions CI (a composite action +
reusable workflows) that the four runtime repos of the stack consume, sourced from
the existing `enkaku/.github`.

## Motivation

Per `docs/repo-split-design.md`, the stack splits into four runtime repos
(`@sozai`, `@kokuin`, `@enkaku`, `@kumiai`) plus `kigu` as the tooling hub. Today
every repo's CI is duplicated `enkaku/.github`. The same pattern already used for
`@kigu/dev` (centralize the toolchain so deps + configs stay in sync) applies to CI:
centralize the workflows so the four repos reference one source instead of copying
five YAML files each.

kigu is the natural host — it already is the hub for shared dev config and AI assets,
and (unlike a published npm package) GitHub reusable workflows/actions are consumed
directly by git ref from a repo.

Non-goal: external reuse outside the stack. These assets encode the stack's pnpm +
biome + Expo/Electron conventions and are not meant to be generic.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Mechanism | **Both** — a composite action *and* reusable workflows |
| 2 | Scope | `build-test` + the four `e2e` workflows (web/desktop/android/ios) |
| 3 | Parameterization | **Convention + toggles** — fixed script names, few high-value inputs |
| 4 | Pinning + self-CI | Consumers track `@main`; kigu self-validates with actionlint + biome lint |

## Architecture

```
kigu/
  setup/action.yml                 # composite action at repo ROOT (short ref)
  .github/
    README.md                      # usage docs + caller snippets
    workflows/                     # workflows MUST live here (GitHub requirement)
      build-test.yml               # reusable (on: workflow_call)
      e2e-web.yml                  # reusable
      e2e-desktop.yml              # reusable
      e2e-android.yml              # reusable
      e2e-ios.yml                  # reusable
      ci.yml                       # kigu's OWN CI (on: push/PR) — self-validation
```

The composite action lives at `setup/` (repo root, not under `.github/`) so consumers
reference it with the short `TairuFramework/kigu/setup@main`. Actions can live anywhere
in the repo; **reusable workflows cannot** — GitHub only recognizes them under
`.github/workflows/`, so they keep the full `.github/workflows/<file>.yml@ref` form.

### Resolution mechanism

This is the crux that makes a single hosted copy work for every consumer:

- Inside a kigu **reusable workflow**, `uses: ./setup`
  resolves against **kigu's** repository (the repo that contains the workflow file),
  not the caller — so the consumer always runs kigu's setup logic.
- `actions/checkout` inside the reusable workflow checks out the **caller's** code
  into the workspace (the run context is the caller's repository).
- Net effect: the reusable workflow runs kigu's pinned setup + steps over the
  consumer's source, with no path juggling on the consumer side.

### Two consumption modes

- **Standard job** → thin caller workflow in the consumer repo:
  `uses: TairuFramework/kigu/.github/workflows/build-test.yml@main`
- **Custom job** → consumer writes its own workflow and reuses just the setup step:
  `uses: TairuFramework/kigu/setup@main`

## Components

### 1. Composite action — `setup` (at repo root: `setup/action.yml`)

Lifted from `enkaku/.github/actions/setup-environment`, near-unchanged. Renamed `setup`
and placed at the repo root for the short `TairuFramework/kigu/setup@main` reference.

Inputs:

| input | default | purpose |
|-------|---------|---------|
| `node-version` | `'24'` | node version to install |
| `build` | `'true'` | toggle `pnpm run build` (jobs that lint without building set `'false'`) |

Steps:

1. `pnpm/action-setup@v4` (`run_install: false`)
2. `actions/setup-node@v6` (`node-version` from input, `cache: 'pnpm'`)
3. `pnpm install --frozen-lockfile`
4. `pnpm run build` — only when `inputs.build == 'true'`

### 2. Reusable workflow — `build-test.yml`

`on: workflow_call`. Mirrors `enkaku/build-test.yml`, parameterized.

Inputs:

| input | type | default | effect |
|-------|------|---------|--------|
| `node-versions` | string | `'[24, 26]'` | JSON array → `fromJSON()` matrix |
| `integration-tests-dir` | string | `''` | when non-empty, run `pnpm run test` in that working-directory; skipped when empty |
| `ts-readiness-check` | boolean | `true` | toggle the `tsc --noEmit --skipLibCheck --stableTypeOrdering` step (`continue-on-error: true`) |

Job (`runs-on: ubuntu-latest`, `env: CI: true`, `DO_NOT_TRACK: 1`):

1. `actions/checkout@v6`
2. `uses: ./setup` with `node-version` from matrix
3. `pnpm run lint`
4. `pnpm run test`
5. integration tests in `integration-tests-dir` — only when set
6. TS readiness check — only when `ts-readiness-check`

### 3. Reusable e2e workflows

Four files, each `on: workflow_call`. Platform/runner setup stays baked in; only
paths/runner vary by input. Script names stay conventional.

| workflow | inputs (defaults) | baked-in steps |
|----------|-------------------|----------------|
| `e2e-web` | `working-directory` (`tests/e2e-web`), `node-version` (`24`) | checkout, setup, `playwright install --with-deps`, `pnpm run build`, `pnpm run test`, upload `playwright-report` |
| `e2e-desktop` | `working-directory` (`tests/e2e-electron`), `os` (`'["macos-latest","windows-latest"]'`), `node-version` | checkout, setup, `pnpm run package`, `pnpm run test`, upload report/results/screenshots on failure |
| `e2e-android` | `working-directory` (`tests/e2e-expo`), `node-version` (`24`) | KVM enable, emulator create + boot wait, setup, Maestro install, `pnpm run android:release`, `pnpm run test`, screenshots on failure |
| `e2e-ios` | `working-directory` (`tests/e2e-expo`), `runs-on` (`macos-26`), `node-version` | checkout, setup, Maestro install, `pnpm run ios:release`, verify booted, `pnpm run test`, screenshots on failure |

Shared `env` per workflow as in enkaku (`CI`, `DO_NOT_TRACK`, plus the
`MAESTRO_CLI_*` vars for android/ios).

### 4. kigu self-CI — `ci.yml`

`on: [push, pull_request]`. Two jobs:

- **actionlint** — runs `actionlint` over `.github/workflows/*` and the composite
  action. This is the real safety net: consumers track `@main`, so a broken
  reusable asset must be caught in kigu's own CI before it reaches them.
- **lint** — `pnpm install --frozen-lockfile` then `biome ci ./packages ./plugins`
  (the CI-mode, non-writing counterpart of the repo's `pnpm run lint`).

kigu does **not** dogfood `build-test`: it is a config/plugin hub with no root
`build` or `test` script, so calling its own `build-test` would fail at the test
step. actionlint validating the reusable assets directly is the honest fit.

## Documentation

- **`.github/README.md`** — one section per reusable asset: purpose, inputs table,
  copy-paste caller snippet pinned to `@main`.
- **`AGENTS.md`** — add a bullet under "How consuming repos use kigu":
  reference the CI via `TairuFramework/kigu/.github/workflows/<name>@main` (workflows)
  and `TairuFramework/kigu/setup@main` (custom jobs).

### Example callers (target for consumers)

`build-test` with an integration suite:

```yaml
name: Build and test
on: [push, pull_request]
jobs:
  build-test:
    uses: TairuFramework/kigu/.github/workflows/build-test.yml@main
    with:
      integration-tests-dir: tests/integration
```

Web e2e with defaults:

```yaml
name: Web E2E
on: [push, pull_request]
jobs:
  e2e:
    uses: TairuFramework/kigu/.github/workflows/e2e-web.yml@main
```

## Out of scope (follow-up)

- Rewriting `enkaku/.github` (and the other repos) to consume these assets. The
  caller examples above make that migration mechanical, but the deliverable here is
  kigu hosting the assets + self-CI + docs.
- A release/changesets publish workflow (considered, deferred — not in enkaku's
  current `.github`).
- Tagged versioning of the CI assets (`@v1`); consumers track `@main` for now.

## Success criteria

1. A consumer repo can run lint + unit (+ optional integration) + TS check via a
   ~5-line caller workflow referencing `build-test.yml@main`.
2. A consumer can run any of the four e2e suites via a thin caller, overriding only
   paths/runner when it diverges from the defaults.
3. A consumer can reuse just the setup step in a bespoke job via the composite
   action.
4. kigu's own `ci.yml` passes: actionlint validates all reusable assets and biome
   lints the repo.
