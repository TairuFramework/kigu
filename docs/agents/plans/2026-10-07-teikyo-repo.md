# teikyo: Production HTTP Server Layer for the Stack

**Status:** design approved — spec under review

## Goal

Give the stack one production-grade way to host HTTP services. Today six packages (kubun `hub`
and `plugin-http`, mokei `http-server`, sakui `runtime-http-server` and `daemon-host`, tejika
`server`) each hand-roll `new Hono()` + `@hono/node-server` `serve()` + a promise-wrapped
listen/close + `/health`, with none of the production concerns (graceful drain, readiness,
request IDs, structured logging, tracing, timeouts, rate limiting).

Two deliverables:

1. **`@sozai/http-server`** — a light core in sozai: a Hono app wrapped with a Node lifecycle,
   built-in production middleware, health endpoints, and a typed plugin contract.
2. **teikyo (提供, "to provide / serve")** — a new public stack repo, npm scope `@teikyo`,
   holding plugins that are enkaku-, kokuin- and hozon-aware: hozon database, access grants and
   token revocation stores, the enkaku RPC mount, rate limiting, and OAuth protected-resource
   auth.

Downstream repos (kumiai, mokei, later kubun) ship their own plugins against the same contract.

## Intent and success criteria

- **Consolidation, validated by real deployments.** The kumiai hub (blind E2EE relay) must be
  deployable as a production service, and mokei's MCP HTTP server must run on the same core.
- **Gate enkaku APIs with persistent access control.** Grants and revocations live in a hozon
  store and feed enkaku's existing `AllowPredicate` and `verifyToken` hooks.
- **Consistent plugin relations.** Plugins only reach each other through declared dependencies,
  validated before anything starts.
- **Prefer Hono built-ins and established Hono middleware** over custom code.

## Stack placement

```
sozai  ──  @sozai/http-server (new package)
  ▲
kokuin, enkaku, hozon
  ▲
teikyo (new repo) — depends on sozai, kokuin, enkaku, hozon
  ▲
kumiai, mokei (plugins, follow-up plans) · later tejika, kubun
```

The core must sit below enkaku so the plugin layer can sit above it without a repo-level cycle.
sozai's role ("core utilities + external-library wrappers") fits a Hono wrapper; the Hono
dependency is isolated to the one package.

`@enkaku/http-serve` is unchanged. It is the server half of enkaku's HTTP wire protocol (paired
with `@enkaku/http-fetch`), is runtime-agnostic, and keeps its protocol-intrinsic bounds
(`maxSessions`, `maxInflightRequests`, `maxRequestBodySize`, `maxSessionBufferBytes`,
`allowedOrigin`). Deployment policy (rate limiting, access stores, lifecycle, health,
observability) belongs to teikyo. Production deployments of enkaku over HTTP go through
`@teikyo/enkaku` plus the generic teikyo plugins; http-serve's README points there.

## `@sozai/http-server`

Dependencies: `hono`, `@hono/node-server`, `@hono/otel`, `get-port`, `@sozai/async`,
`@sozai/log`, `@sozai/otel`. Node-only lifecycle; the Hono `app` itself stays runtime-agnostic.

### `createServer`

```ts
type CreateServerParams = {
  plugins?: Array<HTTPPlugin<any, any, any>>
  port?: number | GetPortOptions    // GetPortOptions = get-port `Options`. number: bind exactly;
                                    // options: passed to get-port.
                                    // Omitted: getPort({ port: 3000 })
  hostname?: string
  trustProxy?: boolean              // honour X-Forwarded-For / incoming x-request-id
  limits?: { bodyBytes?: number; requestTimeoutMs?: number }
  health?: { livePath?: string; readyPath?: string; checkTimeoutMs?: number }
  graceMs?: number                  // drain budget on dispose
  logger?: Logger
  tracer?: Tracer
  signal?: AbortSignal              // parent signal, chained via DisposerParams.signal
}

declare function createServer(params: CreateServerParams): Promise<HTTPServer>

declare class HTTPServer extends Disposer {
  readonly app: Hono
  readonly url: string              // set after listen()
  listen(): Promise<void>           // resolves once bound; rejects on bind error
  close(reason?: unknown): Promise<void>   // alias of dispose()
  handleSignals(): () => void       // opt-in SIGTERM/SIGINT → dispose; returns unsubscribe
}
```

