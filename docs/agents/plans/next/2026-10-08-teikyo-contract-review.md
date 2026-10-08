# teikyo contract review

Rollout step 5 of teikyo (see [the completed summary](../completed/2026-10-08-teikyo-repo.complete.md)).
`@sozai/http-server` and every `@teikyo/*` package stay unstable (0.x) until this is done.

1. Release the consumers: kumiai (`@kumiai/hub-store`, `@kumiai/hub-http`, `createHub` extensions) and
   mokei (`@mokei/http-server` with `'mokei:mcp'`, a breaking minor). Both are merged but not
   published.
2. Review the contract against both running plugins. Fold changes back into `@sozai/http-server`
   and teikyo, and cut abstractions neither consumer used. Known input: mokei's `serveHTTP` reads
   the handler back through a throwaway `'mokei:serve'` plugin because `HTTPServer` does not expose
   plugin exports; decide whether it should.
