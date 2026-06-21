# Enkaku monorepo split — design

Status: approved design (brainstorm complete, 2026-06-20)
Scope: split the single `enkaku` monorepo into five repositories ahead of the v1.0 hardening.

## Motivation

The `enkaku` repo began with a focused scope — authenticated (JWT) RPC across multiple
transports, environment-agnostic — and accreted lower-level utilities (async, codecs,
generator, web streams), external-library wrappers (logtape, AJV, OpenTelemetry), and a
growing MLS messaging stack (group, hub primitives, broadcast, group-rpc). The result is a
kitchen-sink of layers at different altitudes.

This is not a problem in itself, but it obstructs the v1.0 hardening goal: many packages are
stable yet keep receiving minor version bumps purely to stay in lockstep with the rest of the
monorepo. Splitting lets the stable lower layers ossify while the fast-moving MLS stack evolves
on its own cadence.

### Goals

1. **Stop version churn** — stable packages should freeze, not bump to track unrelated changes.
2. **Scope clarity** — each repo has one clear altitude and purpose.
3. **Independent release cadence** — MLS moves fast, core/identity ossify.

Non-goal: external reuse outside the stack.

Key reframe: churn is caused by lockstep versioning, not by being one repo. The split is
justified by clarity + cadence; it *also* fixes churn as a side effect, because cross-repo deps
become published `^` ranges instead of `workspace:^`, killing the lockstep temptation at every
repo boundary.

## Architecture

Five repositories. Dependencies point strictly downward (left), no cycles. GitHub org:
`TairuFramework`. npm scopes as below.

```
@kigu (器具) ── tooling hub: npm config packages + Claude Code plugin marketplace
   │            + shared conventions + base agents + discover template
   │  each repo: extends @kigu config, references the marketplace, adds a local domain plugin
   ▼
@sozai  ←  @kokuin  ←  @enkaku  ←  @kumiai
 素材        刻印         遠隔         組合
 core       identity     RPC          MLS / group
```

| scope | meaning | role |
|-------|---------|------|
| `@kigu` | 器具 implement / tool | shared tooling, dev config, AI assets |
| `@sozai` | 素材 raw material | core utilities + external-library wrappers |
| `@kokuin` | 刻印 engraved seal | identity / auth / keys |
| `@enkaku` | 遠隔 remote | RPC (keeps existing scope and version line) |
| `@kumiai` | 組合 union / cooperative | MLS group messaging |

Naming constraint used throughout: Japanese word with a direct meaning matching the repo's
scope, available as an npm organization (verified via
`registry.npmjs.org/-/org/<name>/package` → 404 = free).

## Package layout

### @sozai (core)

Independent per-package versioning is mandatory here: `runtime-expo` tracks the Expo SDK and must
be able to major without dragging the frozen utilities.

| package | notes |
|---------|-------|
| async, codec, event, execution, flow, generator, log, otel, patch, result, runtime, schema, stream | stable fixed group |
| runtime-expo | independent — bound to Expo SDK |

`flow` and `execution` moved here from RPC: both have core-only dependencies and `flow` has zero
internal consumers (it is a graph orphan in RPC). `runtime-expo` (was `expo-runtime`) pairs with
`runtime`, opening a `runtime-<env>` pattern.

### @kokuin (identity)

| package | was | notes |
|---------|-----|-------|
| token | token | fixed group |
| capability | capability | fixed group |
| browser | browser-keystore | fixed group |
| node | node-keystore | fixed group |
| deterministic | hd-keystore | fixed group (HD derivation, noble-based, stable) |
| expo | expo-keystore | independent — Expo SDK |
| electron | electron-keystore | independent — Electron |
| ledger-device | ledger-identity | independent — Ledger hardware |

Keystores shortened to their environment (scope `@kokuin` already implies keys).
`ledger-identity` → `ledger-device` to mark the Ledger brand rather than a generic ledger.

