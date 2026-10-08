# teikyo adoption beyond kumiai and mokei

Deferred from teikyo (see [the completed summary](../completed/2026-10-08-teikyo-repo.complete.md)).

- **tejika `server`:** move onto `@sozai/http-server`, with a `loopbackGate` plugin for local-only
  access.
- **kubun:** `plugin-http` hosts teikyo, other kubun plugins inject routes, and the hub consumes
  kumiai hub primitives. Needs its own spec.
- **sakui:** `runtime-http-server` and `daemon-host` hand-roll the same Hono lifecycle.
