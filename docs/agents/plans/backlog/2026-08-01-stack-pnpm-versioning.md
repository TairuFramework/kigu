# Move the stack off Changesets to pnpm's native versioning

**Priority:** low — nothing is broken; kumiai is the pilot and has proven the shape.
**Origin:** kumiai `chore/pnpm-native-versioning`, 2026-08-01.
**Status (2026-08-07):** kumiai, sozai and kokuin are migrated. Only `enkaku` is left. The shape
is now documented in the `kigu:releasing` skill, so the notes below are history, not the spec.

pnpm 11.13+ ships release management that reads the Changesets intent format, so `@changesets/cli`
buys nothing. kumiai migrated: `versioning:` block in `pnpm-workspace.yaml`, `.changeset/config.json`
deleted, `pnpm change` / `pnpm version -r` / `pnpm publish -r` replacing the Changesets commands.

Remaining repo, with its current Changesets config:

- `enkaku` — `fixed: [["@enkaku/*"]]`, a real lock that `versioning.fixed` expresses directly

Done:

- `kumiai` — pilot, 2026-08-01.
- `sozai` — `fixed: []`, `linked: []`.
- `kokuin` — `fixed: []`, `linked: []`; migrated 2026-08-07. Hit the private-package crash below,
  which the kumiai notes did not cover.

Four things bite in any migration and are worth copying rather than rediscovering:

- Every private package must appear in `versioning.ignore` **by exact name** — globs are not
  supported. An omitted one makes `pnpm change status` and `pnpm version -r` die with
  `Cannot read properties of undefined (reading '<that package's version>')` the moment a bump has
  to propagate into it. kokuin's `tests/*` workspace packages hit this.

- Changesets' `"access": "public"` has no pnpm counterpart. Scoped packages default to **restricted**
  under `pnpm publish -r`, so every publishable manifest needs
  `"publishConfig": { "access": "public" }` — it only shows up as a failure on a package's *first*
  publish.
- A root `version` script is an npm lifecycle hook name and fires during `pnpm version -r`. Remove
  it, do not rename it.
- A package that has never been published lands at the version already written in its manifest,
  verbatim — no intent bumps it, even in a release where every other package moves. `pnpm version -r`
  also writes that package's `CHANGELOG.md` in the same run, headed with the pre-bump manifest
  version, so a hand-edit of the manifest alone leaves the changelog heading wrong. The manual bump
  needs to fix both files, and a version-band check script needs to say so if it only reads
  manifests.

kumiai also added a version-band rule (`scripts/check-versions.mjs`) that pnpm cannot express — its
`fixed` locks the full version and `epics` bands majors numerically. That part is kumiai's choice,
not a stack requirement; `enkaku` genuinely wants `fixed`.

Take this up once a real kumiai release has gone out on the new tooling.
