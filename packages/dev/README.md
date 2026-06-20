# @kigu/dev

One devDependency that brings the whole toolchain (Biome, SWC, TypeScript,
Turbo, Vitest, tsx, del-cli) plus the `@kigu` config packages.

```jsonc
// a repo's package.json
{
  "devDependencies": { "@kigu/dev": "^0.1.0" }
}
```

Then extend the configs: `@kigu/tsconfig/base.json`, `["@kigu/biome"]`,
`@kigu/swc/swc.json`.
