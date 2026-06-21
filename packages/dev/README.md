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
