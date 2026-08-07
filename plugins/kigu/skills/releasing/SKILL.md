---
name: releasing
description: Use when versioning, changelogging, or publishing packages in any stack repo - pnpm built-in versioning (11.13+), intent files, release commands, and the pitfalls of the changesets migration.
---

# Releasing

Versioning and publishing workflow for every repo in the TairuFramework stack. The build and
test workflow lives in the `kigu:development` skill.

## Commands

Releases use pnpm's built-in versioning (11.13+). No `@changesets/cli`, no
`.changeset/config.json` -- pnpm reads the same intent-file format and is configured under
`versioning:` in `pnpm-workspace.yaml`.

| Step | Command |
|------|---------|
| Record an intent | `pnpm change` (`--bump`/`--summary` to skip the prompts) |
| Preview the release plan | `pnpm change status` |
| Apply the plan | `pnpm version -r` (`--dry-run` to preview) |
| Publish | `pnpm run release` -- build, then `pnpm publish -r` |

`pnpm version -r` writes each package's `CHANGELOG.md`, rewrites internal dependency ranges, and
appends the consumed intents to `.changeset/ledger.yaml`. It never commits or tags in recursive
mode. `pnpm publish -r` skips `private: true` packages and versions already on the registry.

## Pitfalls

Four things bite, all of them silently:

- **Every publishable manifest needs `"publishConfig": { "access": "public" }`.** Changesets'
  `"access": "public"` has no pnpm counterpart, and scoped packages default to *restricted*. It
  only surfaces as a failure on a package's **first** publish.
- **Every private package must be listed in `versioning.ignore` by exact name.** Globs are not
  supported. An omitted one makes `pnpm change status` and `pnpm version -r` crash with
  `Cannot read properties of undefined (reading '<that package's version>')` as soon as a bump
  has to propagate into it.
- **Never keep a root `version` script.** It is an npm lifecycle hook name and fires during
  `pnpm version -r`. Remove it, do not rename it.
- **A never-published package lands at whatever its manifest already says** -- no intent bumps
  it, even in a release where everything else moves. The same run writes its `CHANGELOG.md`
  headed with the pre-bump version, so a manual bump has to fix the manifest *and* the changelog.

Set `versioning.changelog.storage: repository` to keep committed `CHANGELOG.md` files; the
default (`registry`) composes them at publish time instead.

## Policy

- Versioning is per-package -- no hard `versioning.fixed` lock unless a repo genuinely wants one
  (`enkaku` does). Coupled packages are bumped together by the releaser's judgement, and pnpm
  cascades a patch through the internal dependency graph on its own.
- Cross-repo dependencies are published `^` semver ranges, never `workspace:`. Develop across a
  repo boundary via a canary/prerelease publish.
- 1.0 promotion is per-repo, whole: a repo goes 1.0 as a unit once its surface is stable, and
  every package in it goes 1.0 together (SDK-bound packages included -- 1.0 is semver discipline,
  they can still major often).
