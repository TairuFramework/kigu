# hozon Repo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `TairuFramework/hozon` repo: generic adapter, `HozonDB`, four drivers,
conformance suite, log / telemetry stores, logtape / OTel adapters, integration tests, e2e
harnesses for web / Electron / Expo, CI, docs; then register hozon in kigu's stack docs.

**Architecture:** Port kubun's `db-adapter` / `db` / driver packages, removing Kubun-only
seams, renaming to hozon, and applying the spec's fixes. Stores are portable
`StoreDefinition`s. One runner-agnostic conformance suite runs in vitest (unit,
integration) and inside platform apps (e2e). A private scenario package exercises the
stores end to end through logtape and OTel.

**Tech Stack:** TypeScript (ESM), Kysely 0.29, node:sqlite, postgres.js +
kysely-postgres-js, expo-sqlite, SQLocal, logtape, OpenTelemetry SDK 2.x, vitest,
testcontainers, Playwright, Electron Forge, Expo + Maestro, pnpm 12 + turbo, biome, swc.

**Spec:** `/Users/paul/dev/yulsi/kigu/docs/superpowers/specs/2026-10-06-hozon-design.md`
(read §0–§4 before starting; §5 is for the later tejika and mokei plans).

**Repos and paths used throughout**

| Name | Path |
|---|---|
| hozon (target) | `/Users/paul/dev/yulsi/hozon` (git init, remote set, no commits) |
| kubun (port source) | `/Users/paul/dev/yulsi/kubun/packages` |
| mokei (port source) | `/Users/paul/dev/yulsi/mokei/packages` |
| kokuin (setup / harness source) | `/Users/paul/dev/yulsi/kokuin` |
| tejika (setup source) | `/Users/paul/dev/yulsi/tejika` |
| kigu (stack docs) | `/Users/paul/dev/yulsi/kigu` |

Run repo scripts as `rtk proxy pnpm run <script>` (an `rtk` shim otherwise redirects
`pnpm run`), or call tools directly (`pnpm exec biome check …`, `pnpm exec vitest run`).

## Global Constraints

