# hozon (保存) — shared database layer for the stack

Status: design approved in brainstorming, pending written-spec review. Date: 2026-10-06.

## Intent

Create a new public stack repo, `TairuFramework/hozon` (npm scope `@hozon`), holding the
database layer extracted from kubun: the generic adapter interface, the database runtime
(store registry, migrations, transactions), platform drivers, and reusable log / telemetry
stores. The first consumer is mokei's `flow-host-node`, whose hand-rolled `node:sqlite`
code is replaced. tejika gains helpers for opening local databases. Kubun adopts hozon in a
later, separate spec.

**Success criteria**

- mokei `flow-host-node` runs on hozon with no local `database.ts` / `migrations.ts` /
  `transaction.ts` / `sqlite-*-store.ts`, and its existing store contract, persistence,
  restart and shutdown tests pass.
- One conformance suite passes, unchanged, on every shipped driver: node:sqlite, Postgres,
  SQLocal (web: chromium, firefox, webkit), and Expo SQLite (iOS, Android), plus node:sqlite
  inside the Electron main process.
- Local integration tests (`pnpm run test:integration`) cover node:sqlite file databases
  and real Postgres, including both stores and the logtape / otel adapters.
- Every e2e harness runs the conformance suite and the store scenarios (`store-log`,
  `store-telemetry`, logtape sink, OTel exporter, persistence across restart).
- Integration and e2e suites run in CI on push to `main` and on pull requests.
- The `@hozon/db` API can host Kubun's store model (registry, `dependsOn`, savepoints,
  commit / rollback hooks, `kubun_` table prefix) without breaking changes on Kubun's side
  beyond renames.

**Decisions taken during brainstorming**

| Topic | Decision |
|---|---|
| Kubun reuse | Kubun will consume hozon; API must fit its store model |
| Existing mokei databases | Reset is acceptable (pre-1.0 local data) |
| Blob storage | Stays in kubun; `store-blob` only informed the store API shape |
| Drivers in v1 | node:sqlite, Postgres, Expo SQLite, SQLocal. better-sqlite3 dropped |
| Log / span stores | In this spec, as two independent stores |
| Approach | Port Kubun's model made generic (not a thin helper, not in-core plugin seams) |
| Scope | hozon repo, then tejika helpers, then mokei adoption; one plan per repo |

## Out of scope

- Kubun's engine, plugins, graph, document model, full-text search, access-control
  predicates, and domain stores (`store-graph`, `store-blob`, `store-credential`, …).
- Kubun adopting hozon (follow-up spec).
- Metrics storage, OTLP export, query UIs.
- mokei `mcp-servers/sqlite`.
- tejika CLI database subcommands and a generic retention scheduler (deferred until a
  second consumer needs them).

## 1. Packages and dependencies

```
@hozon/adapter         kysely                         dialect seams
@hozon/db              adapter, @sozai/log            HozonDB: registry, migrations, tx / savepoints / hooks
@hozon/node-sqlite     adapter                        node:sqlite DatabaseSync → Kysely (Node ≥ 24, Electron main)
@hozon/postgres        adapter, postgres, kysely-postgres-js
@hozon/expo            adapter, expo-sqlite (peer)    custom Kysely driver, single-connection mutex
@hozon/sqlocal         adapter, sqlocal (peer)        browser OPFS worker
@hozon/provider        db, node-sqlite, postgres      resolve ':memory:' | path | postgres:// → adapter (Node only)
@hozon/conformance     adapter, db                    runner-agnostic suite (+ vitest wrapper)
@hozon/store-log       db                             logs store
@hozon/store-telemetry db                             spans store (metrics later)
@hozon/logtape         store-log, @logtape/logtape (peer), @opentelemetry/api (peer)
@hozon/otel            store-telemetry, @opentelemetry/sdk-trace-base (peer), @opentelemetry/api (peer)
```

- Packages are ported from kubun `packages/{db,db-adapter,db-node-sqlite,db-postgres,
  db-expo,db-sqlocal,db-provider}`; `@kubun/logger` is replaced by `@sozai/log`.
