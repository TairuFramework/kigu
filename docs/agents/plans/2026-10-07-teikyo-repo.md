# teikyo: Production HTTP Server Layer for the Stack

**Status:** design approved — spec under review (revised after Codex review)

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

- `trustProxy: false` — socket peer address; forwarding headers ignored.
- Otherwise the peer must itself be trusted (hop count or CIDR match). The resolver then walks
  `X-Forwarded-For` **right to left**, skipping trusted hops, and returns the first untrusted
  address. A malformed entry stops the walk and yields the last trusted-validated address.
  Left-most values are never trusted blindly.
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

### Shutdown sequence

One deadline (`graceMs`) starts when `dispose()` is called. `signal` is a **notification** that
shutdown has begun; plugins release resources only in `onClose`.

1. **Notify** (immediate, inherited from `Disposer`): `signal` aborts; readiness reports 503.
2. **Stop**: the Node server stops accepting connections; idle keep-alive connections close.
3. **Drain**: wait for in-flight requests *and* active response bodies (tracked by the core) to
   finish, until the deadline. Plugins owning long-lived streams end them gracefully when
   `signal` aborts (final SSE events, terminal frames) — sockets are still open during this
   phase.
4. **Force**: at the deadline, remaining sockets are destroyed.
5. **Cleanup**: `onClose` hooks run in **reverse topological order** — dependents before their
   dependencies — so `'hozon:db'` closes only after every plugin using it has closed. Each hook
   is awaited, bounded by `closeHookTimeoutMs`; a rejection or timeout is logged and the sequence
   continues.
6. `disposed` resolves.

Post-listen server `error` events are logged, never thrown.

### Plugin contract

Plugin names are typed tokens carrying their export type, so dependency types are derived from the
runtime `dependsOn` declaration instead of being declared separately:

```ts
type PluginName<Name extends string, Exports> = Name & { readonly __exports?: Exports }
declare function pluginName<Exports>(): <Name extends string>(name: Name) => PluginName<Name, Exports>

// e.g. in @teikyo/hozon:
export const HOZON_DB = pluginName<HozonDB>()('hozon:db')

declare function definePlugin<
  Name extends string,
  Exports,
  const Deps extends ReadonlyArray<PluginName<string, unknown>> = [],
>(plugin: {
  name: PluginName<Name, Exports> | Name
  dependsOn?: Deps
  setup(ctx: PluginContext<Deps>): Exports | Promise<Exports>
}): HTTPPlugin<Name, Exports, Deps>

type PluginContext<Deps> = {
  app: Hono                       // this plugin's own sub-app; register routes during setup
  middleware(handler: MiddlewareHandler, path?: string): void   // global middleware phase
  limits(pathPrefix: string, overrides: { bodyBytes?: number | false; timeoutMs?: number | false }): void
  clientIP(c: Context): string
  logger: Logger                  // child logger tagged with the plugin name
  tracer: Tracer
  signal: AbortSignal             // shutdown notification
  addReadinessCheck(check: () => boolean | Promise<boolean>): void   // attributed to plugin
  onClose(fn: () => void | Promise<void>): void
  use<D extends Deps[number]>(name: D): ExportsOf<D>   // only names in dependsOn
}
```

Rules:

- **One export per plugin** — the return value of `setup`. Dependents read it with
  `ctx.use(TOKEN)`.
- **`use` is restricted to `dependsOn`.** The context type only admits tokens from the declared
  tuple; a runtime throw backs this up for untyped callers.
- **Graph validation before any `setup`:** unique names, every `dependsOn` present, no cycles.
  Plugins then run in topological order (ties keep list order). Errors name the plugin and the
  offending dependency.
- **Registration phases.** Hono applies middleware and routes in registration order, so a route
  registered before a middleware would bypass it. The core therefore assembles the app after all
  `setup` calls: (1) core built-in middleware, (2) all plugin `ctx.middleware` handlers in
  topological order, (3) each plugin's sub-app mounted with `app.route('/', sub)` in topological
  order, (4) health routes. Routes must be registered during `setup` (Hono copies a sub-app's
  routes when it is mounted).
- **Rollback.** `onClose` registrations are tracked as they happen — including those of a plugin
  whose `setup` then throws. A `setup` failure, a parent `signal` abort during setup, or a
  `listen()` bind failure runs the cleanup phase over everything registered so far, then rejects.
