# @kigu/dev

One devDependency that brings the whole toolchain (Biome, SWC, TypeScript,
Turbo, Vitest, tsx, del-cli) and the shared configs in one package, so the
tools and the configs they drive stay in sync.

```jsonc
// a repo's package.json
{
  "devDependencies": { "@kigu/dev": "^0.1.0" }
}
```

Then extend the configs:

- **TypeScript** — `"extends": "@kigu/dev/tsconfig.json"`
- **Biome** — `"extends": ["@kigu/dev/biome.json"]`
- **SWC** — `"extends": "@kigu/dev/swc.json"`

Note: the tsconfig sets `"types": []`, so ambient type packages are opt-in —
add e.g. `"types": ["node"]` in a package that uses Node.js globals.

## Skills check

`kigu-check-skills` validates a repo's Claude Code plugin under `plugins/<name>/skills`.
Run it from the repo root, in a pre-commit hook and in CI.

Always checked: every skill has a `SKILL.md` with frontmatter; `name` matches the
directory and is bare (the plugin supplies the namespace, so `name: sozai:dataflow`
would resolve as `/sozai:sozai:dataflow`); `description` is present; `` `reference/*.md` ``
pointers resolve; `<own>:<skill>` references name a real skill; scoped package names
exist under `packages/`; and cross-repo skill references are limited to an allowlist.
Skill references inside fenced code blocks are exempt — they illustrate a shape rather
than point at anything.

Opt in per repo: `cap` (maximum lines per `.md` file) and `forbidCodeBlocks` (keep
`SKILL.md` a thin routing layer, with code in `reference/`).

State the policy once in `skills-check.json` at the repo root:

```json
{
  "cap": 120,
  "forbidCodeBlocks": true,
  "allow": ["kigu"]
}
```

Flags override the file — `kigu-check-skills --help` lists them.
