# teikyo: Production HTTP Server Layer for the Stack

**Status:** design approved — spec under review (revised after two Codex reviews)

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
   capability revocation stores, the enkaku RPC mount, rate limiting, and OAuth
   protected-resource auth.

Downstream repos (kumiai, mokei, later kubun) ship their own plugins against the same contract.

## Intent and success criteria

- **Consolidation, validated by real deployments.** The kumiai hub (blind E2EE relay) must be
  deployable as a production service, and mokei's MCP HTTP server must run on the same core.
- **Gate enkaku APIs with persistent access control.** Grants and capability revocations live in
  a hozon store and feed enkaku's existing `AllowPredicate` and `verifyToken` hooks.
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
  plugins?: Array<AnyHTTPPlugin>
  port?: number | GetPortOptions    // GetPortOptions = get-port `Options`. number: bind exactly;
                                    // options: passed to get-port.
                                    // Omitted: getPort({ port: 3000 })
  hostname?: string
  trustProxy?: TrustProxy           // default false
  limits?: { bodyBytes?: number; requestTimeoutMs?: number }   // global defaults, on by default
  health?: { livePath?: string; readyPath?: string; checkTimeoutMs?: number }
  graceMs?: number                  // shutdown deadline for stop + drain (default 10_000)
  closeHookTimeoutMs?: number       // per onClose hook bound (default 5_000)
  logger?: Logger
  tracer?: Tracer
  signal?: AbortSignal              // parent signal, chained via DisposerParams.signal
}

// false: never trust forwarding headers; client IP = socket peer.
// number: trust that many proxy hops (right-to-left in X-Forwarded-For).
// Array<string>: trust peers whose address matches one of these IPs/CIDRs.
type TrustProxy = false | number | Array<string>

declare function createServer(params: CreateServerParams): Promise<HTTPServer>

