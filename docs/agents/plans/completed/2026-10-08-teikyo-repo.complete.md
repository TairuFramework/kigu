# teikyo: Production HTTP Server Layer for the Stack

**Status:** complete (rollout steps 1-4; step 5 tracked in `next/`)

## Goal

Give the stack one production-grade way to host HTTP services, replacing the hand-rolled
`new Hono()` + `@hono/node-server` setups (kubun, mokei, sakui, tejika) that lacked graceful drain,
readiness, request IDs, structured logging, tracing, timeouts and rate limiting. The kumiai hub and
mokei's MCP HTTP server are the acceptance consumers.

## What was built

- **`@sozai/http-server` (sozai, published 0.1.1):** `createServer` wraps a Hono app with a Node
  lifecycle, built-in middleware (request IDs, secure headers, structured logging, tracing,
  per-path body and timeout limits), `/health/live` and `/health/ready`, client-IP resolution
  with proxy trust, a staged shutdown sequence and a typed plugin contract.
- **teikyo repo (new, `@teikyo`, published 0.1.0):**
  - `@teikyo/hozon` (`'hozon:db'`): opens a hozon database for dependent plugins' stores.
  - `@teikyo/access` (`'access:grants'`, `'access:revocation'`): hozon-backed grant store with a
    generation-guarded cache feeding enkaku `AllowPredicate`, and a capability revocation backend
    feeding `VerifyTokenHook`.
  - `@teikyo/enkaku` (`'enkaku:rpc'`): `mountTransport` and `enkakuPlugin` over
    `@enkaku/http-serve`, with drain-ordered shutdown.
  - `@teikyo/rate-limit` (`'http:rate-limit'`): `hono-rate-limiter` keyed on client IP.
  - `@teikyo/oauth` (`'oauth:resource'`): mokei's JWKS and DID bearer verifiers moved here, with
    RFC 9728 protected-resource metadata and `requireBearer()`.
- **kigu stack docs:** teikyo in `stack-map/stack.json` and `docs/stack.md` (edges
  `sozai, kokuin, enkaku, hozon ← teikyo ← kumiai, mokei`); `check-skills.mjs` knows the new repos.
- **kumiai (merged, PR #61):** `@kumiai/hub-store` (hozon `HubStore`), `createHub` gains
  `verifyToken` and a tracked `dispose()`, and `@kumiai/hub-http` adds the `'kumiai:hub'` plugin
  that hosts the hub on teikyo.
- **mokei (merged, PR #77):** the `'mokei:mcp'` plugin wraps `createHTTPHandler` with graceful
  `HTTPHandler.shutdown()`; `serveHTTP` runs on `@sozai/http-server` with `@teikyo/oauth`, and
  mokei's own `auth/` module is gone.

## Key design decisions

- **Core in sozai, plugins in teikyo.** The Hono wrapper sits below enkaku, kokuin and hozon so the
  stack-aware plugin layer sits above them without a repo cycle. `@enkaku/http-serve` is
  unchanged; deployment policy belongs to teikyo.
- **Typed plugin tokens.** Plugin names carry their export type (`pluginName<Exports>()(name)`), so
  dependency types derive from the runtime `dependsOn`. Plugins reach each other only through
  declared dependencies, validated before startup; cleanup runs in reverse topological order.
- **Shutdown in stages.** Stop accepting, then `onShutdown` hooks end streams while sockets are
  still open (bounded by `graceMs`), then drain, then `onClose`. Long-lived routes (enkaku SSE,
  MCP) opt out of body and timeout limits per path.
- **Grants stay authoritative.** Grant-gated patterns replace caller access rules; overlapping
  configurations are rejected at setup. Store errors deny with a sanitized `Access denied`. The
  cache holds grant lookups only, never authorization results, and other processes observe changes
  within one TTL (default 5 s).
- **Revocation targets delegated capabilities.** Enkaku calls `VerifyTokenHook` only for
  delegation-chain tokens; removing direct access means revoking grants. Missing `jti` is rejected
  by default; lookup errors fail closed.
- **Own OAuth verifiers, not `hono/jwt`.** Hono's verifier rejects RFC 9068 `at+jwt` and requires
  `kid`. JWKS outages answer 503, not 401, so clients are not pushed into re-authorization.

## Out of scope

Changes to `@enkaku/http-serve`, admin RPC or CLI for grants, distributed rate-limit stores,
cross-process grant cache invalidation, TLS termination, static serving, Bun/Deno adapters.

## Follow-on

- `docs/agents/plans/next/2026-10-08-teikyo-contract-review.md`: release the consumers and run the
  contract review (rollout step 5).
- `docs/agents/plans/backlog/2026-10-08-teikyo-adoption.md`: tejika and kubun adoption.