### @enkaku (RPC) — bumps to 0.18.0 at the split

Keeps its scope and version line. The 0.18.0 bump signals the breaking reorg (moved packages
removed, internal deps rewired to `@sozai`/`@kokuin`). 1.0 comes later, at RPC-API freeze.

| package | was | notes |
|---------|-----|-------|
| protocol, transport, client, server, standalone | unchanged | RPC core (soft coupling group) |
| http-fetch | http-client-transport | client-side HTTP transport |
| http-serve | http-server-transport | server-side HTTP transport |
| socket | socket-transport | |
| node-streams | node-streams-transport | |
| message | message-transport | MessagePort |
| electron | electron-rpc | platform integration (pairs with react) |
| react | react | platform integration |

`-transport` dropped from the transports. The HTTP pair uses role-based names (`http-fetch` /
`http-serve`) to avoid the `http-client`/`client` and `http-server`/`server` homonym; the others
have no homonym and stay short. `electron-rpc` → `electron` to match the `react` platform-
integration pattern (it ships transport + serveProcess + renderer-client helpers, not a pure
transport).

### @kumiai (MLS / group)

Locked group while pre-1.0 (young, tightly coupled, all moving together).

| package | was | notes |
|---------|-----|-------|
| mls | group | E2EE identity + membership via MLS — the crypto core |
| broadcast | broadcast | generic fan-out; sole consumer is `rpc`, kept here |
| hub-protocol, hub-client, hub-server, hub-tunnel | unchanged | hub subsystem (prefix kept — real subsystem) |
| rpc | group-rpc | redundant `group-` prefix dropped |

## Full rename map (codemod spec)

```
# core → @sozai
@enkaku/async                  → @sozai/async
@enkaku/codec                  → @sozai/codec
@enkaku/event                  → @sozai/event
@enkaku/execution              → @sozai/execution
@enkaku/flow                   → @sozai/flow
@enkaku/generator              → @sozai/generator
@enkaku/log                    → @sozai/log
@enkaku/otel                   → @sozai/otel
@enkaku/patch                  → @sozai/patch
@enkaku/result                 → @sozai/result
@enkaku/runtime                → @sozai/runtime
@enkaku/schema                 → @sozai/schema
@enkaku/stream                 → @sozai/stream
@enkaku/expo-runtime           → @sozai/runtime-expo

# identity → @kokuin
@enkaku/token                  → @kokuin/token
@enkaku/capability             → @kokuin/capability
@enkaku/browser-keystore       → @kokuin/browser
@enkaku/node-keystore          → @kokuin/node
@enkaku/electron-keystore      → @kokuin/electron
@enkaku/expo-keystore          → @kokuin/expo
@enkaku/hd-keystore            → @kokuin/deterministic
@enkaku/ledger-identity        → @kokuin/ledger-device

# RPC → @enkaku (scope unchanged)
@enkaku/protocol               → @enkaku/protocol
@enkaku/transport              → @enkaku/transport
@enkaku/client                 → @enkaku/client
@enkaku/server                 → @enkaku/server
@enkaku/standalone             → @enkaku/standalone
@enkaku/http-client-transport  → @enkaku/http-fetch
@enkaku/http-server-transport  → @enkaku/http-serve
@enkaku/socket-transport       → @enkaku/socket
@enkaku/node-streams-transport → @enkaku/node-streams
@enkaku/message-transport      → @enkaku/message
@enkaku/electron-rpc           → @enkaku/electron
@enkaku/react                  → @enkaku/react

# MLS → @kumiai
@enkaku/group                  → @kumiai/mls
@enkaku/broadcast              → @kumiai/broadcast
@enkaku/hub-protocol           → @kumiai/hub-protocol
@enkaku/hub-client             → @kumiai/hub-client
@enkaku/hub-server             → @kumiai/hub-server
@enkaku/hub-tunnel             → @kumiai/hub-tunnel
@enkaku/group-rpc              → @kumiai/rpc
```

