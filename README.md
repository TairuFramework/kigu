# kigu (器具)

Shared tooling hub: a published build/lint/compile config preset (`@kigu/dev`,
bundling the Biome/SWC/TypeScript configs alongside the toolchain) and a Claude
Code plugin marketplace (workflow skills, conventions, discover template).

The `stack-map` skill (`plugins/kigu/skills/stack-map/stack.json`) is the cross-repo index:
every stack repo with its scope, GitHub URL, docs path, and dependencies.

See `docs/repo-split-design.md` for the architecture this supports.