- npm scope `@hozon`; repo `TairuFramework/hozon`; ESM only; `exports: { ".": "./lib/index.js" }` (plus `./vitest` for conformance); `license: MIT`; `publishConfig.access: public`.
- Node ≥ 24 for Node packages; Electron 44 main process supported.
- Kysely `^0.29.6` (kubun's catalog pin); all catalog versions copied from kokuin / kubun / sozai current pins.
- Every package declares each package it imports at runtime or in emitted declarations directly.
- Default `tablePrefix` is `'hozon'`, validated by `^[a-z][a-z0-9_]{0,30}$`.
- Migration tables `${tablePrefix}_${name}_migration` / `${tablePrefix}_${name}_migration_lock`; savepoints `${tablePrefix}_sp_N`.
- Hozon store tables use fixed names `hozon_logs`, `hozon_spans`; temp keep tables `hozon_keep_log`, `hozon_keep_telemetry`.
- No statement binds more than 500 parameters.
- hozon loggers use `getLogger(['hozon', ...])` from `@sozai/log`; reporters `['hozon', 'logtape']`, `['hozon', 'otel']`.
- Log category encoding: segments joined with `\u001f` plus trailing `\u001f`.
- Unit tests need no Docker and no filesystem; integration tests may use both.
- Postgres image `postgres:18-alpine`; env var `HOZON_POSTGRES_URL`; backend selector `HOZON_INTEGRATION_BACKENDS` (`node-sqlite`, `postgres`, comma-separated; default both).
- E2e summary lines exactly `Conformance: OK n/n` and `Stores: OK n/n` (failure: `Conformance: FAIL k/n`, `Stores: FAIL k/n`).
- Chromium and Firefox web e2e are blocking; WebKit is non-blocking.
- Private (unversioned) packages: `e2e-electron`, `e2e-expo`, `e2e-web`, `integration-tests`, `hozon-test-scenarios`. (The last is a plan addition: the shared store scenario used by integration and e2e harnesses.)
- Kubun compatibility: `HozonDB` / `StoreProvider` / `StoreDefinition` / `MigrationContext` / `SavepointOverlapError` keep `@kubun/db`'s shapes (spec §2).
- Pushing to GitHub and publishing to npm are outward-facing: ask the user before Task 18's push / publish steps.

## Review Focus

1. **Empty inputs** — `addLogs([])`, `addSpans([])`, `deleteByTrace([])`, `deleteBefore(t, { keepTraceIDs: [] })` must be no-ops returning `0` (deletes) without opening a transaction or binding an empty `IN ()`. Tests: Task 6, Task 7.
2. **Concurrent first access** — two `getStore('log')` calls (and a `getStore` racing `migrate()`) issued before any migration completes must migrate once and both resolve, no "table already exists". Test: Task 4.
3. **Use after close** — `getStore` / `withTransaction` after `HozonDB.close()` must reject with `HozonDBClosedError` (message `HozonDB is closed`), not hang or reopen. Test: Task 4.
4. **Non-ASCII and nested JSON payloads** — log `properties` and span `attributes` with emoji, CJK, nested objects and arrays round-trip byte-for-byte on every driver. Test: Task 8 (conformance store cases).
5. **Sink after store failure** — when the store write rejects (e.g. DB closed mid-run), `@hozon/logtape` reports via its reporter, `flush()` still resolves, and later records keep draining. Test: Task 10.

---

## File Structure

```
hozon/
  package.json  pnpm-workspace.yaml  turbo.json  tsconfig.json  tsconfig.build.json
  biome.json  .gitignore  .githooks/pre-commit  .claude/settings.json
  .changeset/ledger.yaml  LICENSE  README.md  AGENTS.md  CLAUDE.md
  .claude-plugin/marketplace.json  plugins/hozon/...            (Task 17)
  .github/workflows/
    build-test.yml  test-platforms.yml  e2e-web.yml  e2e-desktop.yml  e2e-ios.yml  e2e-android.yml
  docs/
    index.md  agents/architecture.md  agents/development.md
    reference/{adapter,db,drivers,stores,telemetry}.md
  packages/
    adapter/src/{index,types,sqlite,postgres}.ts
    db/src/{index,db,errors,preflight,store-transaction}.ts
    node-sqlite/src/{index,database}.ts
    postgres/src/index.ts
    expo/src/{index,driver,serialize}.ts
    sqlocal/src/index.ts
    provider/src/index.ts
    conformance/src/{index,runner,assert,vitest}.ts
    conformance/src/cases/{encoding,seams,migrations,transactions,lifecycle,store-log,store-telemetry,atomicity}.ts
    store-log/src/{index,definition,migrations,tables,category,api,types}.ts
    store-telemetry/src/{index,definition,migrations,tables,api,types}.ts
    shared deletes helper lives in db: db/src/keep-set.ts
    logtape/src/index.ts
    otel/src/index.ts
  tests/
    scenarios/src/index.ts                     (hozon-test-scenarios)
    integration/                               (integration-tests)
    e2e-web/  e2e-electron/  e2e-expo/
```

Each package also has `package.json`, `tsconfig.json`, `tsconfig.test.json`, `README.md`,
`test/*.test.ts` following the Task 1 template.

---

### Task 1: Repo scaffold

**Files:**
- Create in `/Users/paul/dev/yulsi/hozon`: every root file in the spec §0 "Root files" table, `docs/index.md`, `docs/agents/architecture.md` (stub headings filled in Task 16), `docs/agents/development.md`, `.github/workflows/build-test.yml`

**Interfaces:**
- Produces: package template every later task copies (below); root scripts `build`, `build:ci`, `build:types:ci`, `lint`, `lint:ci`, `test`, `test:types`, `test:integration`, `release`; catalog names used by later tasks.

- [ ] **Step 1: Copy root config.** From tejika: `package.json` (rename `hozon-repo`; `lint` → `biome check --write ./packages ./tests`; add `"test:integration": "pnpm run --filter integration-tests test"`; `packageManager: pnpm@12.9.1`; `@kigu/dev` via `catalog:`), `tsconfig.build.json`. From kokuin: `turbo.json`, `biome.json`, `.gitignore`, `.githooks/pre-commit`, `tsconfig.json` (paths `"@hozon/*": ["./packages/*"]`). From sozai: `LICENSE`, `.claude/settings.json` (kigu + sozai marketplaces and plugins). `CLAUDE.md` = `@AGENTS.md`. `.changeset/ledger.yaml` = `{}`.
- [ ] **Step 2: Write `pnpm-workspace.yaml`** per spec §0 row: packages `packages/*`, `tests/*`; `allowBuilds`, `nodeLinker: hoisted`, `versioning.changelog.storage: repository`, `versioning.ignore` = the five private packages in Global Constraints; `catalogMode: prefer`; `supportedArchitectures: current`; `minimumReleaseAgeExclude` `@kigu/*`, `@sozai/*`. Catalog entries (versions from kokuin / kubun / sozai): `kysely`, `kysely-postgres-js`, `postgres`, `expo`, `expo-sqlite`, `expo-status-bar`, `sqlocal`, `@sozai/log`, `@sozai/json`, `@logtape/logtape`, `@opentelemetry/api`, `@opentelemetry/core`, `@opentelemetry/sdk-trace-base`, `@opentelemetry/context-async-hooks`, `@opentelemetry/sdk-trace-web`, `@testcontainers/postgresql`, `testcontainers`, `vitest`, `del-cli`, `@playwright/test`, `@electron-forge/cli`, `@electron-forge/plugin-vite`, `electron`, `vite`, `@vitejs/plugin-react`, `react`, `react-dom`, `react-native`, `react-native-web`, `@types/react`, `@types/react-dom`, `@types/node`, `typescript`, `@kigu/dev`. Copy kokuin's `yauzl` override and Expo `minimumReleaseAgeExclude` entries.
- [ ] **Step 3: Write `AGENTS.md`** (thin: what hozon is, pointer to `kigu:conventions` and `kigu:stack-map`, guardrails: pnpm only; never `.transaction()` inside store methods — use `withStoreTransaction`; no statement binds > 500 params), `README.md` (intro + package table from spec §1), `docs/index.md` (links `https://github.com/TairuFramework/kigu/blob/main/docs/stack.md`, architecture, development), `docs/agents/development.md` (pointer to `kigu:development`; Docker needed for Postgres integration tests; `HOZON_POSTGRES_URL`; harness commands).
- [ ] **Step 4: Write `.github/workflows/build-test.yml`** = tejika's file plus `integration-tests-dir: tests/integration` (the dir is created in Task 12; until then the input is commented out with `# enabled in Task 12`).
- [ ] **Step 5: Define the package template** in `docs/agents/development.md` "Package template" section — `package.json` scripts exactly as `/Users/paul/dev/yulsi/tejika/packages/env/package.json:32-42` (`build`, `build:clean`, `build:js`, `build:types`, `build:types:ci`, `prepack`, `test`, `test:types`, `test:unit`), `tsconfig.json` / `tsconfig.test.json` as `/Users/paul/dev/yulsi/kokuin/packages/node/tsconfig*.json`; `devDependencies` always include `del-cli`, `vitest` via catalog.
- [ ] **Step 6: Install and verify**

Run: `cd /Users/paul/dev/yulsi/hozon && pnpm install && pnpm exec biome ci .`
Expected: install succeeds (no packages yet), biome reports no errors.

- [ ] **Step 7: Commit** (first commit; scaffold only)

```bash
git add -A && git commit -m "chore: scaffold hozon repo"
```

---

### Task 2: `@hozon/adapter`

**Files:**
- Create: `packages/adapter/src/{index,types,sqlite,postgres}.ts` (port of `kubun/packages/db-adapter/src/*`)
- Test: `packages/adapter/test/sqlite.test.ts`, `packages/adapter/test/postgres.test.ts`

**Interfaces:**
- Produces (spec §2 Adapter block, verbatim): `Adapter<T>`, `AbstractAdapter<T>`, `AdapterTypes`, `ColumnTypes` (adds `boolean`, `double`), `Functions`, `OrderDirection = 'asc' | 'desc'`, `NullOrderingTerm`, `ArrayPresenceMode` (copy of kubun's `types.ts:5-9` values), `CreatedAtColumn`, `UpdatedAtColumn`, `SQLiteTypes`, `PostgresTypes`, abstract classes `AbstractSQLiteAdapter<T>` / `AbstractPostgresAdapter<T>` with `kind` = `'sqlite'` / `'postgres'`, optional `prepare?(): Promise<void>` and `close?(): Promise<void>`.

- [ ] **Step 1: Write failing tests.** Each test file defines a minimal concrete subclass using Kysely's `DummyDriver` dialect (`SqliteAdapter` / `PostgresAdapter` + `DummyDriver` + query compiler) and compiles expressions:

```ts
test('kind and column types', () => {
  expect(adapter.kind).toBe('sqlite')
  expect(adapter.types.boolean).toBe('integer')
  expect(adapter.types.double).toBe('real')
})
test('numericCast compiles', () => { /* sqlite: CAST(x AS REAL) — existing kubun SQL kept */ })
test('no search or access seams', () => {
  for (const k of ['createSearchIndex','dropSearchIndex','updateSearchEntry','removeSearchEntry','searchIndex','readAccessPredicate'])
    expect(k in adapter).toBe(false)
})
```

Postgres file: `types.boolean === 'boolean'`, `types.double === 'double precision'`, `kind === 'postgres'`, and `numericCast` compiles to SQL containing `::double precision` (not `::numeric`). Both files keep kubun's existing seam behaviour assertions for `containsPredicate` (`LIKE` / `ILIKE`), `nullOrdering` (`lead` vs `native`), `coerceFilterValue(true)` (`1` / `'true'`).

- [ ] **Step 2: Run** `pnpm --filter @hozon/adapter exec vitest run` — Expected: FAIL (module not found).
- [ ] **Step 3: Port** kubun's four files; delete FTS / access code paths and the `fts_` identifier guard; add `kind`, `boolean`, `double`, optional `prepare` / `close` to `AbstractAdapter`; Postgres `numericCast` → `sql\`(${e})::double precision\``; export list per Interfaces. Package deps: `kysely`.
- [ ] **Step 4: Run** tests and `pnpm --filter @hozon/adapter run test` — Expected: PASS (types + unit).
- [ ] **Step 5: Commit** `feat(adapter): port generic dialect seams from kubun`

---

### Task 3: `@hozon/node-sqlite`

**Files:**
- Create: `packages/node-sqlite/src/database.ts` (DatabaseSync wrapper with Kysely's better-sqlite-like interface), `src/index.ts` (`NodeSQLiteAdapter`)
- Test: `packages/node-sqlite/test/adapter.test.ts`

**Interfaces:**
- Consumes: `AbstractSQLiteAdapter` (Task 2).
- Produces: `class NodeSQLiteAdapter extends AbstractSQLiteAdapter<{ Binary: Uint8Array; JSON: string; Timestamp: number }>`, `constructor(params: { database: string; pragmas?: SQLitePragmas })`, `type SQLitePragmas = { journalMode?: 'wal' | 'delete' | 'truncate' | 'memory' | 'off'; busyTimeout?: number; foreignKeys?: boolean }`, `prepare(): Promise<void>` (sets `journal_mode`; skipped for `:memory:`), `close(): Promise<void>` (idempotent), getter `database: DatabaseSync`.

- [ ] **Step 1: Write failing tests** (all `:memory:`):

```ts
test('binds booleans as 1/0', async () => { /* insert true/false into integer col via Kysely; select returns 1 and 0 */ })
test('connection pragmas applied on open', () => {
  // PRAGMA busy_timeout → 5000; PRAGMA foreign_keys → 1
})
test('pragmas override defaults', () => { /* { busyTimeout: 100, foreignKeys: false } → 100, 0 */ })
test('prepare on :memory: is a no-op', async () => { await expect(a.prepare()).resolves.toBeUndefined() })
test('close before first query and double close are safe', async () => { await a.close(); await a.close() })
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** Port `kubun/packages/db-node-sqlite/src/index.ts`; wrapper maps every bound `boolean` to `1` / `0` before `stmt.all/run`; apply `busy_timeout` (default 5000) and `foreign_keys` (default ON) in the constructor right after `new DatabaseSync`; `journal_mode` (default `wal`) only in `prepare()` and only when `database !== ':memory:'`; `close()` closes the handle if open, tolerating Kysely having never initialized. Deps: `@hozon/adapter`, `kysely`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(node-sqlite): add node:sqlite driver`

---

### Task 4: `@hozon/db`

**Files:**
- Create: `packages/db/src/db.ts` (port of `kubun/packages/db/src/db.ts`), `src/errors.ts`, `src/preflight.ts`, `src/store-transaction.ts`, `src/keep-set.ts`, `src/index.ts`
- Test: `packages/db/test/db.test.ts`, `test/transaction.test.ts` (ports of kubun's), `test/preflight.test.ts`, `test/keep-set.test.ts`

**Interfaces:**
- Consumes: `Adapter` (Task 2); devDep `@hozon/node-sqlite` (Task 3) for tests.
- Produces:
  - `HozonDB`, `HozonDBParams`, `StoreDefinition<Tables, API>`, `StoreProvider<Stores>`, `MigrationContext` (adds `kind`) — shapes per spec §2.
  - Errors: `SavepointOverlapError` (kubun message kept), `SchemaVersionError` (`constructor(store: string, unknown: Array<string>)`, message `Database schema for store "<store>" is newer than this version supports (unknown migrations: <a>, <b>)`), `InvalidTablePrefixError`, `HozonDBClosedError` (message `HozonDB is closed`).
  - `withStoreTransaction<DB, R>(db: Kysely<DB>, fn: (trx: Kysely<DB>) => Promise<R>): Promise<R>` — inline when `db.isTransaction`, else `db.transaction().execute(fn)`.
  - `withKeepSet<DB, R>(db: Kysely<DB>, params: { table: string; ids: Array<string> }, fn: (selectKeep: () => SelectQueryBuilder) => Promise<R>): Promise<R>` — creates `CREATE TEMP TABLE <table> (trace_id text PRIMARY KEY)`, inserts ids 500 per statement with conflict-ignore, runs `fn`, drops the table in `finally`. Must be called with a transaction (asserts `db.isTransaction`).
  - `chunk<T>(items: Array<T>, size = 500): Array<Array<T>>`.

- [ ] **Step 1: Port kubun tests** `db.test.ts` and `transaction.test.ts`, swapping `KubunDB` → `HozonDB`, better-sqlite → `NodeSQLiteAdapter({ database: ':memory:' })`, `kubun_` → `hozon_` names. Postgres `describe.each` rows are removed here (they move to conformance in Task 8). Add:

```ts
test('rejects invalid tablePrefix', () => {
  for (const p of ['Kubun', '1x', 'a-b', "a'b", 'x'.repeat(32)])
    expect(() => new HozonDB({ adapter, tablePrefix: p })).toThrow(InvalidTablePrefixError)
})
test('concurrent first getStore migrates once', async () => {
  const [a, b] = await Promise.all([db.getStore('s'), db.getStore('s'), db.migrate()])
  expect(migrationRuns).toBe(1)
})
test('use after close rejects', async () => {
  await db.close()
  await expect(db.getStore('s')).rejects.toThrow(HozonDBClosedError)
  await expect(db.withTransaction(async () => {})).rejects.toThrow('HozonDB is closed')
})
test('close calls adapter.close once', async () => { /* spy */ })
test('root onCommit runs immediately; root onRollback is a no-op', ...)
test('adapter getter returns the adapter', ...)
```

- [ ] **Step 2: Write `preflight.test.ts`:**

```ts
test('unknown executed migration throws SchemaVersionError before prepare', async () => {
  // pre-seed hozon_a_migration with rows '0-init', '1-next' via raw SQL on the adapter's
  // connection; register 'a' with only '0-init'; wrap adapter.prepare in a spy
  await expect(db.migrate()).rejects.toThrow(SchemaVersionError)
  expect(prepareSpy).not.toHaveBeenCalled()
})
test('a newer dependsOn / second store blocks all writes', async () => {
  // stores a (clean) and b (has unknown row); migrate() throws; no hozon_a_migration table created
})
test('store with empty migrations is still checked', ...)
test('unregistered store migration tables are ignored', ...)
test('late-registered store is checked on its own', async () => {
  // migrate a; then register c with unknown row; getStore('c') throws SchemaVersionError; getStore('a') still works
})
test('prepare runs exactly once across migrate, getStore and withTransaction', ...)
```

- [ ] **Step 3: Write `keep-set.test.ts`:** `chunk` boundaries (0 → `[]`, 500 → one chunk, 501 → chunks of 500 and 1); `withKeepSet` with 1,000 distinct ids plus 201 repeats → keep table has 1,000 rows; two sequential `withKeepSet` calls in one transaction succeed; table absent after each call; calling outside a transaction throws.
- [ ] **Step 4: Run** `pnpm --filter @hozon/db exec vitest run` — Expected: FAIL.
- [ ] **Step 5: Implement.** Port `db.ts` with renames; validate prefix in constructor; preflight in `preflight.ts`: `checkStore(db, prefix, name, keys): Promise<void>` reads `${prefix}_${name}_migration` (`SELECT name FROM …`; table-missing → no rows) and throws `SchemaVersionError` on rows not in `keys`. `HozonDB` keeps one `#preflight: Promise<void> | null`: first trigger checks all registered stores, then `adapter.prepare?.()`, then proceeds; stores registered later run `checkStore` before their own migrator. Closed flag set first in `close()`; `close()` destroys Kysely then awaits `adapter.close?.()`. Logger default `getLogger(['hozon', 'db'])`. Deps: `@hozon/adapter`, `kysely`, `@sozai/log`.
- [ ] **Step 6: Run** — Expected: PASS (all ported + new tests).
- [ ] **Step 7: Commit** `feat(db): port HozonDB with preflight, store transactions and keep sets`

---

### Task 5: `@hozon/conformance` core (adapter + db cases)

**Files:**
- Create: `packages/conformance/src/{index,runner,assert,vitest}.ts`, `src/cases/{encoding,seams,migrations,transactions,lifecycle}.ts`
- Modify: `packages/node-sqlite/package.json` (devDep `@hozon/conformance`), `packages/node-sqlite/test/conformance.test.ts`
- Test: `packages/conformance/test/runner.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `type ConformanceContext = { createAdapter: () => Promise<Adapter>; cleanup?: () => Promise<void> }`
  - `type ConformanceCase = { name: string; run(ctx: CaseContext): Promise<void> }` where `CaseContext = { adapter: Adapter; db: (params?: Partial<HozonDBParams>) => HozonDB }` (fresh adapter per case via `createAdapter`, `cleanup` after each).
  - `type ConformanceResult = { name: string; ok: boolean; error?: string }`
  - `runConformance(params: ConformanceContext & { cases?: Array<ConformanceCase> }): Promise<Array<ConformanceResult>>` (default: all cases).
  - `summarize(results): { ok: boolean; passed: number; total: number; line: (label: string) => string }` — `line('Conformance')` → `Conformance: OK 42/42` or `Conformance: FAIL 3/42`.
  - `assert` helpers: `equal`, `deepEqual`, `ok`, `rejects(fn, ErrorClass | string)`.
  - `@hozon/conformance/vitest` subpath: `defineVitestSuite(params: ConformanceContext & { name: string })` registers one vitest `test` per case.
  - `allCases`, plus named groups `encodingCases`, `seamCases`, `migrationCases`, `transactionCases`, `lifecycleCases`.

- [ ] **Step 1: Write `runner.test.ts`:** a failing case yields `{ ok: false, error: <message> }` without stopping later cases; `cleanup` runs after every case including failures; `summarize` lines match the Global Constraints format.
- [ ] **Step 2: Write cases** (each case's assertions written as code with `assert`):
  - `encoding`: every `ColumnTypes` key creates a column and round-trips (`binary` Uint8Array bytes equal, `json` object deep-equal, `timestamp` Date to-second (SQLite) / to-ms (Postgres), `boolean` true/false, `double` `0.1 + 0.2` exact, `bigint` `2 ** 53 - 1`).
  - `seams`: `containsPredicate(col, 'b')` matches `'ABC'` on both dialects (SQLite `LIKE` is ASCII case-insensitive, Postgres uses `ILIKE`); array predicates on json arrays; `arrayPresencePredicate` each mode; `nullOrdering` puts nulls last asc; selected `numericCast` expression returns `typeof === 'number'`.
  - `migrations`: lazy on getStore; `dependsOn` order; failed migration retried; `SchemaVersionError` (seeded unknown row); custom `tablePrefix` creates `custom_s_migration`.
  - `transactions`: commit, rollback, nested inline, savepoint rollback keeps outer, `SavepointOverlapError`, `onCommit` after commit, `onRollback` after rollback, hook error isolated.
  - `lifecycle`: close before first query; double close; use after close → `HozonDBClosedError`.
- [ ] **Step 3: Add `packages/node-sqlite/test/conformance.test.ts`:** `defineVitestSuite({ name: 'node-sqlite', createAdapter: async () => new NodeSQLiteAdapter({ database: ':memory:' }) })`.
- [ ] **Step 4: Run** `pnpm --filter @hozon/conformance --filter @hozon/node-sqlite exec vitest run` — Expected: FAIL first, then PASS after implementing runner / cases.
- [ ] **Step 5: Implement** runner, assert, vitest subpath (`exports: { ".": "./lib/index.js", "./vitest": "./lib/vitest.js" }`, vitest optional peer via `peerDependenciesMeta`). Deps: `@hozon/adapter`, `@hozon/db`, `kysely`.
- [ ] **Step 6: Run** — Expected: PASS.
- [ ] **Step 7: Commit** `feat(conformance): add runner-agnostic adapter and db suite`

---

### Task 6: `@hozon/store-log`

**Files:**
- Create: `packages/store-log/src/{index,definition,migrations,tables,category,api,types}.ts`
- Test: `packages/store-log/test/store-log.test.ts`, `test/category.test.ts`

**Interfaces:**
- Consumes: `StoreDefinition`, `withStoreTransaction`, `withKeepSet`, `chunk` (Task 4).
- Produces:
  - `LOG_STORE = 'log'`, `logStoreDefinition: StoreDefinition<LogTables, LogStore>`, `getLogStore(provider: StoreProvider): Promise<LogStore>`.
  - `type LogLevel = 'trace' | 'debug' | 'info' | 'warning' | 'error' | 'fatal'`; `StoredLog`, `TracedLog`, `isTracedLog(log): log is TracedLog` (spec §3).
  - `type LogStore = { addLogs(logs): Promise<void>; queryLogs(params: QueryLogsParams): Promise<{ logs: Array<StoredLog>; cursor?: string }>; getTraceLogs(traceID: string): Promise<Array<TracedLog>>; deleteByTrace(traceIDs: Array<string>): Promise<number>; deleteBefore(time: number, params?: { keepTraceIDs?: Array<string> }): Promise<number> }`
  - `QueryLogsParams = { from?: number; to?: number; levels?: Array<LogLevel>; categoryPrefix?: Array<string>; traceID?: string; limit: number; cursor?: string }`.
  - `encodeCategory(segments: Array<string>): string`, `categoryRange(prefix: Array<string>): { gte: string; lt: string }`.
  - Table `hozon_logs` and indexes per spec §3; migration key `'0-init'` (function form using `ctx.types.double` etc.).

- [ ] **Step 1: Write `category.test.ts`:** `encodeCategory(['a','b']) === 'a\u001fb\u001f'`; `['a.b']` and `['a','b']` encode differently; segment containing `\u001f` throws `TypeError`; `categoryRange(['a'])` matches `['a']`, `['a','b']`, not `['ab']`, not `['a.b']`.
- [ ] **Step 2: Write `store-log.test.ts`** (node-sqlite `:memory:` via `HozonDB`):

```ts
test('empty inputs are no-ops', async () => {
  await store.addLogs([])
  expect(await store.deleteByTrace([])).toBe(0)
  expect(await store.deleteBefore(10, { keepTraceIDs: [] })).toBe(0)
})
test('rejects unpaired trace/span IDs and writes nothing', async () => {
  await expect(store.addLogs([ok, { ...ok, spanID: undefined }])).rejects.toThrow(/index 1/)
  expect((await store.queryLogs({ limit: 10 })).logs).toHaveLength(0)
})
test('queryLogs orders by (timestamp, seq) with out-of-order inserts', ...)
test('cursor paginates across equal timestamps without gaps or repeats', async () => {
  // 5 logs at t=1, 3 at t=2; limit 3 → pages of 3,3,2; concatenation equals full ordered list
})
test('limit is capped at 1000', ...)
test('filters: from/to inclusive bounds, levels, categoryPrefix, traceID', ...)
test('getTraceLogs returns all logs of a trace in order', ...)
test('deleteBefore is strict, keeps protected traces, deletes untraced by time', ...)
test('two deleteBefore calls inside one withTransaction', ...)
test('standalone and in-transaction calls both work', ...)
```

- [ ] **Step 3: Run** — Expected: FAIL.
- [ ] **Step 4: Implement.** `api.ts` `createLogStoreAPI(db, adapter)`; inserts batched ≤ 500 params per statement (7 columns → 71 rows per insert) inside `withStoreTransaction`; cursor = base64url JSON `[timestamp, seq]`; `deleteBefore` uses `withStoreTransaction` + `withKeepSet({ table: 'hozon_keep_log', ids })` and the anti-join from spec §3; `queryLogs` with `traceID` and `getTraceLogs` use the `(trace_id, timestamp, seq)` index. Deps: `@hozon/adapter`, `@hozon/db`, `kysely`.
- [ ] **Step 5: Run** — Expected: PASS.
- [ ] **Step 6: Commit** `feat(store-log): add log store`

---

### Task 7: `@hozon/store-telemetry`

**Files:**
- Create: `packages/store-telemetry/src/{index,definition,migrations,tables,api,types}.ts`
- Test: `packages/store-telemetry/test/store-telemetry.test.ts`

**Interfaces:**
- Consumes: Task 4 helpers.
- Produces: `TELEMETRY_STORE = 'telemetry'`, `telemetryStoreDefinition`, `getTelemetryStore(provider)`, `StoredSpan` (spec §3 field list), `type TelemetryStore = { addSpans(spans): Promise<void>; getSpans(traceID): Promise<Array<StoredSpan>>; deleteByTrace(traceIDs): Promise<number>; deleteBefore(time, params?: { keepTraceIDs?: Array<string> }): Promise<number> }`. Table `hozon_spans` per spec; `getSpans` ordered by `(start_time, seq)`; `deleteBefore` compares `end_time` strictly.

- [ ] **Step 1: Write tests** porting mokei's `test/contracts/trace-store.ts` span cases (`round-trips fractional times`, `upserts span pairs preserving sequence and orders timestamp ties`, `uses strict end-time cutoff, keeps traces and reports actual counts`, `handles missing IDs and empty collections`, `protects a large keep set` with 40,000 ids) against `TelemetryStore`, plus two `deleteBefore` calls in one transaction and duplicate keep ids.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** mirroring Task 6's patterns (upsert `ON CONFLICT (trace_id, span_id) DO UPDATE SET start_time, end_time, data`; keep table `hozon_keep_telemetry`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(store-telemetry): add span store`

---

### Task 8: Conformance store and atomicity cases

**Files:**
- Create: `packages/conformance/src/cases/{store-log,store-telemetry,atomicity}.ts`
- Modify: `packages/conformance/src/index.ts`, `packages/conformance/package.json` (deps `@hozon/store-log`, `@hozon/store-telemetry`)

**Interfaces:**
- Consumes: Tasks 5–7.
- Produces: `storeLogCases`, `storeTelemetryCases`, `atomicityCases`, included in `allCases`.

- [ ] **Step 1: Write cases:** store-log and store-telemetry happy paths from Tasks 6–7 (ordering, cursor, filters, retention with 2,000 keep ids — smaller than integration's 40,000 to keep mobile runs fast), plus Review Focus 4:

```ts
case 'json payloads round-trip': properties = { emoji: '🗄️保存', nested: { a: [1, { b: null }] }, long: 'x'.repeat(10_000) }
  → queryLogs returns deepEqual properties; same for span attributes via getSpans
```

  `atomicity`: inside `db.withTransaction(async (tx) => { log.addLogs(...); telemetry.addSpans(...); throw })` both stores empty after; `deleteTraces`-style composition where the telemetry delete throws (forced via a span store wrapper that throws after the log delete) leaves logs intact.
- [ ] **Step 2: Run** `pnpm --filter @hozon/node-sqlite exec vitest run` — Expected: new cases FAIL until exported, then PASS.
- [ ] **Step 3: Commit** `feat(conformance): add store and cross-store atomicity cases`

---

### Task 9: `@hozon/postgres` and `@hozon/provider`

**Files:**
- Create: `packages/postgres/src/index.ts` (port), `packages/provider/src/index.ts` (port)
- Test: `packages/postgres/test/conformance.test.ts`, `packages/provider/test/resolve.test.ts` (port)

**Interfaces:**
- Produces: `PostgresAdapter({ url, options?, closeTimeoutSeconds? })` (kubun's int8 parser and close deadline kept; `close()` = `end()` with deadline, idempotent); `resolveAdapter(input: Adapter | string): Adapter`; `resolveDB(input: HozonDB | Adapter | string, params?: Omit<HozonDBParams, 'adapter'>): HozonDB`.
- Test helper in `packages/postgres/test/container.ts` (copied into `tests/integration/src/backends.ts` in Task 12): `startPostgres(): Promise<{ url: string; stop(): Promise<void> } | null>` — uses `HOZON_POSTGRES_URL` if set, else testcontainers `postgres:18-alpine`, else `null` (Docker missing).

- [ ] **Step 1: Write tests.** `resolve.test.ts` ports kubun's (no connection needed: postgres.js connects lazily). `conformance.test.ts`: `const pg = await startPostgres(); describe.skipIf(pg === null)` → `defineVitestSuite({ name: 'postgres', createAdapter: () => fresh database per case })` where each case runs `CREATE DATABASE hozon_test_<random>` and cleanup drops it.
- [ ] **Step 2: Run** with Docker up — Expected: FAIL, then PASS after porting; without Docker — Expected: suite skipped, `resolve.test.ts` PASS.
- [ ] **Step 3: Port** kubun `db-postgres/src/index.ts` and `db-provider/src/index.ts` with renames. Deps: postgres → `@hozon/adapter`, `kysely`, `kysely-postgres-js`, `postgres`; provider → `@hozon/adapter`, `@hozon/db`, `@hozon/node-sqlite`, `@hozon/postgres`. devDeps: `@testcontainers/postgresql`.
- [ ] **Step 4: Commit** `feat(postgres,provider): add Postgres driver and adapter resolution`

---

### Task 10: `@hozon/logtape`

**Files:**
- Create: `packages/logtape/src/index.ts` (port of `mokei/packages/flow-host/src/trace-store-log-sink.ts`)
- Test: `packages/logtape/test/sink.test.ts`

**Interfaces:**
- Consumes: `LogStore`, `StoredLog` (Task 6).
- Produces: `createLogStoreSink(store: LogStore, params?: { tracedOnly?: boolean; excludeCategories?: Array<Array<string>> }): Sink & { flush(): Promise<void> }`.

- [ ] **Step 1: Write tests** (fake `LogStore` recording batches; `AsyncLocalStorageContextManager` + `BasicTracerProvider` registered in `beforeEach`, `trace.disable()` / `context.disable()` in `afterEach`):

```ts
test('stores records with category, level, rendered message, JSON properties', ...)
test('untraced records stored when tracedOnly is false and carry no trace fields', ...)
test('tracedOnly drops records without an active span', ...)
test('excludeCategories drops matching prefixes', ...)
test('always excludes the hozon category root', async () => { sink(record(['hozon','db'])); await sink.flush(); expect(batches).toEqual([]) })
test('store failure is reported, flush resolves, later records still drain', async () => {
  store.addLogs = vi.fn().mockRejectedValueOnce(new Error('closed')).mockResolvedValue(undefined)
  // first record → reporter called with 'Failed to store log batch'; flush resolves; second record stored
})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the queue + microtask drain from mokei; reporter `getReporter(['hozon', 'logtape'], '@hozon/logtape')`; built-in exclusion `['hozon']` prepended to `excludeCategories`; `tracedOnly` default `false`. Deps: `@hozon/store-log`, `@sozai/json`, `@sozai/log`; peers `@logtape/logtape`, `@opentelemetry/api`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(logtape): add log store sink`

---

### Task 11: `@hozon/otel`

**Files:**
- Create: `packages/otel/src/index.ts` (port of `mokei/packages/flow-host/src/trace-store-span-exporter.ts`)
- Test: `packages/otel/test/exporter.test.ts`

**Interfaces:**
- Consumes: `TelemetryStore`, `StoredSpan` (Task 7).
- Produces: `createTelemetrySpanExporter(store: TelemetryStore): SpanExporter`.

- [ ] **Step 1: Write tests** with a real `HozonDB` (node-sqlite `:memory:`), `BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })`: span fields map exactly (`parentSpanID`, `kind`, `status`, `events`, `links`, fractional ms times); `forceFlush()` resolves after pending writes land; `shutdown()` drains then rejects further exports with `ExportResultCode.FAILED`; store failure → `ExportResultCode.FAILED` and reporter `['hozon', 'otel']` called.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the mokei port. Deps: `@hozon/store-telemetry`, `@sozai/log`, `@opentelemetry/core`; peers `@opentelemetry/sdk-trace-base`, `@opentelemetry/api`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(otel): add telemetry span exporter`

---

### Task 12: Store scenario package and integration tests

**Files:**
- Create: `tests/scenarios/{package.json,tsconfig.json,src/index.ts}` (name `hozon-test-scenarios`, private)
- Create: `tests/integration/{package.json,tsconfig.json,vitest.config.ts,docker-compose.yml}`, `tests/integration/src/backends.ts`, `tests/integration/test/{conformance,lifecycle,schema-version,concurrency,store-log,store-telemetry,telemetry-adapters,provider}.test.ts`, `tests/integration/test/fixtures/writer.ts`
- Modify: `.github/workflows/build-test.yml` (enable `integration-tests-dir`), create `.github/workflows/test-platforms.yml`

**Interfaces:**
- Consumes: all packages.
- Produces (`hozon-test-scenarios`):
  - `type ScenarioPhase = 'write' | 'verify'`
  - `runStoreScenario(params: { db: HozonDB; phase: ScenarioPhase; runID: string }): Promise<Array<ConformanceResult>>` — `write`: configures logtape (`configure` with `createLogStoreSink(log, { tracedOnly: false })`), gets a tracer from the globally registered provider (caller registers provider + context manager), emits 3 logs inside a span `scenario-<runID>` synchronously within `tracer.startActiveSpan`, plus 1 untraced log, flushes sink and `provider.forceFlush()`, then checks `getTraceLogs` (3, ordered), `queryLogs({ levels: ['error'] })`, `getSpans` (1, name matches). `verify`: re-queries the same `runID` trace and asserts identical results, then `deleteBefore(Infinity, { keepTraceIDs: [] })` on both stores and asserts both empty. Each check is one `ConformanceResult`; summary label `Stores`.
  - `setupTelemetry(params: { contextManager: ContextManager; db: HozonDB }): Promise<{ provider: BasicTracerProvider; teardown(): Promise<void> }>` — registers the context manager and provider globally with `createTelemetrySpanExporter`; `teardown` shuts down, `trace.disable()`, `context.disable()`, `reset()` logtape.
- Produces (integration): `backends(): Array<{ name: 'node-sqlite' | 'postgres'; createAdapter(): Promise<Adapter>; reopen(): Promise<Adapter>; cleanup(): Promise<void> }>` honoring `HOZON_INTEGRATION_BACKENDS`; node-sqlite uses a per-test temp dir file; Postgres per spec §4 (fails instead of skipping when `CI=true`).

- [ ] **Step 1: Write integration tests** (`describe.each(backends())`), one file per spec §4 integration bullet:
  - `conformance.test.ts`: `runConformance` on the real backend, every result ok.
  - `lifecycle.test.ts`: reopen keeps data; `dependsOn`; two prefixes on one database for disjoint stores; failed migration rolls back and retries on next open; failed open releases the file (node-sqlite: `rm` the file succeeds afterwards).
  - `schema-version.test.ts`: newer migration set refused, including only a `dependsOn` or late-registered store newer; node-sqlite file bytes identical before / after (`readFile` + `Buffer.equals`), `PRAGMA journal_mode` still `delete`; Postgres migration tables unchanged.
  - `concurrency.test.ts`: node-sqlite — spawn two `node fixtures/writer.ts <path> <n>` processes (`--experimental-strip-types`), each inserting 500 logs, both exit 0, 1,000 rows; Postgres — 20 concurrent `withTransaction` with savepoints succeed.
  - `store-log.test.ts` / `store-telemetry.test.ts`: spec §4 store bullets (40,000 keep ids, category segments with `.`, `%`, `_`, unpaired IDs rejected, persistence across reopen).
  - `telemetry-adapters.test.ts`: `runStoreScenario` write then (after reopen) verify, with `AsyncLocalStorageContextManager`; all results ok.
  - `provider.test.ts`: `resolveDB(path)` and `resolveDB(postgresURL)` open working databases.
- [ ] **Step 2: Run** `rtk proxy pnpm run test:integration` with Docker running — Expected: FAIL until `tests/scenarios` and `backends.ts` exist, then PASS. Run again with `HOZON_INTEGRATION_BACKENDS=node-sqlite` and Docker stopped — Expected: PASS, Postgres not attempted.
- [ ] **Step 3: Implement** `backends.ts`, `scenarios/src/index.ts`, `docker-compose.yml` (`postgres:18-alpine`, port 5432, `POSTGRES_PASSWORD=hozon`; README line: `HOZON_POSTGRES_URL=postgres://postgres:hozon@localhost:5432/postgres`).
- [ ] **Step 4: CI.** Enable `integration-tests-dir: tests/integration` in `build-test.yml`. Create `test-platforms.yml` from `/Users/paul/dev/yulsi/tejika/.github/workflows/test-platforms.yml`: same matrix; steps build, then `pnpm run test:integration` with `HOZON_INTEGRATION_BACKENDS: ${{ matrix.os == 'ubuntu-latest' && 'node-sqlite,postgres' || 'node-sqlite' }}`.
- [ ] **Step 5: Run** `pnpm exec biome ci .` and `rtk proxy pnpm run test` — Expected: PASS (root `test` stays unit-only).
- [ ] **Step 6: Commit** `test: add integration suite and store scenario`

---

### Task 13: `@hozon/sqlocal` and web e2e

**Files:**
- Create: `packages/sqlocal/src/index.ts` (port), `tests/e2e-web/` mirroring `kokuin/tests/e2e-web` (`index.html`, `package.json`, `playwright.config.ts`, `tsconfig*.json`, `vite.config.ts`, `src/{main,App}.tsx`, `test/{conformance,persistence}.spec.ts`), `.github/workflows/e2e-web.yml`

**Interfaces:**
- Produces: `SQLocalAdapter({ database: string })` with getter `sqlocal`, `close()` → `sqlocal.destroy()` idempotent, `foreign_keys = ON` on connect. Deps: `@hozon/adapter`, `kysely`; peer `sqlocal`.

- [ ] **Step 1: Build the harness app.** `App.tsx`: on button `Run write phase` / `Run verify phase`: create `SQLocalAdapter({ database: 'hozon-e2e.sqlite3' })`, assert `(await adapter.sqlocal.getDatabaseInfo()).storageType === 'opfs'` (else render `Storage: NOT OPFS` and stop), run `runConformance` (fresh database name per case: `case-<n>.sqlite3`, deleted in cleanup) and `runStoreScenario({ phase, runID: 'web' })` with `StackContextManager`; render one row per result (`data-testid="result-<name>"`) and both summary lines. `vite.config.ts`: `sqlocal/vite` plugin; `preview.headers` and `server.headers` set `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`.
- [ ] **Step 2: Write Playwright specs:** `conformance.spec.ts` — click write, expect text `Conformance: OK` and `Stores: OK`; `persistence.spec.ts` — write, `page.reload()`, click verify, expect `Stores: OK`. Projects `chromium`, `firefox`, `webkit`; scripts `test` = `playwright test --project chromium --project firefox`, `test:webkit` = `playwright test --project webkit`.
- [ ] **Step 3: Run** `cd tests/e2e-web && pnpm run build && pnpm run test` — Expected: PASS on chromium and firefox. Run `pnpm run test:webkit` and record the outcome (pass / fail reason) for Task 16's `docs/reference/drivers.md`.
- [ ] **Step 4: Workflow** `e2e-web.yml`: kokuin's file (working-directory `tests/e2e-web`) plus an inline job `webkit` (`continue-on-error: true`, uses `TairuFramework/kigu/setup@main`, installs Playwright webkit with deps, runs `pnpm run test:webkit`, uploads `playwright-report` always).
- [ ] **Step 5: Commit** `feat(sqlocal): add SQLocal driver with web e2e harness`

---

### Task 14: `@hozon/expo` and mobile e2e

**Files:**
- Create: `packages/expo/src/{index,driver,serialize}.ts` (port), `packages/expo/test/serialize.test.ts`, `tests/e2e-expo/` mirroring `kokuin/tests/e2e-expo` (`App.tsx`, `app.json` with appId `dev.hozon.e2e`, `index.ts`, `package.json`, `tsconfig.json`, `.maestro/{conformance,persistence}.yaml`), `.github/workflows/e2e-ios.yml`, `.github/workflows/e2e-android.yml`

**Interfaces:**
- Produces: `ExpoAdapter({ database: string })`, `close()` awaits `closeAsync()` and is idempotent. Deps: `@hozon/adapter`, `kysely`; peer `expo-sqlite`.

- [ ] **Step 1: Write `serialize.test.ts`:** booleans → `1` / `0`; Dates → ISO string (kubun behaviour kept); Uint8Array passthrough.
- [ ] **Step 2: Run** — Expected: FAIL; port kubun files with the boolean fix and awaited close in `destroy()` / `close()`; run — Expected: PASS.
- [ ] **Step 3: Build the harness app** like Task 13's (buttons with `testID="write"` / `testID="verify"`, result rows `testID="result-<name>"`, summary `Text` elements), `ExpoAdapter({ database: 'hozon-e2e.db' })`, conformance cases on `case-<n>.db` deleted via `expo-sqlite`'s `deleteDatabaseAsync`, `StackContextManager`.
- [ ] **Step 4: Maestro flows:** `conformance.yaml` — `launchApp: { clearState: true }`, tap `write`, `assertVisible: "Conformance: OK.*"`, `assertVisible: "Stores: OK.*"`; `persistence.yaml` — `launchApp: { clearState: true }`, tap `write`, `stopApp`, `launchApp`, tap `verify`, `assertVisible: "Stores: OK.*"`.
- [ ] **Step 5: Run** locally on an iOS simulator / Android emulator (argent tooling available): `pnpm run ios:release && pnpm run test` — Expected: both flows pass.
- [ ] **Step 6: Workflows** `e2e-ios.yml` / `e2e-android.yml` = kokuin's files (working-directory `tests/e2e-expo`).
- [ ] **Step 7: Commit** `feat(expo): add Expo SQLite driver with mobile e2e harness`

---

### Task 15: Electron e2e

**Files:**
- Create: `tests/e2e-electron/` mirroring `kokuin/tests/e2e-electron` (`forge.config.ts`, `forge.env.d.ts`, `config/vite.{main,preload,renderer}.config.mts`, `index.html`, `package.json`, `playwright.config.ts`, `tsconfig.json`, `src/{main,preload,renderer,App,global.d}.ts(x)`, `test/{sqlite-available,conformance,restart}.test.ts`), `.github/workflows/e2e-desktop.yml`

**Interfaces:**
- Produces: IPC channel `hozon:run` (`(phase: ScenarioPhase) => { conformance: Array<ConformanceResult>; stores: Array<ConformanceResult> }`) and `hozon:sqlite-check` (`() => { ok: boolean; versions: NodeJS.ProcessVersions; error?: string }`), exposed via preload as `window.hozon.run` / `window.hozon.sqliteCheck`.

- [ ] **Step 1: Main process:** `hozon:sqlite-check` dynamically imports `node:sqlite`, opens `:memory:`, runs `SELECT 1`, closes, returns versions for diagnostics. `hozon:run` uses `NodeSQLiteAdapter` on `join(app.getPath('userData'), 'hozon-e2e.db')` for the scenario and temp files for conformance cases, `AsyncLocalStorageContextManager`. Mark `node:sqlite` external in `vite.main.config.mts`.
- [ ] **Step 2: Tests:** `sqlite-available.test.ts` expects `ok === true` (prints versions); `conformance.test.ts` clicks write, expects both OK lines; `restart.test.ts` writes, closes the app, relaunches the packaged binary, clicks verify, expects `Stores: OK`.
- [ ] **Step 3: Run** `cd tests/e2e-electron && node node_modules/electron/install.js && pnpm run package && pnpm run test` — Expected: PASS on macOS.
- [ ] **Step 4: Workflow** `e2e-desktop.yml` = kokuin's (working-directory `tests/e2e-electron`).
- [ ] **Step 5: Commit** `test: add Electron e2e harness`

---

### Task 16: Docs

**Files:**
- Modify: `docs/agents/architecture.md`, `docs/agents/development.md`, `README.md`
- Create: `docs/reference/{adapter,db,drivers,stores,telemetry}.md`, each package `README.md` (one paragraph + install + minimal usage)

- [ ] **Step 1: Write** `architecture.md` (package graph from spec §1, adapter / store model, preflight order, store transaction rule, test tiers), reference docs (public API per package with the signatures from Tasks 2–11; `drivers.md` includes pragmas, the WebKit outcome from Task 13, Node ≥ 24 boolean note; `stores.md` includes table schemas, category encoding, cursor format, retention semantics; `telemetry.md` includes context-manager setup per platform).
- [ ] **Step 2: Verify** links: `pnpm exec biome ci .` and manually open each relative link target (all exist).
- [ ] **Step 3: Commit** `docs: add architecture and reference docs`

---

### Task 17: Domain plugin

**Files:**
- Create: `.claude-plugin/marketplace.json`, `plugins/hozon/.claude-plugin/plugin.json`, `plugins/hozon/skills/{discover,database,drivers,telemetry}/SKILL.md` (from `kigu:discover-template`, structured like `/Users/paul/dev/yulsi/sozai/plugins/sozai`)
- Modify: `.claude/settings.json` (add `hozon` marketplace + `hozon@hozon`), root `package.json` (`check:skills` script and `skills-check.json` if sozai's pattern requires it for kigu's `skills-check` input)

- [ ] **Step 1: Instantiate** the discover template with domains `database` (HozonDB, StoreDefinition, migrations, transactions), `drivers` (choosing a driver, pragmas, platform notes), `telemetry` (stores, logtape sink, OTel exporter, retention); each skill points into `docs/reference/`.
- [ ] **Step 2: Verify** `rtk proxy pnpm run check:skills` (if added) — Expected: PASS; JSON files parse (`node -e 'JSON.parse(require("fs").readFileSync(p))'` per file).
- [ ] **Step 3: Commit** `feat: add hozon domain plugin`

---

### Task 18: Stack registration, push and first release

**Files:**
- Modify (kigu, branch `docs/hozon-spec`): `plugins/kigu/skills/stack-map/stack.json`, `docs/stack.md`
- Create (hozon): `.changeset/<intent>.md` per package (initial `0.1.0` intents per the `kigu:releasing` skill)

- [ ] **Step 1: kigu.** Add hozon to `stack.json` (`name: hozon`, `scope: @hozon`, `kanji: 保存`, `role: database layer: adapters, drivers, migrations, stores`, `repo: https://github.com/TairuFramework/hozon`, `docs: docs/`, `domainPlugin: hozon`, `dependsOn: [sozai]`); update `docs/stack.md` (repo count eight, a table row for hozon depending on `sozai`, diagram adds `hozon` under `sozai`). tejika → hozon and mokei → hozon edges are added by the tejika and mokei plans when those dependencies land, not here.
- [ ] **Step 2: Verify** `cd /Users/paul/dev/yulsi/kigu && node -e 'JSON.parse(require("fs").readFileSync("plugins/kigu/skills/stack-map/stack.json"))' && pnpm exec biome ci .` — Expected: PASS. Commit `docs: add hozon to stack map`.
- [ ] **Step 3: hozon release intents.** Load the `kigu:releasing` skill; create intents for all published packages at `0.1.0`; run `rtk proxy pnpm run build:ci && rtk proxy pnpm run test` — Expected: PASS. Commit `chore: add initial release intents`.
- [ ] **Step 4: Ask the user** before pushing `main` to `git@github.com:TairuFramework/hozon.git` and before publishing. On approval: `git push -u origin main`; wait for `build-test`, `test-platforms`, `e2e-*` to go green (`gh run list --repo TairuFramework/hozon`); then release per `kigu:releasing`.

---

## Self-review notes

- Spec §0 → Tasks 1, 12–15, 17; §1 → Tasks 2–11 (dependency lists in each Produces / Implement step); §2 → Tasks 2–4; §3 → Tasks 6, 7, 10, 11; §4 → Tasks 5, 8, 9, 12–15; §5 stack docs → Task 18; §5 tejika / mokei → separate plans.
- Plan addition beyond the spec: private package `hozon-test-scenarios` (shared store scenario) and `HozonDBClosedError` (Review Focus 3). Both are listed in Global Constraints / Task 4.