- Stack placement: hozon depends on sozai (runtime) and kigu (dev tooling). tejika depends
  on hozon through `@tejika/db`. mokei depends on hozon and `@tejika/db`. Diagram becomes
  `sozai ← hozon ← tejika ← mokei`.
- Repo setup is specified in §0.

## 0. Repo setup

`/Users/paul/dev/yulsi/hozon` exists (`git init`, remote
`git@github.com:TairuFramework/hozon.git`, no commits). Setup is copied from kokuin (closest
shape: `packages/*` + `tests/*` e2e harnesses), with tejika's CI-specific scripts and
platform matrix, following kigu conventions §6–7. The first commit is this scaffold only.

**Root files**

| File | Source | Changes |
|---|---|---|
| `package.json` | kokuin | `name: "hozon-repo"`; add tejika's `build:ci`, `build:types:ci`, `lint:ci` scripts; `release` uses `build:ci`; `packageManager` = latest used in the stack (`pnpm@12.9.1`) |
| `pnpm-workspace.yaml` | kokuin | `packages: [packages/*, tests/*]`; `allowBuilds` (`@swc/core: true`, `electron: false`, `esbuild: false`); `nodeLinker: hoisted`; `versioning.changelog.storage: repository`; `versioning.ignore` lists only the private test packages `e2e-electron`, `e2e-expo`, `e2e-web`, `integration-tests`; catalog trimmed to hozon's deps (kysely, kysely-postgres-js, postgres, expo / expo-sqlite, sqlocal, `@sozai/log`, `@logtape/logtape`, `@opentelemetry/*`, `@testcontainers/postgresql`, Playwright, Electron Forge, Vite, React / RN, typescript, `@types/node`, `@kigu/dev`) at the versions kokuin and kubun currently pin; `catalogMode: prefer`; kokuin's `yauzl` override and Expo `minimumReleaseAgeExclude` entries as needed; `supportedArchitectures: current` |
| `turbo.json` | kokuin | verbatim |
| `tsconfig.json` | kokuin | `paths: { "@hozon/*": ["./packages/*"] }` |
| `tsconfig.build.json` | tejika | verbatim |
| `biome.json` | kokuin | verbatim |
| `.gitignore` | kokuin | verbatim |
| `.githooks/pre-commit` | kokuin | verbatim (biome staged check + `test:types`) |
| `.claude/settings.json` | sozai | kigu marketplace + `kigu@kigu`; add the `sozai` marketplace and plugin (hozon depends on sozai) |
| `.changeset/ledger.yaml` | — | empty ledger; no `config.json` |
| `LICENSE` | sozai | MIT, Paul Le Cam |
| `README.md` | — | short intro, package table, link to `docs/` |
| `AGENTS.md` / `CLAUDE.md` | kokuin | thin `AGENTS.md` per conventions; `CLAUDE.md` = `@AGENTS.md` |

`.claude/settings.local.json` and `.superpowers/` are not copied.

**Docs** (`docs/`): `index.md` (links `kigu/docs/stack.md`), `agents/architecture.md`
(packages, dependency graph, adapter / store model, test strategy),
`agents/development.md` (pointer to `kigu:development` plus hozon notes: Docker for
Postgres tests, harness commands), `reference/` (one doc per area: adapter, db, drivers,
stores, telemetry adapters). No empty placeholder folders.

**Domain plugin**: a hozon domain plugin (`.claude-plugin/marketplace.json` +
`plugins/hozon/`) instantiated from `kigu:discover-template`, like sozai's, with skills for
`database` (HozonDB, stores, migrations), `drivers`, and `telemetry`. Added once the
packages exist, as the last hozon-plan task.

**Package template** (from `kokuin/packages/node`): `package.json` with `repository.directory`,
`license: MIT`, `sideEffects: false`, `type: module`, `exports: { ".": "./lib/index.js" }`,
`files: ["lib/*"]`, the standard `build` / `build:js` (swc with `@kigu/dev/swc.json`) /
`build:types` / `test` / `test:types` / `test:unit` scripts, `publishConfig.access: public`;
`tsconfig.json` + `tsconfig.test.json` as in kokuin (browser / RN packages adjust `lib` and
`types`).

