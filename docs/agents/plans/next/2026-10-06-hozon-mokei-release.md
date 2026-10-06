# hozon rollout step 3: mokei adoption release

Context: `docs/agents/plans/completed/2026-10-06-hozon-repo.complete.md`.

mokei PR #76 (branch `feat/hozon`) moves mokei onto hozon, and CI on it is green:
- `flow-host-node` drops its hand-rolled SQLite layer and uses hozon run and task stores;
- `@mokei/flow-host` uses `@hozon/otel` and `@hozon/logtape` instead of its own exporter and sink;
- a new `@mokei/app-node` package owns the single `mokei.db`, the `mokei.json` config and the telemetry setup;
- `MOKEI_CONFIG_PATH` overrides the config location, `--config-path` points at `mokei.json` and `--flows-config-path` at `flows.json`.

## Remaining

- Merge PR #76.
- Release:
  - `pnpm version -r`;
  - the user runs `pnpm run release`;
  - every bump is a patch: `@mokei/app-node`, `@mokei/flow-host-node`, `@mokei/flow-host` and `mokei`.
- Update the mokei node in kigu's stack map if its hozon / tejika edges need refreshing after the release.

## Parked minors (low priority)

- `@mokei/app-node` telemetry setup rollback swallows cleanup errors. Only the setup error reaches the caller, which is behaviour inherited from the earlier flow-host-node telemetry.
- The trace store facade's JSON normalisation has no explicit tests.
