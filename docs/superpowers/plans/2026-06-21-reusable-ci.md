# Reusable GitHub CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `kigu` host a shared composite action + reusable workflows that the four runtime repos consume by git ref, plus a self-CI workflow that validates them.

**Architecture:** A composite action at repo root `setup/` (short ref `TairuFramework/kigu/setup@main`) does pnpm + node + install + build. Five reusable workflows under `.github/workflows/` (`build-test` + four `e2e-*`) use `on: workflow_call` and reference `./setup` internally — local actions in a reusable workflow resolve against kigu's repo while `actions/checkout` grabs the caller's code. A `ci.yml` validates everything with actionlint and biome.

**Tech Stack:** GitHub Actions (composite actions, reusable workflows), pnpm, biome, actionlint.

## Global Constraints

- pnpm only — never npm/npx (use `pnpm`, `pnpm exec`, `pnpm dlx`).
- Composite action lives at repo root `setup/action.yml` (NOT under `.github/`).
- Reusable workflows MUST live under `.github/workflows/` (GitHub requirement).
- Consumers pin `@main`; no version tags for CI assets.
- Pinned action versions (copy verbatim, match enkaku source): `actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v4`, `actions/upload-artifact@v7` (web + ios) / `@v4` (desktop + android — kept as-is from source).
- Default node version `'24'`; build-test matrix default `'[24, 26]'`.
- Every workflow sets `env: CI: true` and `DO_NOT_TRACK: 1`; android/ios additionally set `MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: true` and `MAESTRO_CLI_NO_ANALYTICS: true`.
- Source of truth for step bodies: `../enkaku/.github`. Reproduce verbatim except where an input replaces a hardcoded value. Do NOT "fix" unrelated inconsistencies.

## Prerequisite (one-time, local)