`HTTPServer` extends `Disposer` from `@sozai/async`: `dispose()` runs the drain sequence,
`disposed` resolves when shutdown completes, `signal` aborts when shutdown begins, and
`await using` is supported.

`createServer` validates the plugin graph and runs every plugin's `setup` before returning; it
does not bind. `listen()` binds.

### Built-in middleware

On by default, each configurable or disableable:

| Concern | Implementation |
|---|---|
| Request ID | `hono/request-id` (incoming header honoured only when `trustProxy`) |
| Access log | small custom middleware writing to `@sozai/log` (`hono/logger` is console-only) |
| Tracing | `@hono/otel` (W3C `traceparent` extraction, server spans) |
| Body limit | `hono/body-limit` with `limits.bodyBytes` |
| Timeout | `hono/timeout` with `limits.requestTimeoutMs` |
| Security headers | `hono/secure-headers` |
| Errors | core `onError`: `HTTPException` → its response; anything else → JSON 500 with request ID, stack logged only |

Plugins needing client IPs use `@hono/node-server/conninfo` (respecting `trustProxy`); CORS on
plugin routes uses `hono/cors`; streaming uses `hono/streaming` (`streamSSE`).

### Health

- `GET /health/live` — 200 while the process is up.
- `GET /health/ready` — 200 when all plugin readiness checks pass; 503 with per-plugin results
  otherwise, and always 503 once disposal has begun. Each check times out after
  `checkTimeoutMs` (default 2000); a timeout counts as failing.

### Lifecycle and drain order

`dispose()`:

