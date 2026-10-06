# hozon: Shared Database Layer for the Stack

**Status:** complete

## Goal

Extract kubun's database layer into a new public stack repo, `hozon` (npm scope `@hozon`): a generic adapter interface, a database runtime (store registry, migrations, transactions), platform drivers and reusable log / telemetry stores. The first consumer is mokei's `flow-host-node`, which replaces its hand-rolled `node:sqlite` code; tejika gains helpers for opening local databases.

## What was built

- **hozon repo, published at 0.1.0:**
  - packages:
    - `@hozon/adapter`, `@hozon/db` (`HozonDB`);
    - drivers `@hozon/node-sqlite`, `@hozon/postgres`, `@hozon/expo` and `@hozon/sqlocal`;
    - `@hozon/provider`, which resolves `:memory:`, a file path or `postgres://` to an adapter;
    - `@hozon/conformance`;
    - stores `@hozon/store-log` (`hozon_logs`) and `@hozon/store-telemetry` (`hozon_spans`);
    - the adapters `@hozon/logtape` (log sink) and `@hozon/otel` (span exporter);
  - test tiers:
    - unit tests;
    - integration tests against node:sqlite files and real Postgres via testcontainers;
    - e2e harnesses for web (SQLocal on OPFS), Electron (node:sqlite in the main process) and Expo (iOS and Android).
  - CI: build-test, a platform matrix (ubuntu / macos / windows × Node 24 / 26) and the e2e workflows, all on push to `main` and on pull requests.
- **tejika (rollout step 2, released):** `getDatabasePath(app, name = app)` in `@tejika/env` (`<APP>_DATABASE_PATH` override, else `<dataDir>/<name>.db`). It also adds the new Node-only `@tejika/db`, whose `openLocalDatabase` resolves the path, creates the parent directory, registers stores and migrates eagerly at open.
- **kigu stack docs:** hozon added to `stack-map/stack.json` and `docs/stack.md`, with the edges `sozai ← hozon ← tejika ← mokei`.

## Key design decisions

- **Port Kubun's model, made generic.** The registry, `dependsOn`, savepoints, commit / rollback hooks and table prefix are kept, so Kubun can later adopt hozon with renames only. The other options were a thin helper or seams inside the engine. Kubun's engine, plugins, graph, document model and domain stores (including `store-blob`) stay in kubun.
- **One conformance suite that doesn't depend on a test runner.** The same suite runs unchanged in vitest (unit and integration) and inside each platform app (e2e). Every shipped driver has to pass it.
- **Stores are portable `StoreDefinition`s.** Log and span storage are two independent stores, not one telemetry store.
- **v1 drivers:** node:sqlite, Postgres, Expo SQLite and SQLocal. better-sqlite3 is dropped. WebKit OPFS is best-effort and doesn't block CI.
- **Explicit dependencies.** Each package declares every package it imports at runtime or in emitted declarations, so turbo's build edges match the real graph.
- **No legacy migration.** mokei's SQLite database had never shipped, so hozon's schema is its first version.
- **One database per app (changed during mokei adoption).** The spec planned a separate `flow.db` for mokei. During adoption this changed: logs and traces are used independently of flows, so mokei now opens a single `mokei.db`. A new `@mokei/app-node` package owns it, along with a generic `mokei.json` config (logs, tracing) and the telemetry setup. The daemon owns their lifecycle, and flow-host-node registers its run and task stores in that shared database.

## Out of scope

Kubun adopting hozon (needs its own spec), metrics storage, query UIs, mokei `mcp-servers/sqlite`, tejika CLI database subcommands and a generic retention scheduler.

## Follow-on

`docs/agents/plans/next/2026-10-06-hozon-mokei-release.md` tracks merging and releasing the mokei adoption (rollout step 3).