No name clashes within or across scopes.

## Versioning policy

- **Mechanism:** independent per-package versioning (changesets), no hard `fixed` lock.
- **Coupling groups** (above) are release-time guidance, not enforced config. The releaser bumps
  coupled packages together by judgement; e.g. `@enkaku/transport` floats independently and is
  grouped with the core only when a change actually spans it.
- **Cross-repo deps:** published `^` semver ranges (not `workspace:`). Develop across a boundary
  via a canary/prerelease publish — acceptable because lower repos are meant to be stable.
- **1.0 promotion:** per-repo, whole. A repo goes 1.0 as a unit once its surface is stable; at
  promotion every package goes 1.0 (including SDK-bound ones — 1.0 only means semver discipline,
  they can major often). SDK churn is then a major on that one independent package, never a drag
  on the fixed group or the rest of the repo.
- **Sequence of 1.0s:** `@sozai` + `@kokuin` foundations first → `@enkaku` at RPC-API freeze →
  `@kumiai` last. New scopes start at 0.1.0 and bake before promotion.

## @kigu — the tooling hub

`@kigu` is the renamed `/agents` repo. It carries three faces in one repository.

```
kigu/
  package.json              # private workspace root
  pnpm-workspace.yaml
  packages/                 # FACE 1 — npm-published config
    tsconfig/               #   @kigu/tsconfig
    biome/                  #   @kigu/biome
    swc/                    #   @kigu/swc
    dev/                    #   @kigu/dev  (toolchain devDep preset)
  .claude-plugin/
    marketplace.json        # FACE 2 — the plugin marketplace
  plugins/
    kigu/                   #   single shared plugin
      .claude-plugin/plugin.json
      skills/               #   dev-loop · project-loop · complete · archive
                            #   + conventions · discover-template
      agents/               #   cavecrew + base agents
      commands/
  AGENTS.md / SHARED.md     # FACE 3 — root context, derived from the conventions skill
  docs/
    repo-split-design.md    # this document
```

- **Config (npm):** `@kigu/tsconfig`, `@kigu/biome`, `@kigu/swc` extended by each repo;
  `@kigu/dev` is a single devDep that pulls the shared toolchain (biome, typescript, swc, turbo,
  vitest) with central pinning. Config churn is devDep-only and never forces a consumer republish.
- **AI assets (plugin marketplace):** a single `kigu` plugin bundles the shared workflow skills,
  conventions (as a skill — the source of truth, auto-loaded into agent context everywhere),
  base agents, and a `discover` template/generator.
- **Domain skills stay local:** each runtime repo references the kigu marketplace and adds its own
  local domain plugin (`enkaku:*`, `kumiai:*`, …). Domain skills describe an API surface and must
  version with that code; centralizing them would reintroduce cross-repo doc-sync churn.

## Migration plan

Clean break (no git-history preservation, no transitional shims). One rename-map codemod drives
both import statements and `package.json` dependency edits.

Order — bottom-up, each layer published before the layer above rewrites its deps to it:

1. **@kigu** — stand up first; zero consumer impact.
2. **@sozai** — extract, publish 0.1.0.
3. **@kokuin** — extract, codemod its deps to `@sozai`, publish 0.1.0.
4. **@enkaku** — trim to RPC-only, codemod its deps to `@sozai`/`@kokuin`, publish **0.18.0**.
5. **@kumiai** — extract, codemod deps to `@sozai`/`@kokuin`/`@enkaku`, publish 0.1.0.
6. **Consumers** (`kubun`, `mokei`) — codemod each repo, one PR per repo, all-at-once.

Blast radius (consumer import sites, pre-split): ~209 stay `@enkaku` (zero churn — the heaviest
single dep, `transport` at 78, does not move), ~413 → `@sozai` (async/schema/stream dominate),
~96 → `@kokuin` (token at 64), ~25 → `@kumiai`. ~534 mechanical edits total, fully codemoddable.
