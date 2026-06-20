# @kigu/biome

Shared Biome config.

```json
// a repo's biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.5.0/schema.json",
  "extends": ["@kigu/biome"],
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true }
}
```

Note: per-repo settings like `vcs` stay local; the shared base carries formatter + linter rules.