declare class HTTPServer extends Disposer {
  readonly app: Hono
  readonly url: string              // set after listen()
  listen(): Promise<void>           // resolves once bound; on bind error disposes, then rejects
  close(reason?: unknown): Promise<void>   // alias of dispose()
  handleSignals(): () => void       // opt-in SIGTERM/SIGINT → dispose; returns unsubscribe
  readonly shutdownReport?: ShutdownReport   // set once disposed resolves
}
```

`HTTPServer` extends `Disposer` from `@sozai/async`: `dispose()` runs the shutdown sequence,
`disposed` resolves when shutdown completes, `signal` aborts as soon as shutdown begins (inherited
`Disposer` semantics), and `await using` is supported.

`createServer` validates the plugin graph, runs every plugin's `setup`, then assembles the app
(see *Registration phases*) before returning; it does not bind. `listen()` binds.

### Client IP and proxy trust

`@hono/node-server/conninfo` only reads the socket peer address and ignores forwarding headers,
so the core owns one resolver, `getClientIP(c)`, also exposed as `ctx.clientIP(c)`:

- Addresses are normalized first (IPv4-mapped IPv6 `::ffff:a.b.c.d` → `a.b.c.d`).
- The chain is `[socketPeer, ...reverse(XFF entries)]` — nearest hop first.
- `trustProxy: false` — client IP is `socketPeer`; forwarding headers ignored.
- `trustProxy: n` (hop count) — the first `n` chain entries are trusted proxies; the client IP is
  chain entry `n` (so `1` returns the rightmost XFF entry). If the chain is shorter than `n + 1`
  (direct connection or truncated header), the client IP is the last chain entry. Hop-count trust
  assumes every request arrives through exactly that many proxies; deployments where direct
  connections are possible must use CIDR trust.
- `trustProxy: Array<cidr>` — walk the chain from `socketPeer`, skipping entries whose address
  matches a trusted CIDR; the first non-matching entry is the client IP. Trust is address-based
  only.
- A malformed XFF entry (not an IP) aborts the walk and the client IP falls back to `socketPeer`
  — never to an interior proxy address. Left-most values are never trusted blindly.
- Deployments behind a proxy must have the proxy overwrite (not append to) client-supplied
  `X-Forwarded-For`, or rely on hop-count trust; documented in the README.
- Incoming `x-request-id` is honoured only when the peer is trusted.

All IP-based plugins (rate limit, IP restriction) use this resolver.

### Built-in middleware

Applied globally before any plugin route (see *Registration phases*):

| Concern | Implementation |
|---|---|
| Request ID | `hono/request-id` (incoming header only from trusted peers) |
| Access log | small custom middleware writing to `@sozai/log` (`hono/logger` is console-only) |
| Tracing | `@hono/otel` (W3C `traceparent` extraction, server spans) |
| Body limit | `hono/body-limit` with `limits.bodyBytes`, subject to per-path overrides |
| Response deadline | `hono/timeout` with `limits.requestTimeoutMs`, subject to per-path overrides |
| Security headers | `hono/secure-headers` |
| Errors | core `onError`: `HTTPException` → its response; anything else → JSON 500 with request ID, stack logged only |

**Body limit and timeout are on by default; plugins opt out or adjust per path** with
`ctx.limits(pathPrefix, { bodyBytes?: number | false, timeoutMs?: number | false })`. The core
middleware picks the most specific matching prefix. Semantics to keep in mind:

- `hono/timeout` is a *response deadline*: it races the handler without cancelling it, and does
  not bound a streaming body once the response has started. Stream lifetime and idle policy
  belong to the plugin that owns the stream; streaming routes should set `timeoutMs: false`.
- `hono/body-limit` buffers chunked bodies; a route whose handler enforces its own limit (the
  enkaku transport) sets `bodyBytes: false` to avoid duplicate buffering.

CORS on plugin routes uses `hono/cors`; streaming uses `hono/streaming` (`streamSSE`).

### Health

- `GET /health/live` — 200 while the process is up.
- `GET /health/ready` — 200 when all plugin readiness checks pass; 503 with per-plugin results
  otherwise, and always 503 once shutdown has begun. Each check times out after
  `checkTimeoutMs` (default 2000); a timeout counts as failing.
- Health paths are reserved: registered after core middleware but **before** any plugin
  middleware or route, so plugin catch-alls cannot shadow them and plugin middleware (rate
  limiting, auth) never gates them. Core middleware that does apply: request ID, tracing, security
  headers (access log optional via `health.log`). A plugin route colliding with a health path is
  rejected at setup.

### Shutdown sequence

One deadline (`graceMs`) starts when `dispose()` is called and is armed before anything awaits
`server.close()` (active SSE connections keep `close()` pending indefinitely). Plugins have two
distinct hooks:

- `ctx.onShutdown(fn)` — **graceful stream termination**, run during drain while sockets are
  still open: stop accepting new work on long-lived channels, send final events or terminal
  frames, end streams. Must not release shared resources.
- `ctx.onClose(fn)` — **resource release**, run after sockets are gone.

Sequence:

1. **Notify** (immediate, inherited from `Disposer`): `signal` aborts; readiness reports 503.
2. **Stop**: the Node server stops accepting connections (idle keep-alive connections are closed
   by Node's `server.close()` on the adapter's Node baseline).
3. **Drain**: run all `onShutdown` hooks concurrently, then wait for in-flight requests *and*
   active response bodies to finish, until the deadline. Response bodies are tracked by the
   outgoing `ServerResponse` `finish`/`close` events — `app.fetch` resolving is not enough,
   because the adapter keeps consuming the response body afterward.
4. **Force**: at the deadline, remaining sockets are destroyed.
5. **Cleanup**: `onClose` hooks run in **reverse topological order** — dependents before their
   dependencies. Each hook is awaited, bounded by `closeHookTimeoutMs` (a plugin may request a
   longer budget at registration, e.g. enkaku's own cleanup timeout). A hook that times out keeps
   running in the background — it is *not* considered closed. Its dependencies' hooks still run
   (shutdown must complete), and the overlap is logged as an error naming both plugins.
6. `disposed` resolves; `HTTPServer.shutdownReport` records per-plugin outcome (`closed`,
   `failed`, `timed-out`) and whether the drain deadline forced sockets closed.

Post-listen server `error` events are logged, never thrown. Full task tracking and cancellation of
timed-out hooks are out of scope; the report makes the degradation visible instead of hiding it.

### Plugin contract

Plugin names are typed tokens carrying their export type, so dependency types are derived from the
runtime `dependsOn` declaration instead of being declared separately (shape checked against
TS 6.0.3 with `verbatimModuleSyntax` and `noUncheckedIndexedAccess`):

```ts
type PluginName<Name extends string, Exports> = Name & { readonly __exports?: Exports }
type AnyPluginName = PluginName<string, unknown>
type ExportsOf<T> = T extends PluginName<string, infer E> ? E : never