1. Readiness flips to failing.
2. Stop accepting new connections.
3. Abort `signal` (plugins and long-lived streams observe it).
4. Run plugin `onClose` hooks in reverse setup order. Sockets are still open, so a plugin can
   flush final stream writes (mokei's `subscriptions/listen` terminals depend on this).
5. Wait for in-flight requests to finish, bounded by `graceMs`.
6. Force-close remaining sockets; resolve `disposed`.

`onClose` rejections and post-listen server `error` events are logged, never thrown; dispose
always runs to completion.

### Plugin contract

```ts
type HTTPPlugin<
  Name extends string = string,
  Exports = void,
  Deps extends Record<string, unknown> = {},   // dependency name → its Exports type
> = {
  name: Name
  dependsOn?: Array<keyof Deps & string>
  setup(ctx: PluginContext<Deps>): Exports | Promise<Exports>
}

type PluginContext<Deps> = {
  app: Hono
  logger: Logger                 // child logger tagged with the plugin name
  tracer: Tracer
  signal: AbortSignal            // server shutdown
  addReadinessCheck(check: () => boolean | Promise<boolean>): void   // attributed to plugin
  onClose(fn: () => void | Promise<void>): void
  use<N extends keyof Deps & string>(name: N): Deps[N]
}
```

Rules:

- **One export per plugin** — the return value of `setup`. Dependents read it with
  `ctx.use(name)`.
- **`use` is restricted to declared dependencies.** Enforced by the `Deps` type at compile time
  and by a runtime throw for untyped callers.
- **Graph validation before any `setup`:** unique names, every `dependsOn` present, no cycles.
  Plugins then run in topological order (ties keep list order). Errors name the plugin and the
  offending dependency.
- **Setup failure** rejects `createServer` and runs `onClose` for already-set-up plugins.
- **Names are roles, not implementations** — `<scope>:<role>`, e.g. `'hozon:db'`,
  `'enkaku:rpc'`. Swapping an implementation keeps the name. Each plugin package exports its
  name constant and its `Exports` type so dependents can type `Deps` without importing the
  implementation.
- **No auto-prefixing.** A plugin wanting a prefix mounts a sub-app (`app.route(path, sub)`).
- Plugins are produced by factory functions (`xPlugin(options)`) returning plain objects; a
  factory may compute `dependsOn` from its options.

## teikyo packages

Repo scaffolded from the kigu conventions (`@kigu/dev`, kigu marketplace and plugin, shared CI).

### `@teikyo/hozon` — `'hozon:db'`

- `hozonDBPlugin({ db: string | Adapter, tablePrefix? })` — strings resolved via `@hozon/provider`
  `resolveDB` (`:memory:`, `postgres://…`, sqlite path).
- Exports `HozonDB`. Dependents `register()` their own stores during `setup`.
- Readiness: trivial query. `onClose`: close the database.

### `@teikyo/access` — `'access:grants'`, `'access:revocation'`

Both depend on `'hozon:db'`.

- **Grant store** (hozon `StoreDefinition`, table `grants`): `subject` (DID), `pattern`
  (procedure pattern, matched with `@kokuin/capability` semantics), `expires_at?`,
  `created_at`, `created_by`. API: `grant`, `revoke`, `list`, `check(did, procedure)`.
- `'access:grants'` exports `{ store, allow(): AllowPredicate }`. `allow` checks `payload.iss`;
  failing that, `payload.sub` combined with `ctx.verifyDelegation()`. Results are cached
  in-memory with a short TTL (configurable; default 5 s). A store error denies (fail closed) and
  is logged.
- **Revocation store**: hozon-backed `RevocationBackend` (`add`, `get(jti)`) for
  `@kokuin/capability`'s `createRevocationChecker`. `'access:revocation'` exports
  `{ backend, verifyToken: VerifyTokenHook }`. A lookup error rejects the token (fail closed).
- Not HTTP middleware: enkaku authenticates every message by its signed token, so HTTP never
  sees an identity.

### `@teikyo/enkaku` — `'enkaku:rpc'`

- `mountTransport(app, path, transportOptions)` — creates an `@enkaku/http-serve`
  `ServerTransport`, registers `app.all(path, …)`, returns the transport. For consumers whose own
  factory calls `serve()` (kumiai's `createHub`).
- `enkakuPlugin({ path, protocol, handlers, identity, accessRules?, transport?, access?: { grants?: true | Array<string>, revocation?: true } })`
  - `mountTransport` + `@enkaku/server` `serve()`, passing the HTTP server's `signal` so the
    enkaku server disposes with it.
  - `access.grants` adds `'access:grants'` to `dependsOn` and wires `allow()` into the rules
    (`'*'` for `true`, or the listed patterns). `access.revocation` adds `'access:revocation'`
    and wires `verifyToken`.
  - CORS is configured only through the transport's `allowedOrigin`; no `hono/cors` on this path.
  - Exports `{ server, transport }`.

### `@teikyo/rate-limit` — `'http:rate-limit'`

- Thin plugin over `hono-rate-limiter`: per-client-IP limits (IP via conninfo, honouring
  `trustProxy`), in-memory store by default, store pluggable. 429 with `Retry-After`.
- Transport-level only. Per-identity limits stay in the application (kumiai `createHub` already
  has `rateLimits`).

### `@teikyo/oauth` — `'oauth:resource'`

Replaces mokei's `http-server/src/auth/` module.

- `oauthResourcePlugin({ resource, authorizationServers, mode })` registers the RFC 9728
  protected-resource metadata route and exports
  `{ requireBearer(opts?: { scopes?: Array<string> }): MiddlewareHandler }`.
- **JWKS mode**: signature and claim checks by `hono/jwk` (`alg` allowlist, `kid` match,
  `exp`/`nbf`/`iat`, `iss`/`aud`). Its `keys` option is an async function backed by a teikyo
  JWKS cache that adds what `hono/jwk` lacks: RFC 8414 discovery of `jwks_uri` from the issuer,
  TTL caching (`hono/jwk` fetches on every request), refresh on unknown `kid` at most once per
  `minRefreshIntervalSeconds`, fetch timeout and response size cap. A JWKS fetch failure yields
  401 `invalid_token` and is logged.
- **DID mode**: verification with `@kokuin/token` `verifyToken`, for `did:key`-signed tokens.
- Both modes set `c.var.auth: AuthInfo` and respond 401/403 with an RFC 6750
  `WWW-Authenticate` header including the RFC 9728 `resource_metadata` parameter.
- Clock-skew tolerance: none (`hono/jwk` has no leeway option). Documented; servers are expected
  to be NTP-synced.

## Downstream acceptance consumers

Implemented in follow-up plans in their own repos; their shape is fixed here so the teikyo
contract is validated against them.

- **kumiai**
  - `@kumiai/hub-store`: hozon `StoreDefinition` implementing `HubStore`, passing the
    hub-protocol store tests on `:memory:` sqlite and Postgres.
  - `'kumiai:hub'` plugin: `dependsOn: ['hozon:db']` (optionally `'access:grants'`), uses
    `mountTransport` and `createHub({ transport, identity, store, accessRules, authorize })`,
    exports `{ registry, server }`. A generic hub HTTP server independent of kubun.
- **mokei**
  - `'mokei:mcp'` plugin wrapping `createHTTPHandler`; `onClose` awaits `handler.dispose()`.
    With auth, depends on `'oauth:resource'` and applies `requireBearer()`.
  - `auth/` removed; `serveHTTP` becomes a thin wrapper over `createServer` + the plugin. SSE
    moves to `streamSSE` where it fits.

## Out of scope

- Changes to `@enkaku/http-serve`.
- tejika `server` migration (later: a `loopbackGate` plugin on `@sozai/http-server`) — backlog.
- kubun adoption (later: kubun `plugin-http` hosting teikyo, other kubun plugins injecting
  routes; consuming kumiai hub primitives) — backlog.
- Admin RPC or CLI for managing grants; distributed rate-limit stores; config/env loader;
  TLS termination (reverse proxy); static/SPA serving; Bun/Deno lifecycle adapters.

## Error handling summary

- Startup fails fast: plugin graph errors, `setup` errors and bind errors reject with the plugin
  named; already-set-up plugins are disposed.
- Request errors: plugins throw `HTTPException`; the core owns the error envelope.
- Runtime and `onClose` errors are logged; dispose always completes.
- Access and revocation fail closed.

## Testing

vitest throughout, following the stack conventions.

- **`@sozai/http-server`**: graph validation and ordering; `use()` restricted to declared
  dependencies; real-socket lifecycle (port from `get-port`), including drain order (an
  `onClose` can write to an open stream before sockets close), `graceMs` force-close,
  `await using`, parent `signal`; readiness 503 during drain; error envelope and request-ID
  propagation; `trustProxy` on/off.
- **`@teikyo/hozon`, `@teikyo/access`**: stores on `:memory:` sqlite; Postgres through hozon's
  testcontainers setup, gated in CI as hozon does.
- **`@teikyo/enkaku`**: end-to-end with `@enkaku/client` + `@enkaku/http-fetch`: allow and deny
  via grants, delegated `sub`, revocation; disposal propagation; CORS headers set once.
- **`@teikyo/oauth`**: local JWKS fixture server: one fetch across N requests, `kid` rotation,
  timeout and size caps, `resource_metadata` in `WWW-Authenticate`, scopes; DID mode; mokei's
  existing auth test cases ported.
- **`@teikyo/rate-limit`**: 429 with `Retry-After`; IP resolution with `trustProxy` on/off.
- **teikyo `tests/integration`**: one server wiring `hozon:db`, `access:grants`,
  `access:revocation`, `enkaku:rpc` and `http:rate-limit` — the kumiai hub deployment shape,
  without depending on kumiai.

## Rollout

1. `@sozai/http-server` in sozai; release.
2. teikyo repo: scaffold, then `@teikyo/hozon`, `@teikyo/access`, `@teikyo/enkaku`,
   `@teikyo/rate-limit`, `@teikyo/oauth`, integration tests; publish 0.1.0. Claim the `@teikyo`
   npm scope first (availability unconfirmed; `TairuFramework/teikyo` is free on GitHub).
3. kigu stack docs: add teikyo to `stack-map/stack.json` and `docs/stack.md` (edges
   `sozai, kokuin, enkaku, hozon ← teikyo ← kumiai, mokei`).
4. Follow-up plans: kumiai (`hub-store` + `'kumiai:hub'`), mokei (`'mokei:mcp'` + OAuth
   migration).