- **Names are roles, not implementations** — `<scope>:<role>`, e.g. `'hozon:db'`,
  `'enkaku:rpc'`. Swapping an implementation keeps the name. Each plugin package exports its
  name token so dependents type against it without importing the implementation.
- **No auto-prefixing.** A plugin wanting a prefix registers routes under it on its sub-app.
- Plugins are produced by factory functions (`xPlugin(options)`) built with `definePlugin`; a
  factory may compute `dependsOn` from its options.

## teikyo packages

Repo scaffolded from the kigu conventions (`@kigu/dev`, kigu marketplace and plugin, shared CI).

### `@teikyo/hozon` — `'hozon:db'`

- `hozonDBPlugin({ db: string | Adapter, tablePrefix? })` — strings resolved via `@hozon/provider`
  `resolveDB` (`:memory:`, `postgres://…`, sqlite path).
- Exports `HozonDB`. Dependents `register()` their own stores during `setup`.
- Readiness: trivial query. `onClose`: close the database — by construction the last cleanup
  hook for any plugin depending on it.

### `@teikyo/access` — `'access:grants'`, `'access:revocation'`

Both depend on `'hozon:db'`.

**Grants.**

- Grant store (hozon `StoreDefinition`, table `grants`): `subject` (DID), `pattern` (procedure
  pattern, matched with `@kokuin/capability` semantics), `expires_at?`, `created_at`,
  `created_by`. API: `grant`, `revoke`, `list`, `check(did, procedure)`.
- `'access:grants'` exports `{ store, allow(): AllowPredicate }`. `allow` checks `payload.iss`;
  failing that, `payload.sub` combined with `ctx.verifyDelegation()`.
- **Store errors throw** from the predicate. Enkaku propagates a thrown predicate error as a
  denial; returning `false` would instead fall through to other matching rules.
- **Cache**: only normalized grant lookups are cached — the set of active grants per subject DID
  — never a full authorization result. Delegation is verified on every request. An entry expires
  at the earlier of the TTL (default 5 s, configurable) and the earliest `expires_at` among its
  grants. A local `grant`/`revoke` invalidates the subject's entry on commit. Other processes
  observe a change within one TTL; documented.

**Rule composition with enkaku.** Enkaku access rules are alternatives: a predicate returning
`false` falls through to the next matching pattern, and any matching `allow: true` admits. To
keep grants authoritative, `enkakuPlugin` builds the rules so that **grant-gated patterns replace
caller rules**: setup rejects a configuration where a caller `accessRules` pattern overlaps a
grant-gated pattern. Tokens whose `sub` is the server identity are authorized by enkaku's
capability branch alone (`checkCapability`, independent of procedure rules); the grant store
does not apply to them, documented as the operator-capability path.

**Revocation.**

- Scope: **revoking delegated capabilities**. Enkaku invokes `VerifyTokenHook` only while
  verifying capability tokens in a delegation chain, not on every RPC message. Removing a DID's
  direct access is done by revoking its grants.
- Revocation store: hozon-backed `RevocationBackend` (`add`, `get(jti)`) for
  `@kokuin/capability`'s `createRevocationChecker`. `'access:revocation'` exports
  `{ backend, verifyToken: VerifyTokenHook }`.
- Capabilities without a `jti` cannot be revoked; with `requireJTI: true` (default) the hook
  rejects them. A lookup error rejects the token (fail closed).

These are not HTTP middleware: enkaku authenticates every message by its signed token, so HTTP
never sees an identity.

### `@teikyo/enkaku` — `'enkaku:rpc'`