declare function pluginName<Exports>(): <Name extends string>(name: Name) => PluginName<Name, Exports>

// e.g. in @teikyo/hozon:
export const HOZON_DB = pluginName<HozonDB>()('hozon:db')

type HTTPPlugin<Name extends string, Exports, Deps extends ReadonlyArray<AnyPluginName>> = {
  readonly name: PluginName<Name, Exports>
  readonly dependsOn: Deps
  setup(ctx: PluginContext<Deps>): Exports | Promise<Exports>
}
// Type-erased form accepted by createServer
type AnyHTTPPlugin = {
  readonly name: string
  readonly dependsOn: ReadonlyArray<string>
  setup(ctx: PluginContext<ReadonlyArray<AnyPluginName>>): unknown
}

declare function definePlugin<
  Name extends string,
  Exports,
  const Deps extends ReadonlyArray<AnyPluginName> = [],
>(plugin: {
  name: PluginName<Name, Exports> | Name
  dependsOn?: Deps
  setup(ctx: PluginContext<Deps>): Exports | Promise<Exports>
}): HTTPPlugin<Name, Exports, Deps>

type RouteMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'all'
type Limits = { bodyBytes?: number | false; timeoutMs?: number | false }

type PluginContext<Deps extends ReadonlyArray<AnyPluginName>> = {
  route(method: RouteMethod, path: string, ...handlers: Array<Handler | MiddlewareHandler>): void
  middleware(handler: MiddlewareHandler, path?: string): void   // global middleware phase
  limits(pathPrefix: string, overrides: Limits): void
  clientIP(c: Context): string
  logger: Logger                  // child logger tagged with the plugin name
  tracer: Tracer
  signal: AbortSignal             // shutdown notification
  addReadinessCheck(check: () => boolean | Promise<boolean>): void   // attributed to plugin
  onShutdown(fn: () => void | Promise<void>): void                  // drain phase
  onClose(fn: () => void | Promise<void>, opts?: { timeoutMs?: number }): void   // cleanup phase
  use<D extends Deps[number]>(name: D): ExportsOf<D>   // only names in dependsOn
}
```

Type fixtures (`test-d` files) cover: export inference from `setup`, `ctx.use` accepting declared
tokens and rejecting undeclared ones, `AnyHTTPPlugin` assignability.

Rules:

- **One export per plugin** — the return value of `setup`. Dependents read it with
  `ctx.use(TOKEN)`.
- **`use` is restricted to `dependsOn`.** The context type only admits tokens from the declared
  tuple; a runtime throw backs this up for untyped callers.
- **Graph validation before any `setup`:** unique names, every `dependsOn` present, no cycles.
  Plugins then run in topological order (ties keep list order). Errors name the plugin and the
  offending dependency.
- **No raw app access; route-scoped middleware only.** Plugins never see a Hono instance.
  `ctx.route` registers a route with its own handler chain (per-route middleware such as
  `requireBearer()` goes there); `ctx.middleware` is the only way to affect other routes. This
  prevents a plugin's `use('*')` from gating sibling plugins, and prevents plugins from replacing
  the error envelope. The root app owns `onError` and `notFound`.
- **Registration phases.** Hono dispatches in registration order, so the core records plugin
  registrations during `setup` and assembles the root app afterwards: (1) core built-in
  middleware, (2) health routes (see *Health*), (3) all plugin `ctx.middleware` handlers in
  topological order, (4) all plugin routes in topological order. Registrations after `setup`
  returns throw.
- **Setup and rollback are serialized.** `setup` calls run one at a time. A `setup` failure, a
  parent `signal` abort, or a `listen()` bind failure triggers rollback: no further `setup`
  starts; if one is in progress, rollback waits for it to settle (its late `onClose`
  registrations are still collected); then the cleanup phase runs over every `onClose` registered
  so far — including the failing plugin's — and `createServer`/`listen()` rejects only after
  cleanup completes.
- **Names are roles, not implementations** — `<scope>:<role>`, e.g. `'hozon:db'`,
  `'enkaku:rpc'`. Swapping an implementation keeps the name. Each plugin package exports its
  name token so dependents type against it without importing the implementation.
- **No auto-prefixing.** A plugin wanting a prefix registers its routes under it.
- Plugins are produced by factory functions (`xPlugin(options)`) built with `definePlugin`; a
  factory may compute `dependsOn` from its options.

## teikyo packages

Repo scaffolded from the kigu conventions (`@kigu/dev`, kigu marketplace and plugin, shared CI).

### `@teikyo/hozon` — `'hozon:db'`

- `hozonDBPlugin({ db: string | Adapter, tablePrefix? })` — strings resolved via `@hozon/provider`
  `resolveDB` (`:memory:`, `postgres://…`, sqlite path).