**CI workflows** (`.github/workflows/`): `build-test.yml` (copy of tejika / kokuin, plus
`integration-tests-dir: tests/integration`), `test-platforms.yml` (adapted from tejika, runs
`tests/integration` on the OS matrix), `e2e-web.yml`, `e2e-desktop.yml`, `e2e-ios.yml`,
`e2e-android.yml` (copies of kokuin's, pointing at hozon's `tests/*`). Details in §4.

**Root scripts** add `"test:integration": "pnpm run --filter integration-tests test"`
(mokei's pattern); root `test` stays unit-only so it needs no Docker.

**GitHub**: push `main` once the scaffold commit passes `build-test` locally; npm org
`@hozon` already exists.

## 2. `@hozon/adapter` and `@hozon/db`

### Adapter

```ts
type ColumnTypes = {
  bigint; binary; boolean; double; json; serial; text; timestamp; uuid: ColumnDataType
}
type Functions = { now: string | RawBuilder<string> }
type AdapterTypes = { Binary: unknown; JSON: unknown; Timestamp: unknown }

type Adapter<T extends AdapterTypes = AdapterTypes> = {
  dialect: Dialect
  kind: 'sqlite' | 'postgres'
  functions: Functions
  types: ColumnTypes
  encodeBinary(value: Uint8Array): T['Binary']
  encodeJSON(value: unknown): T['JSON']
  encodeTimestamp(value: Date): T['Timestamp']
  decodeTimestamp(value: T['Timestamp']): Date
  coerceFilterValue(value: unknown): unknown
  numericCast(expression: Expression<unknown>): Expression<number>
  nullOrdering(expression: Expression<unknown>, direction: OrderDirection): NullOrderingTerm
  containsPredicate(expression: Expression<unknown>, pattern: string): RawBuilder<boolean>
  arrayIncludesAllPredicate(expression: Expression<unknown>, values: Array<unknown>): RawBuilder<boolean>
  arrayIncludesAnyPredicate(expression: Expression<unknown>, values: Array<unknown>): RawBuilder<boolean>
  arrayPresencePredicate(expression: Expression<unknown>, mode: ArrayPresenceMode): RawBuilder<boolean>
}
```

- Exports `AbstractSQLiteAdapter`, `AbstractPostgresAdapter`, all types above, including
  `OrderDirection`, `NullOrderingTerm` and `ArrayPresenceMode` (hozon-owned).
- Removed versus kubun: `createSearchIndex`, `dropSearchIndex`, `updateSearchEntry`,
  `removeSearchEntry`, `searchIndex`, `readAccessPredicate`. Kubun re-adds them as a
  `KubunAdapter` composed over a hozon adapter.
- Added: `kind` (replaces `instanceof AbstractPostgresAdapter` checks), `boolean`
  (SQLite `integer`, Postgres `boolean`), `double` (SQLite `real`, Postgres
  `double precision`).
- Dialect behaviour otherwise as kubun: SQLite timestamps are epoch seconds, Postgres
  `timestamptz(3)`; booleans in filters are `1` / `0` on SQLite.
- Fix: the Expo serializer currently binds booleans as `'true'` / `'false'`, mismatching
  `coerceFilterValue`. It binds `1` / `0`; conformance asserts identical round-trips on
  all SQLite drivers.

### HozonDB

```ts
type MigrationContext = { types: ColumnTypes; functions: Functions; kind: Adapter['kind'] }

type StoreDefinition<Tables, API> = {
  name: string
  migrations: Record<string, Migration> | ((ctx: MigrationContext) => Record<string, Migration>)
  dependsOn?: Array<string>
  createAPI(db: Kysely<Tables>, adapter: Adapter): API
}

type HozonDBParams = { adapter: Adapter; logger?: Logger; tablePrefix?: string } // default 'hozon'

class HozonDB {
  register(definition: StoreDefinition<unknown, unknown>): void
  getStore<API>(name: string): Promise<API>
  hasStore(name: string): boolean
  migrate(): Promise<void>                       // migrate every registered store
  withTransaction<T>(fn: (provider: StoreProvider) => Promise<T>): Promise<T>
  close(): Promise<void>
}
```

Semantics are ported from `KubunDB` unchanged:

- Per-store Kysely `Migrator` with tables `${tablePrefix}_${name}_migration` and
  `${tablePrefix}_${name}_migration_lock`; migrations ordered by key (alphanumeric).
- Lazy migration on first `getStore`; all registered stores migrated before
  `withTransaction`; `dependsOn` stores first; a failed migration promise is evicted so the
  next call retries.
- `withTransaction`: nested calls run inline; scoped savepoint providers with savepoint
  names `${tablePrefix}_sp_N`; `onCommit` / `onRollback` hooks isolated per transaction;
  `SavepointOverlapError` preserved.
- Kysely instance uses `ParseJSONResultsPlugin`.
- New: `SchemaVersionError` when the database records a migration the code does not know
  (database written by a newer version). The check runs once, before the first migration
  of any store: read existing migration tables, compare with registered migrations, then
  call `adapter.prepare?.()`, then migrate. Nothing is written when the check fails.
- Logging via `getSozaiLogger('hozon')` from `@sozai/log`.
- Kubun passes `tablePrefix: 'kubun'`, so its existing databases need no migration.

### Drivers

- `NodeSQLiteAdapter({ database, pragmas? })`: wraps `DatabaseSync` behind Kysely's
  SQLite dialect (ported from `db-node-sqlite`). `busy_timeout = 5000` and
  `foreign_keys = ON` are connection-scoped and applied when the connection opens. For file
  databases, `journal_mode = WAL` persists to the file, so it is applied in the adapter's
  optional `prepare()` hook, which `HozonDB` calls once after the schema-version check and
  before the first migration. A database written by a newer version is therefore refused
  without being modified (preserves mokei's ordering guarantee). `pragmas` overrides any
  default.
- `Adapter` gains the optional `prepare?(): Promise<void>` hook used above; drivers
  without persistent setup omit it.
- `PostgresAdapter({ url, options?, closeTimeoutSeconds? })`: unchanged from kubun
  (int8 parsed to number, close deadline).
- `ExpoAdapter({ database })`: ported driver with mutex, `foreign_keys = ON`, boolean fix.
- `SQLocalAdapter({ database })`: ported; exposes the `sqlocal` instance.
- `@hozon/provider`: `resolveAdapter(input: Adapter | string)` and
  `resolveDB(input: HozonDB | Adapter | string, params?)`.

## 3. Stores and telemetry adapters

Hozon's own stores use fixed, `hozon_`-prefixed table names; `tablePrefix` affects only
migration and savepoint names. Records are stored whole in a JSON `data` column; only
filter / sort fields get their own columns.

### `@hozon/store-log`

Store name `log`. Type `StoredLog = { traceID?, spanID?, timestamp: number, level:
'trace' | 'debug' | 'info' | 'warning' | 'error' | 'fatal', category: Array<string>,
message: string, properties: Record<string, JSONValue> }` — structurally compatible with
mokei's `StoredLog` (whose trace fields are required).

Table `hozon_logs`: `seq` (serial PK), `timestamp` (double), `level` (text), `category`
(dot-joined text), `trace_id` (nullable), `span_id` (nullable), `data` (json). Indexes:
`(timestamp)`, `(trace_id, timestamp, seq)`, `(level, timestamp)`.

```ts
addLogs(logs: Array<StoredLog>): Promise<void>            // one transaction per batch
queryLogs(params: {
  from?: number; to?: number; levels?: Array<LogLevel>; categoryPrefix?: Array<string>
  traceID?: string; limit: number; cursor?: string
}): Promise<{ logs: Array<StoredLog>; cursor?: string }>   // seq-based cursor
deleteByTrace(traceIDs: Array<string>): Promise<number>
deleteBefore(time: number, params?: { keepTraceIDs?: Array<string> }): Promise<number>
```

### `@hozon/store-telemetry`

Store name `telemetry`. Type `StoredSpan` mirrors mokei's `host-protocol`
`storedSpanSchema`: `traceID`, `spanID`, `parentSpanID?`, `name`, `kind` (number),
`startTime`, `endTime`, `status` (`{ code, message? }`), `attributes`, `events`
(`{ name, time, attributes }`), `links` (`{ traceID, spanID }`). Metrics are a future migration in this store, not designed now.

Table `hozon_spans`: `seq`, `trace_id`, `span_id`, `start_time` (double), `end_time`
(double), `data` (json); unique `(trace_id, span_id)`; indexes
`(trace_id, start_time, seq)`, `(end_time)`.

```ts
addSpans(spans: Array<StoredSpan>): Promise<void>         // one transaction, upsert on (trace_id, span_id)
getSpans(traceID: string): Promise<Array<StoredSpan>>
deleteByTrace(traceIDs: Array<string>): Promise<number>
deleteBefore(time: number, params?: { keepTraceIDs?: Array<string> }): Promise<number>
```

Deletes in both stores run in one transaction and chunk ID lists (500 per `IN`), working
on SQLite and Postgres alike. The stores are independent: no `dependsOn`, either usable
alone.

### `@hozon/logtape`

```ts
createLogStoreSink(store: LogStore, params?: {
  tracedOnly?: boolean                     // only records with a valid active span
  excludeCategories?: Array<Array<string>>
}): Sink & { flush(): Promise<void> }
```

Queue + microtask batch drain (ported from mokei `trace-store-log-sink.ts`), compatible with
logtape's sync `configureSync`. Always excludes the `['hozon']` category to avoid feedback
loops. Write failures are reported via `getReporter`, never thrown into the logger.

### `@hozon/otel`

`createTelemetrySpanExporter(store: TelemetryStore): SpanExporter` — converts
`ReadableSpan` to `StoredSpan`, tracks pending writes, drains them on `forceFlush` /
`shutdown` (ported from mokei `trace-store-span-exporter.ts`). Future home of a metrics
exporter and an OTel `LogRecordExporter` writing to `store-log`.

## 4. Testing and CI

### `@hozon/conformance`

Runner-agnostic: cases are `{ name, run(ctx) }` with built-in assertion helpers, no vitest
dependency in the core entry.

```ts
runConformance(params: {
  createAdapter: () => Promise<Adapter>
  cleanup?: () => Promise<void>
}): Promise<Array<{ name: string; ok: boolean; error?: string }>>
defineVitestSuite(params)                  // separate entry, registers each case with vitest
```

Coverage: encoding round-trips for every column type and encode / decode method; query
seams; migrations (lazy, `dependsOn`, retry after failure, `SchemaVersionError`, custom
`tablePrefix`); transactions (commit, rollback, nesting, savepoints, hooks); `store-log`
and `store-telemetry` contracts (ported from mokei `test/contracts`).

### Test tiers

| Tier | Where | Runs | Purpose |
|---|---|---|---|
| Unit | `packages/*/test` | `pnpm run test` (turbo `test:types` + `test:unit`) | pure logic, in-memory node:sqlite (`:memory:`); no Docker, no files |
| Integration | `tests/integration` | `pnpm run test:integration` locally; CI via kigu `build-test` `integration-tests-dir: tests/integration` and `test-platforms.yml` | real node:sqlite files and real Postgres, drivers + `HozonDB` + stores + telemetry adapters together |
| E2e | `tests/e2e-{web,electron,expo}` | per-platform workflows | the same conformance + store scenarios inside real platform runtimes |

### Unit tests

Each package runs `tsc --noEmit` + vitest. `node-sqlite` runs conformance on `:memory:`.
No unit test needs Docker or the filesystem.

### Integration tests (`tests/integration`, private package `integration-tests`)

Pattern from enkaku's `tests/integration`. Vitest, one config, two backends selected by
`describe.each`:

- **node:sqlite**: file databases in a per-test temp directory.
- **Postgres**: `HOZON_POSTGRES_URL` if set (local server, CI service), otherwise
  testcontainers `postgres:18-alpine`; skipped with a visible notice when neither is
  available, failed instead of skipped when `CI=true`. Each test gets its own database
  (`CREATE DATABASE hozon_test_<random>`, dropped after).

Local usage: `pnpm run test:integration` (Docker running), or
`HOZON_POSTGRES_URL=postgres://… pnpm run test:integration`. A `docker-compose.yml` in
`tests/integration` starts a matching `postgres:18-alpine` for repeated local runs.

Scenarios, on both backends unless noted:

- Full `@hozon/conformance` suite against a real file / server.
- `HozonDB` lifecycle: open → migrate → close → reopen keeps data; multiple stores with
  `dependsOn`; `tablePrefix` isolation (two `HozonDB`s with different prefixes on one
  database); failed migration rolls back and retries on next open.
- `SchemaVersionError`: database migrated with a newer migration set is refused; node:sqlite
  file left byte-identical (no WAL switch); Postgres left with unchanged migration tables.
- Concurrency: two processes writing the same node:sqlite file (WAL + `busy_timeout`, no
  `SQLITE_BUSY`); concurrent transactions and savepoints on a Postgres pool.
- `store-log`: batch insert, `queryLogs` filters (time range, levels, `categoryPrefix`,
  `traceID`), cursor pagination over > 1 page, `deleteByTrace`, `deleteBefore` with
  `keepTraceIDs`, chunked deletes beyond 500 IDs, persistence across reopen.
- `store-telemetry`: batch insert, upsert on `(trace_id, span_id)`, `getSpans` ordering,
  `deleteByTrace`, `deleteBefore` with `keepTraceIDs`, chunked deletes, persistence across
  reopen.
- `@hozon/logtape`: logtape configured with the sink → records land in `store-log`;
  `tracedOnly` and `excludeCategories` filtering; `['hozon']` self-exclusion; `flush()`
  drains; write failure reported, not thrown.
- `@hozon/otel`: `BasicTracerProvider` + `BatchSpanProcessor` + exporter → spans land in
  `store-telemetry`; `forceFlush` / `shutdown` drain pending writes.
- `@hozon/provider`: string resolution to real node:sqlite and Postgres adapters.

### E2e harnesses (`tests/*`, `workspace:^`, excluded from versioning)

Every in-app harness runs two suites and shows both summaries:

1. **Conformance**: the full `@hozon/conformance` suite (adapter, db, `store-log` and
   `store-telemetry` contracts) on the platform driver.
2. **Stores**: the platform store scenario — configure logtape with `@hozon/logtape` and an
   OTel `BasicTracerProvider` with `@hozon/otel`, emit logs inside spans, flush, then query
   `store-log` (`queryLogs` by `traceID` and level) and `store-telemetry` (`getSpans`) and
   check the records match. A second phase after reload / restart re-queries the same
   trace to prove persistence, then runs `deleteBefore` retention and checks it.

| Harness | Driver | Runner | Persistence step |
|---|---|---|---|
| `tests/e2e-web` | sqlocal (OPFS) | Playwright chromium / firefox / webkit | page reload; Vite preview serves COOP / COEP headers |
| `tests/e2e-electron` | node-sqlite in main process, invoked over IPC | Playwright `_electron`, macOS + Windows | app restart |
| `tests/e2e-expo` | expo-sqlite | Maestro, iOS + Android | app restart |

In-app harnesses render one row per case with a `testID` and summary lines
`Conformance: OK n/n` and `Stores: OK n/n`; runners assert on the summaries and report the
failing row. Node-side scenarios formerly planned for a `tests/e2e-node` harness live in
`tests/integration`.

### CI (`.github/workflows/`, push to `main` + `pull_request`)

- `build-test.yml` → `TairuFramework/kigu/.github/workflows/build-test.yml@main`, Node 24 /
  26, `integration-tests-dir: tests/integration` (ubuntu runners have Docker, so Postgres
  runs through testcontainers).
- `test-platforms.yml` → adapted from tejika: ubuntu / macos / windows × Node 24 / 26, runs
  `tests/integration` with `HOZON_INTEGRATION_BACKENDS=node-sqlite` on macOS / Windows
  (no Docker there) and both backends on ubuntu.
- `e2e-web.yml`, `e2e-desktop.yml`, `e2e-ios.yml`, `e2e-android.yml` → kigu reusable
  workflows, mirroring kokuin's configuration.

### Early risks

- Playwright WebKit OPFS support. If unavailable, WebKit is recorded as a known gap; the
  web harness stays.
- `node:sqlite` in Electron 44's main process (bundles Node 24). The first electron test
  asserts availability via `process.versions`.

## 5. Consumers

### tejika

- `@tejika/env`: `getDatabasePath(app, name = app)` → `<APP>_DATABASE_PATH` if set, else
  `join(getDataDir(app), `${name}.db`)`.
- New `@tejika/db` (Node only; deps `@tejika/env`, `@hozon/db`, `@hozon/node-sqlite`):

  ```ts
  openLocalDatabase(params: {
    app: string; name?: string; path?: string
    stores: Array<StoreDefinition<unknown, unknown>>
    tablePrefix?: string; logger?: Logger; pragmas?: SQLitePragmas
  }): Promise<HozonDB>
  ```

  Resolves the path, creates the parent directory (not for `:memory:`), creates the
  adapter, registers stores, calls `db.migrate()` eagerly so version and migration errors
  surface at open; closes the handle and rethrows on failure.
- Approving this spec counts as the user sign-off tejika's `AGENTS.md` requires for a new
  package.

### mokei `flow-host-node`

- Delete `database.ts`, `migrations.ts`, `transaction.ts`, `sqlite-run-store.ts`,
  `sqlite-task-store.ts`, `sqlite-trace-store.ts`.
- Add store definitions `mokei-flow-runs` (table `mokei_flow_runs`) and
  `mokei-flow-tasks` (table `mokei_flow_tasks`), porting current semantics: insert
  `ON CONFLICT DO NOTHING` → `RunStoreConflictError`; revision-guarded `UPDATE … WHERE
  revision = ?`; JSON `data` plus indexed columns; same indexes.
- `TraceStore` becomes a facade over `store-log` + `store-telemetry`: `getTrace` =
  `getSpans` + `queryLogs({ traceID })`; `deleteTraces` and `deleteBefore` call both stores
  inside one `withTransaction`.
- `telemetry.ts` wires `@hozon/otel`'s exporter and `@hozon/logtape`'s sink
  (`tracedOnly: true`, excluding `['mokei', 'flow-host', 'capture']`). Whether
  `@mokei/flow-host`'s own `TraceStore`-based exporter / sink are kept for the in-memory
  path is decided in the mokei plan.
- `service.ts` opens via `openLocalDatabase({ app: 'mokei', name: 'flow', stores })`;
  `--database-path` still overrides.
- Reset: the database file moves from `mokei.db` to `flow.db`. On start, a legacy
  `mokei.db` (plus `-wal` / `-shm`) with `user_version = 1` is deleted and one info line is
  logged.
- Tests: `test/contracts` run against memory and hozon-backed stores; `persistence`,
  `restart`, `service` and `cli` daemon-shutdown ordering tests retained.

### Stack docs

- kigu: add hozon to `plugins/kigu/skills/stack-map/stack.json`; update `docs/stack.md`
  (repo table, diagram, dependency edges).
- tejika: update `docs/agents/architecture.md` for `@tejika/db`.

## Implementation order

1. hozon repo: scaffold (§0), adapter, db, drivers, conformance, stores, logtape / otel, e2e
   harnesses, CI, first publish; kigu stack docs.
2. tejika: `getDatabasePath`, `@tejika/db`, release.
3. mokei: `flow-host-node` adoption, release.

Each step gets its own implementation plan in its repo.