- `mountTransport(ctx, path, transportOptions)` — creates an `@enkaku/http-serve`
  `ServerTransport`, registers `all(path, …)` on the plugin's sub-app, sets
  `ctx.limits(path, { bodyBytes: false, timeoutMs: false })` (the transport enforces its own
  body limit; SSE sessions are long-lived), and returns the transport. For consumers whose own
  factory calls `serve()` (kumiai's `createHub`).
- `enkakuPlugin({ path, protocol, handlers, identity, accessRules?, transport?, access?: { grants?: true | Array<string>, revocation?: true } })`
  - `mountTransport` + `@enkaku/server` `serve()`.
  - `access.grants` adds `'access:grants'` to `dependsOn` and gates `'*'` (for `true`) or the
    listed patterns with `allow()`, rejecting overlapping caller rules (see above).
    `access.revocation` adds `'access:revocation'` and wires `verifyToken`.
  - `onClose` awaits the enkaku server's disposal; reverse topological cleanup guarantees this
    completes before `'access:*'` and `'hozon:db'` close.
  - CORS is configured only through the transport's `allowedOrigin`; no `hono/cors` on this path.
  - Exports `{ server, transport }`.

### `@teikyo/rate-limit` — `'http:rate-limit'`

- Thin plugin over `hono-rate-limiter`, registered through `ctx.middleware` so it precedes every
  plugin route regardless of plugin order. Keys on `ctx.clientIP(c)`; in-memory store by default,
  store pluggable. 429 with `Retry-After`.
- Transport-level only. Per-identity limits stay in the application (kumiai `createHub` already
  has `rateLimits`).

### `@teikyo/oauth` — `'oauth:resource'`

Replaces mokei's `http-server/src/auth/` module and keeps its guarantees.

- `oauthResourcePlugin({ resource, authorizationServers, mode })` registers the RFC 9728
  protected-resource metadata route and exports
  `{ requireBearer(opts?: { scopes?: Array<string> }): MiddlewareHandler }`.
- **Required claims** (both modes): `exp` required; `sub` required; `iss` must exactly equal a
  configured issuer; `aud` must contain `resource`; `nbf`/`iat` checked when present; scopes
  checked when requested. No clock-skew tolerance (documented; servers are expected to be
  NTP-synced).
- **JWKS mode.**
  - Signature verification with `hono/jwt` `verifyWithJwks`, called with keys the plugin has
    already resolved (never with `jwks_uri`, which Hono fetches per request with no timeout or
    size cap). `alg` allowlist required; symmetric algorithms rejected.
  - Per-issuer key cache: the token's unverified `iss` selects a configured issuer; keys are
    never pooled across issuers. RFC 8414 discovery of `jwks_uri` from the issuer; discovered
    metadata `issuer` must match exactly; HTTPS required except on loopback; redirects
    rejected; fetch timeout and response size cap; TTL caching; refresh on unknown `kid` at most
    once per `minRefreshIntervalSeconds`.
  - **Outages are not credential failures**: discovery/JWKS fetch errors return 503 (logged), not
    401, so clients are not pushed into needless re-authorization.
- **DID mode**: verification with `@kokuin/token` `verifyToken`; the issuer DID must satisfy a
  configured policy (`allowedIssuers` list or predicate), and `aud` must contain `resource`.
- Both modes set `c.var.auth: AuthInfo`; credential failures respond 401/403 with an RFC 6750
  `WWW-Authenticate` header including the RFC 9728 `resource_metadata` parameter.

## Downstream acceptance consumers

Implemented in follow-up plans in their own repos; their shape is fixed here so the teikyo
contract is validated against them.

- **kumiai**
  - `@kumiai/hub-store`: hozon `StoreDefinition` implementing `HubStore`, passing the
    hub-protocol store tests on `:memory:` sqlite and Postgres.
  - **Required `createHub` extension**: accept `verifyToken` (forwarded to `serve()`) and expose
    awaited teardown of its enkaku server (today `createHub` accepts neither `verifyToken` nor
    `signal`, and its internal `serve()` forwards neither).
  - `'kumiai:hub'` plugin: depends on `'hozon:db'` (optionally `'access:grants'`,
    `'access:revocation'`), uses `mountTransport` and the extended `createHub`, awaits hub
    teardown in `onClose`, exports `{ registry, server }`. Tested against the real hub with grants
    and revocation. A generic hub HTTP server independent of kubun.
- **mokei**
  - `'mokei:mcp'` plugin wrapping `createHTTPHandler`. The plugin owns (or is handed) the durable
    subscription hub explicitly; on `signal` it calls the owner's graceful completion
    (`endAllGracefully()`) during the drain phase so subscription terminals reach clients, and
    `onClose` awaits `handler.dispose()`. With auth, depends on `'oauth:resource'` and applies
    `requireBearer()`.
  - `auth/` removed; `serveHTTP` becomes a thin wrapper over `createServer` + the plugin. SSE
    moves to `streamSSE` where it fits; MCP routes set `timeoutMs: false`.

## Out of scope

- Changes to `@enkaku/http-serve`.
- tejika `server` migration (later: a `loopbackGate` plugin on `@sozai/http-server`) — backlog.
- kubun adoption (later: kubun `plugin-http` hosting teikyo, other kubun plugins injecting
  routes; consuming kumiai hub primitives) — backlog.
- Admin RPC or CLI for managing grants; distributed rate-limit stores; cross-process grant cache
  invalidation; config/env loader; TLS termination (reverse proxy); static/SPA serving; Bun/Deno
  lifecycle adapters.

## Error handling summary

- Startup fails fast: plugin graph errors, `setup` errors, parent abort during setup and bind
  errors run cleanup over everything registered so far (including the failing plugin's hooks),
  then reject with the plugin named.
- Request errors: plugins throw `HTTPException`; the core owns the error envelope.
- Shutdown: one deadline for stop + drain; cleanup hooks individually bounded; errors logged;
  dispose always completes.
- Access fails closed: grant store errors throw (denial), revocation lookup errors reject the
  token, capabilities without `jti` are rejected by default.
- OAuth: invalid credentials → 401/403 with challenge; key infrastructure outages → 503.

## Testing

vitest throughout, following the stack conventions.

- **`@sozai/http-server`**
  - Graph validation and ordering; `use()` restricted to `dependsOn` (type tests + runtime).
  - Registration phases: a plugin listed before the rate limiter still has its routes limited
    (regression for route-before-middleware bypass).
  - Per-path `limits` overrides, including `false`.
  - Client IP: `trustProxy` false / hops / CIDR; spoofed left-most `X-Forwarded-For` entries
    ignored; untrusted peer's headers ignored; request-ID honouring.
  - Real-socket lifecycle (port from `get-port`): drain order (a stream ended on `signal` delivers
    its final write before sockets close), one deadline across stop + drain, force-close,
    reverse-topological cleanup, per-hook timeout, `await using`, parent `signal`.
  - Rollback: failing `setup` runs its own registered hooks; bind failure rolls back.
  - Readiness 503 during shutdown; error envelope and request-ID propagation.
- **`@teikyo/hozon`, `@teikyo/access`**: stores on `:memory:` sqlite; Postgres through hozon's
  testcontainers setup, gated in CI as hozon does. Grant cache expiry at grant `expires_at`,
  invalidation on local mutation; store outage throws.
- **`@teikyo/enkaku`**: end-to-end with `@enkaku/client` + `@enkaku/http-fetch`: allow and deny
  via grants; delegated `sub`; overlapping caller rule rejected at setup; revoked delegated
  capability denied; capability without `jti` denied; disposal awaited before DB close; CORS
  headers set once; no duplicate body buffering on the RPC path.
- **`@teikyo/oauth`**: local JWKS fixture server: one fetch across N requests, `kid` rotation,
  timeout and size caps, HTTPS/redirect/issuer-mismatch rejection, per-issuer key isolation,
  missing `exp`/`sub`/wrong `aud` rejected, 503 on JWKS outage, `resource_metadata` in
  `WWW-Authenticate`, scopes; DID mode with issuer policy; mokei's existing auth test cases
  ported.
- **`@teikyo/rate-limit`**: 429 with `Retry-After`; keyed on the core client-IP resolver.
- **teikyo `tests/integration`**: one server wiring `hozon:db`, `access:grants`,
  `access:revocation`, `enkaku:rpc` and `http:rate-limit` — the kumiai hub deployment shape,
  without depending on kumiai — including graceful shutdown under load.

## Rollout

1. `@sozai/http-server` in sozai; release.
2. teikyo repo: scaffold, then `@teikyo/hozon`, `@teikyo/access`, `@teikyo/enkaku`,
   `@teikyo/rate-limit`, `@teikyo/oauth`, integration tests; publish 0.1.0. Claim the `@teikyo`
   npm scope first (availability unconfirmed; `TairuFramework/teikyo` is free on GitHub).
3. kigu stack docs: add teikyo to `stack-map/stack.json` and `docs/stack.md` (edges
   `sozai, kokuin, enkaku, hozon ← teikyo ← kumiai, mokei`).
4. Follow-up plans: kumiai (`hub-store`, `createHub` extension, `'kumiai:hub'`), mokei
   (`'mokei:mcp'` + OAuth migration).