- Exports `HozonDB`. Dependents `register()` their own stores during `setup`.
- Readiness: trivial query. `onClose`: close the database — ordered after every dependent's
  `onClose` (see *Shutdown sequence* for the timed-out-hook caveat).

### `@teikyo/access` — `'access:grants'`, `'access:revocation'`

Both depend on `'hozon:db'`.

**Grants.**

- Grant store (hozon `StoreDefinition`, table `grants`): `subject` (DID), `pattern` (procedure
  pattern, validated and matched with `@kokuin/capability` semantics), `expires_at?`,
  `created_at`, `created_by`. API: `grant`, `revoke`, `list`, `check(did, procedure)`.
- `'access:grants'` exports `{ store, allow(): AllowPredicate }`. `allow` checks `payload.iss`;
  failing that, `payload.sub` combined with `ctx.verifyDelegation()`.
- **Store errors deny without leaking.** Enkaku turns a thrown predicate error into
  `ACCESS_DENIED` and copies the error's `message` to the client. The predicate therefore logs the
  store error locally and throws `new Error('Access denied', { cause })`. (Returning `false`
  would instead fall through to other matching rules.)
- **Cache**: only normalized grant lookups are cached — the set of active grants per subject DID
  — never a full authorization result. Delegation is verified on every request. An entry expires
  at the earlier of the TTL (default 5 s, configurable) and the earliest `expires_at` among its
  grants. Each subject has a generation counter: a local `grant`/`revoke` bumps it on commit and
  drops the entry, and a refill that started under an older generation is discarded rather than
  stored (prevents a concurrent read from re-caching revoked grants). Other processes observe a
  change within one TTL; documented.

**Rule composition with enkaku.** Enkaku access rules are alternatives: a predicate returning
`false` falls through to the next matching pattern, and any matching `allow: true` admits. To
keep grants authoritative, `enkakuPlugin` builds the rules so that **grant-gated patterns replace
caller rules**: setup rejects a configuration where a caller `accessRules` pattern overlaps a
grant-gated pattern. Overlap is decidable because patterns are restricted to exact names and
suffix wildcards (`foo/*`, which also matches `foo`, per `@kokuin/capability` `patterns.ts`): two
patterns overlap when either matches the other's prefix under the existing matcher. Both inputs
are validated first; no general glob engine. Tokens whose `sub` is the server identity are
authorized by enkaku's capability branch alone (`checkCapability`, independent of procedure
rules); the grant store does not apply to them, documented as the operator-capability path.

**Revocation.**

- Scope: **revoking delegated capabilities**. Enkaku invokes `VerifyTokenHook` only while
  verifying capability tokens in a delegation chain, not on every RPC message. Removing a DID's
  direct access is done by revoking its grants.
- Revocation store: hozon-backed `RevocationBackend` (`add`, `get(jti)`) for
  `@kokuin/capability`'s `createRevocationChecker`. `'access:revocation'` exports
  `{ backend, verifyToken: VerifyTokenHook }`.
