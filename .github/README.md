# kigu CI — reusable workflows & action

Shared GitHub Actions CI for the stack's runtime repos. Consume by git ref, pinned to `@main`.

## Composite action: `setup`

`pnpm` + node + dependency cache + install (+ optional build). Lives at the repo root, so the reference is short.

```yaml
- uses: TairuFramework/kigu/setup@main
  with:
    node-version: '24'   # optional, default '24'
    build: 'true'        # optional, default 'true'; set 'false' to skip pnpm run build
```

## Reusable workflows

Call from a thin workflow in the consumer repo.

### `build-test.yml` — lint + unit (+ optional integration) + TS readiness

```yaml
name: Build and test
on: [push, pull_request]
jobs:
  build-test:
    uses: TairuFramework/kigu/.github/workflows/build-test.yml@main
    with:
      node-versions: '[24, 26]'                  # optional, JSON array
      integration-tests-dir: tests/integration   # optional, omit to skip
      ts-readiness-check: true                   # optional, default true
```

### `e2e-web.yml`

```yaml
name: Web E2E
on: [push, pull_request]
jobs:
  e2e:
    uses: TairuFramework/kigu/.github/workflows/e2e-web.yml@main
    with:
      working-directory: tests/e2e-web   # optional
```

### `e2e-desktop.yml`

```yaml
jobs:
  e2e:
    uses: TairuFramework/kigu/.github/workflows/e2e-desktop.yml@main
    with:
      working-directory: tests/e2e-electron      # optional
      os: '["macos-latest", "windows-latest"]'   # optional, JSON array
```

### `e2e-android.yml` / `e2e-ios.yml`

```yaml
jobs:
  android:
    uses: TairuFramework/kigu/.github/workflows/e2e-android.yml@main
    with:
      working-directory: tests/e2e-expo  # optional
  ios:
    uses: TairuFramework/kigu/.github/workflows/e2e-ios.yml@main
    with:
      working-directory: tests/e2e-expo  # optional
      runs-on: macos-26                  # optional
```

## Conventions

Workflows assume conventional pnpm scripts: `lint`, `test`, `build`, and (e2e) `package`,
`android:release`, `ios:release`. Override only paths/runner via inputs.

Integration tests stay separate from unit tests: they live in their own directory (wired via
`integration-tests-dir`) and run only after the unit sweep passes in `build-test.yml`. Do not
fold them into a package's `test` script.

`ci.yml` is kigu's own CI (not reusable): it runs actionlint over these assets and lints the repo with biome.