Install actionlint for local validation (the plan's verification gate):

```bash
brew install actionlint    # or: bash <(curl -fsSL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash)
actionlint -version
```

actionlint reads local composite actions, so running it on a workflow that uses `./setup` also validates the action's inputs.

---

### Task 1: Composite action `setup/action.yml`

**Files:**
- Create: `setup/action.yml`

**Interfaces:**
- Produces: a composite action with inputs `node-version` (string, default `'24'`) and `build` (string, default `'true'`). Referenced internally by workflows as `uses: ./setup` and by consumers as `uses: TairuFramework/kigu/setup@main`.

- [ ] **Step 1: Create the action file**

```yaml
# setup/action.yml
name: Setup
description: Shared environment setup (pnpm + node + install + build)
inputs:
  node-version:
    description: 'Node version to use'
    required: false
    default: '24'
  build:
    description: 'Whether to run pnpm run build'
    required: false
    default: 'true'

runs:
  using: 'composite'
  steps:
    - name: Install pnpm
      uses: pnpm/action-setup@v4
      with:
        run_install: false

    - name: Setup node
      uses: actions/setup-node@v6
      with:
        node-version: ${{ inputs.node-version }}
        cache: 'pnpm'

    - name: Install dependencies
      shell: bash
      run: pnpm install --frozen-lockfile

    - name: Build packages
      if: ${{ inputs.build == 'true' }}
      shell: bash
      run: pnpm run build
```

- [ ] **Step 2: Validate YAML syntax**

Run: `pnpm dlx yaml-lint setup/action.yml`
Expected: `✔ YAML Lint successful.` (no syntax errors). It is further validated semantically in Task 2 when actionlint checks `uses: ./setup`.

- [ ] **Step 3: Commit**

```bash
git add setup/action.yml
git commit -m "feat: add shared setup composite action"
```

---

### Task 2: Reusable workflow `build-test.yml`

**Files:**
- Create: `.github/workflows/build-test.yml`

**Interfaces:**
- Consumes: `./setup` (Task 1) with input `node-version`.
- Produces: reusable workflow with inputs `node-versions` (string JSON array, default `'[24, 26]'`), `integration-tests-dir` (string, default `''`), `ts-readiness-check` (boolean, default `true`). Consumed as `uses: TairuFramework/kigu/.github/workflows/build-test.yml@main`.

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/build-test.yml
name: Build and test
on:
  workflow_call:
    inputs:
      node-versions:
        description: 'JSON array of Node versions to test'
        type: string
        required: false
        default: '[24, 26]'
      integration-tests-dir:
        description: 'Working directory for integration tests (empty to skip)'
        type: string
        required: false
        default: ''
      ts-readiness-check:
        description: 'Run the TS 7 stableTypeOrdering readiness check'
        type: boolean
        required: false
        default: true

env:
  CI: true
  DO_NOT_TRACK: 1

jobs:
  build:
    name: on Node ${{ matrix.node }}
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: ${{ fromJSON(inputs.node-versions) }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Setup environment
        uses: ./setup
        with:
          node-version: ${{ matrix.node }}

      - name: Lint
        run: pnpm run lint

      - name: Unit tests
        run: pnpm run test

      - name: Integration tests
        if: ${{ inputs.integration-tests-dir != '' }}
        working-directory: ${{ inputs.integration-tests-dir }}
        run: pnpm run test

      - name: TS 7 readiness check (stableTypeOrdering)
        if: ${{ inputs.ts-readiness-check }}
        run: pnpm -r exec tsc --noEmit --skipLibCheck --stableTypeOrdering
        continue-on-error: true
```

- [ ] **Step 2: Validate with actionlint**

Run: `actionlint .github/workflows/build-test.yml`
Expected: no output, exit 0. (Also confirms `./setup` resolves and its `node-version` input is valid — validates Task 1.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-test.yml
git commit -m "feat: add reusable build-test workflow"
```

---

### Task 3: Reusable workflow `e2e-web.yml`

**Files:**
- Create: `.github/workflows/e2e-web.yml`

**Interfaces:**
- Consumes: `./setup` with `node-version`.
- Produces: reusable workflow, inputs `working-directory` (string, default `tests/e2e-web`), `node-version` (string, default `'24'`).

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/e2e-web.yml
name: Web E2E
on:
  workflow_call:
    inputs:
      working-directory:
        description: 'Directory of the web e2e test app'
        type: string
        required: false
        default: tests/e2e-web
      node-version:
        type: string
        required: false
        default: '24'

env:
  CI: true
  DO_NOT_TRACK: 1

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Setup environment
        uses: ./setup
        with:
          node-version: ${{ inputs.node-version }}

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps

      - name: Build app
        working-directory: ${{ inputs.working-directory }}
        run: pnpm run build

      - name: Run Playwright tests
        working-directory: ${{ inputs.working-directory }}
        run: pnpm run test

      - uses: actions/upload-artifact@v7
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: ${{ inputs.working-directory }}/playwright-report/
          retention-days: 30
```

- [ ] **Step 2: Validate with actionlint**

Run: `actionlint .github/workflows/e2e-web.yml`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e-web.yml
git commit -m "feat: add reusable web e2e workflow"
```

---

### Task 4: Reusable workflow `e2e-desktop.yml`

**Files:**
- Create: `.github/workflows/e2e-desktop.yml`

**Interfaces:**
- Consumes: `./setup` with `node-version`.
- Produces: reusable workflow, inputs `working-directory` (string, default `tests/e2e-electron`), `os` (string JSON array, default `'["macos-latest", "windows-latest"]'`), `node-version` (string, default `'24'`).

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/e2e-desktop.yml
name: Desktop E2E
on:
  workflow_call:
    inputs:
      working-directory:
        description: 'Directory of the desktop e2e test app'
        type: string
        required: false
        default: tests/e2e-electron
      os:
        description: 'JSON array of runner OSes'
        type: string
        required: false
        default: '["macos-latest", "windows-latest"]'
      node-version:
        type: string
        required: false
        default: '24'

env:
  CI: true
  DO_NOT_TRACK: 1

jobs:
  test:
    name: on ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: ${{ fromJSON(inputs.os) }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Setup environment
        uses: ./setup
        with:
          node-version: ${{ inputs.node-version }}

      - name: Package app
        working-directory: ${{ inputs.working-directory }}
        run: pnpm run package

      - name: Run tests
        working-directory: ${{ inputs.working-directory }}
        run: pnpm run test

      - name: Upload Playwright Report
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report-${{ matrix.os }}
          path: ${{ inputs.working-directory }}/playwright-report/

      - name: Upload Test Results
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: test-results-${{ matrix.os }}
          path: ${{ inputs.working-directory }}/test-results/

      - name: Upload Screenshots
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: screenshots-${{ matrix.os }}
          path: ${{ inputs.working-directory }}/screenshots/
```

- [ ] **Step 2: Validate with actionlint**

Run: `actionlint .github/workflows/e2e-desktop.yml`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e-desktop.yml
git commit -m "feat: add reusable desktop e2e workflow"
```

---

### Task 5: Reusable workflow `e2e-android.yml`

**Files:**
- Create: `.github/workflows/e2e-android.yml`

**Interfaces:**
- Consumes: `./setup` with `node-version`.
- Produces: reusable workflow, inputs `working-directory` (string, default `tests/e2e-expo`), `node-version` (string, default `'24'`).

- [ ] **Step 1: Create the workflow file** (KVM/emulator scripts copied verbatim from enkaku; only build/test working-dirs are parameterized)

```yaml
# .github/workflows/e2e-android.yml
name: Android E2E
on:
  workflow_call:
    inputs:
      working-directory:
        description: 'Directory of the Expo e2e test app'
        type: string
        required: false
        default: tests/e2e-expo
      node-version:
        type: string
        required: false
        default: '24'

env:
  CI: true
  DO_NOT_TRACK: 1
  MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: true
  MAESTRO_CLI_NO_ANALYTICS: true

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Enable KVM
        run: |
          # Check if KVM is available
          if [ -e /dev/kvm ]; then
            echo "KVM is available"
            # Create directory if it doesn't exist
            sudo mkdir -p /etc/udev/rules.d

            # Set up KVM permissions
            echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
            sudo udevadm control --reload-rules
            sudo udevadm trigger --name-match=kvm

            # Add user to KVM group
            sudo usermod -a -G kvm $USER
          else
            echo "KVM not available, continuing without hardware acceleration"
          fi

      - name: Create emulator
        run: |
          export ANDROID_AVD_HOME=$HOME/.config/.android/avd
          export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin

          # Install system image
          echo y | sdkmanager "system-images;android-36;google_apis;x86_64"

          # Create emulator
          echo no | avdmanager create avd --force -n "test-emulator" --abi 'google_apis/x86_64' --package 'system-images;android-36;google_apis;x86_64'

          # Start emulator
          echo "Starting emulator..."
          $ANDROID_HOME/emulator/emulator \
            -avd test-emulator \
            -no-window \
            -no-audio \
            -no-boot-anim \
            -gpu swiftshader_indirect \
            -memory 4096 \
            -no-snapshot-save &

          EMULATOR_PID=$!
          echo "EMULATOR_PID=$EMULATOR_PID" >> $GITHUB_ENV
          echo "Started emulator with PID: $EMULATOR_PID"

      - name: Wait for emulator to boot
        run: |
          export PATH=$PATH:$ANDROID_HOME/platform-tools

          echo "Waiting for emulator boot..."
          # Wait for device to be detected by ADB
          timeout=300  # 5 minutes
          counter=0

          while [ $counter -lt $timeout ]; do
            if adb devices | grep -q "emulator.*device"; then
              echo "✅ Emulator detected by ADB"
              break
            fi

            echo "Waiting for emulator... ($counter/$timeout seconds)"
            sleep 5
            counter=$((counter + 5))
          done

          if [ $counter -ge $timeout ]; then
            echo "❌ Emulator boot timeout"
            adb devices
            exit 1
          fi

          # Wait for system to be fully ready
          echo "Waiting for system boot..."
          adb wait-for-device

          # Wait for boot completion
          timeout 300 bash -c '
            while [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\''\r'\'')" != "1" ]; do
              echo "Waiting for boot completion..."
              sleep 5
            done
          '

          # Disable animations for testing
          adb shell settings put global window_animation_scale 0
          adb shell settings put global transition_animation_scale 0
          adb shell settings put global animator_duration_scale 0

          echo "✅ Emulator fully ready"

          # Verify emulator info
          echo "Emulator info:"
          adb devices -l
          adb shell getprop ro.build.version.release
          adb shell getprop ro.product.cpu.abi

      - name: Verify ADB connection
        run: |
          export PATH=$PATH:$ANDROID_HOME/platform-tools
          echo "ADB status:"
          adb devices -l

          # Test ADB connection
          adb shell echo "ADB connection test" || {
            echo "❌ ADB connection failed"
            exit 1
          }
          echo "✅ ADB connection verified"

      - name: Setup environment
        uses: ./setup
        with:
          node-version: ${{ inputs.node-version }}

      - name: Install Maestro
        shell: bash
        run: |
          curl -Ls "https://get.maestro.mobile.dev" | bash
          echo "$HOME/.maestro/bin" >> $GITHUB_PATH

      - name: Build Android app
        working-directory: ${{ inputs.working-directory }}
        run: pnpm run android:release

      - name: Run Maestro tests
        working-directory: ${{ inputs.working-directory }}
        run: pnpm run test

      - name: Upload screenshots on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: maestro-screenshots
          path: "*.png"
```

- [ ] **Step 2: Validate with actionlint**

Run: `actionlint .github/workflows/e2e-android.yml`
Expected: no output, exit 0. (actionlint may emit shellcheck info on the embedded bash; if it reports errors, fix only genuine errors — the scripts are copied verbatim and were green in enkaku, so treat pre-existing shellcheck style warnings as acceptable. If actionlint is configured strict, add `# shellcheck disable` only for the specific verbatim lines it flags.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e-android.yml
git commit -m "feat: add reusable android e2e workflow"
```

---

### Task 6: Reusable workflow `e2e-ios.yml`

**Files:**
- Create: `.github/workflows/e2e-ios.yml`

**Interfaces:**
- Consumes: `./setup` with `node-version`.
- Produces: reusable workflow, inputs `working-directory` (string, default `tests/e2e-expo`), `runs-on` (string, default `macos-26`), `node-version` (string, default `'24'`).

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/e2e-ios.yml
name: iOS E2E
on:
  workflow_call:
    inputs:
      working-directory:
        description: 'Directory of the Expo e2e test app'
        type: string
        required: false
        default: tests/e2e-expo
      runs-on:
        description: 'Runner label for the macOS job'
        type: string
        required: false
        default: macos-26
      node-version:
        type: string
        required: false
        default: '24'

env:
  CI: true
  DO_NOT_TRACK: 1
  MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: true
  MAESTRO_CLI_NO_ANALYTICS: true

jobs:
  test:
    runs-on: ${{ inputs.runs-on }}
    timeout-minutes: 30
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Setup environment
        uses: ./setup
        with:
          node-version: ${{ inputs.node-version }}

      - name: Install Maestro
        shell: bash
        run: |
          curl -Ls "https://get.maestro.mobile.dev" | bash
          echo "$HOME/.maestro/bin" >> $GITHUB_PATH

      - name: Build iOS app
        working-directory: ${{ inputs.working-directory }}
        run: pnpm run ios:release

      - name: Verify app is running
        run: |
          # Check if the iOS Simulator is running the app
          xcrun simctl list devices booted

          # Take a screenshot to verify
          MAESTRO_CLI_NO_ANALYTICS=true MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true maestro screenshot before-test.png || echo "Screenshot failed, continuing..."

      - name: Run Maestro tests
        working-directory: ${{ inputs.working-directory }}
        run: pnpm run test

      - name: Upload screenshots on failure
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: maestro-screenshots
          path: "*.png"
```

- [ ] **Step 2: Validate with actionlint**

Run: `actionlint .github/workflows/e2e-ios.yml`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e-ios.yml
git commit -m "feat: add reusable ios e2e workflow"
```

---

### Task 7: kigu self-CI `ci.yml`

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `./setup` with `build: 'false'` (kigu has no build script — install only, then lint).

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

env:
  CI: true
  DO_NOT_TRACK: 1

jobs:
  actionlint:
    name: Lint workflows
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Run actionlint
        run: |
          bash <(curl -fsSL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash)
          ./actionlint -color

  lint:
    name: Biome
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Setup environment
        uses: ./setup
        with:
          build: 'false'

      - name: Lint
        run: pnpm exec biome ci ./packages ./plugins
```

- [ ] **Step 2: Validate with actionlint**

Run: `actionlint .github/workflows/ci.yml`
Expected: no output, exit 0. (Confirms the `./setup` reference with the `build` input.)

- [ ] **Step 3: Validate the whole workflow directory**

Run: `actionlint`
Expected: no output, exit 0 — all six workflows pass together.

- [ ] **Step 4: Verify the lint command works locally**

Run: `pnpm install --frozen-lockfile && pnpm exec biome ci ./packages ./plugins`
Expected: biome reports `Checked N files` with no errors (exit 0). This is exactly what the CI `lint` job runs.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat: add kigu self-CI (actionlint + biome)"
```

---

### Task 8: Documentation

**Files:**
- Create: `.github/README.md`
- Modify: `AGENTS.md:19-22` (the "How consuming repos use kigu" section)

- [ ] **Step 1: Create `.github/README.md`**

```markdown
# kigu CI — reusable workflows & action

Shared GitHub Actions CI for the stack's runtime repos. Consume by git ref, pinned to `@main`.

## Composite action: `setup`

`pnpm` + node + dependency cache + install (+ optional build). Lives at the repo root.

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
      node-versions: '[24, 26]'          # optional, JSON array
      integration-tests-dir: tests/integration  # optional, omit to skip
      ts-readiness-check: true           # optional, default true
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
      working-directory: tests/e2e-electron          # optional
      os: '["macos-latest", "windows-latest"]'       # optional, JSON array
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
```

- [ ] **Step 2: Add the CI bullet to `AGENTS.md`**

In `AGENTS.md`, under `## How consuming repos use kigu`, append a third bullet after the existing two:

```markdown
- Reference the CI: call `TairuFramework/kigu/.github/workflows/<name>@main` (reusable workflows) and `TairuFramework/kigu/setup@main` (the setup action in custom jobs). See `.github/README.md`.
```

- [ ] **Step 3: Verify the docs lint clean**

Run: `pnpm exec biome ci ./packages ./plugins`
Expected: exit 0 (biome doesn't touch markdown here, but confirms nothing broke). Manually confirm the README code-fence refs match the actual file paths (`setup/`, `.github/workflows/*.yml`).

- [ ] **Step 4: Commit**

```bash
git add .github/README.md AGENTS.md
git commit -m "docs: document reusable CI workflows and setup action"
```

---

## Notes on full end-to-end validation

actionlint + biome are static gates. The reusable workflows are only truly exercised when a consumer repo calls them (a live run resolves `./setup` against kigu and checks out the caller's code). That live validation is the follow-up enkaku migration (out of scope here, per the spec). The `ci.yml` `lint` job does give one real end-to-end run of the `setup` action against kigu itself on every push.