- Capabilities without a `jti` cannot be revoked; with `requireJTI: true` (default) the hook
  rejects them. A lookup error rejects the token (fail closed, sanitized message as above).

These are not HTTP middleware: enkaku authenticates every message by its signed token, so HTTP
never sees an identity.

### `@teikyo/enkaku` — `'enkaku:rpc'`

- `mountTransport(ctx, path, transportOptions)` — creates an `@enkaku/http-serve`
  `ServerTransport`, registers `ctx.route('all', path, …)`, sets
  `ctx.limits(path, { bodyBytes: false, timeoutMs: false })` (the transport enforces its own
  body limit; SSE sessions are long-lived), and returns the transport. For consumers whose own
  factory calls `serve()` (kumiai's `createHub`).
- `enkakuPlugin({ path, protocol, handlers, identity, accessRules?, transport?, access?: { grants?: true | Array<string>, revocation?: true } })`
  - `mountTransport` + `@enkaku/server` `serve()`.
  - `access.grants` adds `'access:grants'` to `dependsOn` and gates `'*'` (for `true`) or the
    listed patterns with `allow()`, rejecting overlapping caller rules (see above).
    `access.revocation` adds `'access:revocation'` and wires `verifyToken`.
  - **`onShutdown`** (drain, sockets open): starts disposal of the enkaku server — in-flight
    handlers settle within enkaku's cleanup timeout — then disposes the transport, which ends
    open SSE sessions (they otherwise stay open after the last RPC result).
  - **`onClose`**: awaits the enkaku server's `disposed`, registered with
    `timeoutMs` = enkaku's cleanup timeout so the budget is not cut short; reverse topological
    cleanup orders it before `'access:*'` and `'hozon:db'`.
  - CORS is configured only through the transport's `allowedOrigin`; no `hono/cors` on this path.
  - Exports `{ server, transport }`.

### `@teikyo/rate-limit` — `'http:rate-limit'`

- Thin plugin over `hono-rate-limiter`, registered through `ctx.middleware` so it precedes every
  plugin route regardless of plugin order (health routes are registered earlier and are never
  limited). Keys on `ctx.clientIP(c)`; in-memory store by default, store pluggable. 429 with
  `Retry-After`.
- Transport-level only. Per-identity limits stay in the application (kumiai `createHub` already
  has `rateLimits`).

### `@teikyo/oauth` — `'oauth:resource'`

**Moves mokei's `http-server/src/auth/` verifiers into teikyo** (`createJWKSVerifier`,
`createDIDVerifier`, `decodeJWT`, `assertStandardClaims`, `scopesFromClaim`, with their tests)
rather than building on `hono/jwt`: Hono's verifier only accepts a missing or `"JWT"` `typ`
header (rejecting RFC 9068 `at+jwt` access tokens) and always requires `kid`. No upstream change
is pursued; no new crypto dependency.

- `oauthResourcePlugin({ resource, authorizationServers, mode })` registers the RFC 9728
  protected-resource metadata route and exports
  `{ requireBearer(opts?: { scopes?: Array<string> }): MiddlewareHandler }` (applied per route
  via `ctx.route`).
- **JWKS mode** (claim policy for authorization-server access tokens):
  - `typ` absent, `JWT` or `at+jwt`; `alg` allowlist required, symmetric algorithms rejected.
  - Key selection by `kid`; when the token has no `kid`, falls back only if the issuer's key set
    holds exactly one key matching the algorithm (mokei's current policy), otherwise rejected.
  - Required: `exp`, `sub`; `iss` exactly equal to a configured authorization server; `aud`
    contains `resource`; `nbf`/`iat` checked when present; scopes checked when requested.
    Clock-skew tolerance keeps the verifier's `toleranceSeconds` (default 30).
  - Per-issuer key cache: the token's unverified `iss` selects a configured issuer; keys are
    never pooled across issuers. RFC 8414 discovery; discovered `issuer` must match exactly;
    HTTPS required except on loopback; redirects rejected; fetch timeout and response size cap;
    TTL caching; refresh on unknown `kid` at most once per `minRefreshIntervalSeconds`.
  - **Outages are not credential failures**: discovery/JWKS fetch errors return 503 (logged), not
    401, so clients are not pushed into needless re-authorization.
- **DID mode** (claim policy for self-issued DID tokens), unchanged from mokei:
  - Verification with `@kokuin/token` `verifyToken`; the verified `iss` DID is the identity —
    `AuthInfo.subject = iss`. `sub` is not required; a `sub` different from `iss` is rejected
    (no delegation support in this mode).
  - Issuer policy: `allowedIssuers` list **or** predicate (either; not "exact configured issuer").
  - `aud` must contain `resource`; `exp` required.
- Both modes set `c.var.auth: AuthInfo`; credential failures respond 401/403 with an RFC 6750
  `WWW-Authenticate` header including the RFC 9728 `resource_metadata` parameter.

## Downstream acceptance consumers

Implemented in follow-up plans in their own repos; their shape is fixed here so the teikyo
contract is validated against them. The teikyo contract is considered unstable (0.x) until both
plugins below run on it.

- **kumiai**
  - `@kumiai/hub-store`: hozon `StoreDefinition` implementing `HubStore`, passing the
    hub-protocol store tests on `:memory:` sqlite and Postgres.
  - **Required `createHub` extensions**: accept `verifyToken` and forward it to `serve()`; a
    hub-level `dispose()` that stops scheduling purge and wake work, waits for in-flight purge and
    wake tasks (today launched untracked) to settle, then disposes the enkaku server. The existing
    `server` disposal alone is insufficient; no additional server-disposal API is added.
  - `'kumiai:hub'` plugin: depends on `'hozon:db'` (optionally `'access:grants'`,
    `'access:revocation'`), uses `mountTransport` and the extended `createHub`; `onShutdown`
    begins hub disposal, `onClose` awaits it; exports `{ registry, server }`. Tested against the
    real hub with grants and revocation. A generic hub HTTP server independent of kubun.
- **mokei**
  - `'mokei:mcp'` plugin wrapping `createHTTPHandler`. The plugin owns (or is handed) the durable
    subscription hub explicitly. `onShutdown` ends **all** subscription state gracefully: the
    hub's `endAllGracefully()` for stateless subscriptions, and each session server's
    subscriptions (owned separately per session) — so terminals reach clients while sockets are
    open. `onClose` awaits `handler.dispose()`. With auth, depends on `'oauth:resource'` and
    applies `requireBearer()` on its routes.
  - `auth/` removed (moved to `@teikyo/oauth`); `serveHTTP` becomes a thin wrapper over
    `createServer` + the plugin. SSE moves to `streamSSE` where it fits; MCP routes set
    `timeoutMs: false`.

## Out of scope

- Changes to `@enkaku/http-serve`.
- tejika `server` migration (later: a `loopbackGate` plugin on `@sozai/http-server`) — backlog.
- kubun adoption (later: kubun `plugin-http` hosting teikyo, other kubun plugins injecting
  routes; consuming kumiai hub primitives) — backlog.
- Admin RPC or CLI for managing grants; distributed rate-limit stores; cross-process grant cache
  invalidation; task tracking/cancellation of timed-out cleanup hooks; config/env loader; TLS
  termination (reverse proxy); static/SPA serving; Bun/Deno lifecycle adapters.

## Error handling summary

- Startup fails fast: plugin graph errors, `setup` errors, parent abort during setup and bind
  errors serialize with any running setup, run cleanup over everything registered so far
  (including the failing plugin's hooks), then reject with the plugin named.
- Request errors: plugins throw `HTTPException`; the root app owns the error envelope and
  `notFound`.
- Shutdown: one deadline for stop + drain; `onShutdown` ends streams while sockets are open;
  cleanup hooks individually bounded; timed-out hooks are reported, not treated as closed;
  dispose always completes and records a `ShutdownReport`.
- Access fails closed without leaking internals: store and revocation-lookup errors deny with a
  generic message (original kept as `cause`, logged); capabilities without `jti` are rejected by
  default.
- OAuth: invalid credentials → 401/403 with challenge; key infrastructure outages → 503.

## Testing

vitest throughout, following the stack conventions.

- **`@sozai/http-server`**
  - Graph validation and ordering; `use()` restricted to `dependsOn` (type fixtures + runtime).
  - Registration phases: a plugin listed before the rate limiter still has its routes limited;
    a plugin's route-scoped middleware does not gate sibling plugins; registrations after
    `setup` throw.
  - Health: a plugin catch-all does not shadow `/health/*`; rate limiting never applies to
    health; colliding plugin route rejected.
  - Per-path `limits` overrides, including `false`.
  - Client IP: `trustProxy` false / hops (including short chains) / CIDR; IPv4-mapped IPv6
    normalization; spoofed left-most `X-Forwarded-For` entries ignored; malformed entry falls back
    to the socket peer; untrusted peer's headers ignored; request-ID honouring.
  - Real-socket lifecycle (port from `get-port`): an `onShutdown` hook delivers a final SSE event
    before sockets close; drain waits on response `finish`/`close`, not `app.fetch`; deadline
    armed before `server.close()` with an open SSE stream; force-close; reverse-topological
    cleanup; per-hook timeout and custom budget; `ShutdownReport` contents; `await using`;
    parent `signal`.
  - Rollback: failing `setup` runs its own registered hooks; parent abort during an awaited
    `setup` waits for it and cleans its late registrations; bind failure rolls back.
  - Readiness 503 during shutdown; error envelope, `notFound` and request-ID propagation.
- **`@teikyo/hozon`, `@teikyo/access`**: stores on `:memory:` sqlite; Postgres through hozon's
  testcontainers setup, gated in CI as hozon does. Grant cache expiry at grant `expires_at`;
  invalidation on local mutation; the concurrent refill-vs-revoke race (a refill started before
  a revoke must not re-cache); store outage denies with a generic message; pattern overlap
  detection (exact vs wildcard, `foo/*` vs `foo`).
- **`@teikyo/enkaku`**: end-to-end with `@enkaku/client` + `@enkaku/http-fetch`: allow and deny
  via grants; delegated `sub`; overlapping caller rule rejected at setup; revoked delegated
  capability denied; capability without `jti` denied; client sees no store error detail; open
  SSE session ended during drain; disposal awaited before DB close; CORS headers set once; no
  duplicate body buffering on the RPC path.
- **`@teikyo/oauth`**: mokei's existing auth tests ported, plus: `at+jwt` accepted; missing-`kid`
  single-key fallback and multi-key rejection; one JWKS fetch across N requests; `kid` rotation;
  timeout and size caps; HTTPS/redirect/issuer-mismatch rejection; per-issuer key isolation;
  missing `exp`/`sub`/wrong `aud` rejected in JWKS mode; DID mode with `sub` absent accepted,
  `sub ≠ iss` rejected, list and predicate issuer policies; 503 on JWKS outage;
  `resource_metadata` in `WWW-Authenticate`; scopes.
- **`@teikyo/rate-limit`**: 429 with `Retry-After`; keyed on the core client-IP resolver.
- **teikyo `tests/integration`**: one server wiring `hozon:db`, `access:grants`,
  `access:revocation`, `enkaku:rpc` and `http:rate-limit` — the kumiai hub deployment shape,
  without depending on kumiai — including graceful shutdown under load.

## Rollout

1. `@sozai/http-server` in sozai; release (0.x).
2. teikyo repo: scaffold, then `@teikyo/hozon`, `@teikyo/access`, `@teikyo/enkaku`,
   `@teikyo/rate-limit`, `@teikyo/oauth`, integration tests; publish 0.1.0. Claim the `@teikyo`
   npm scope first (availability unconfirmed; `TairuFramework/teikyo` is free on GitHub).
3. kigu stack docs: add teikyo to `stack-map/stack.json` and `docs/stack.md` (edges
   `sozai, kokuin, enkaku, hozon ← teikyo ← kumiai, mokei`).
4. Follow-up plans: kumiai (`hub-store`, `createHub` extensions, `'kumiai:hub'`), mokei
   (`'mokei:mcp'` + OAuth migration).
5. Contract review once both consumer plugins run: fold any changes back into
   `@sozai/http-server` and teikyo, and cut abstractions neither consumer used, before either is
   considered stable.
