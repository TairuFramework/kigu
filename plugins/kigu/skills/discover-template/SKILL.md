---
name: discover-template
description: Use when setting up a new stack repo's local discover skill - a template for progressive capability discovery that each repo instantiates with its own domains.
---

# Discover template

Copy this into a runtime repo's local plugin as `skills/discover/SKILL.md` and
replace every `{{...}}` slot. The instantiated skill is the entry point agents
use to explore that repo's capabilities.

## Frontmatter to use in the instantiated skill

```yaml
---
name: discover
description: Use when exploring {{REPO_NAME}} capabilities - progressive discovery of this repo's domain skills.
---
```

## Body template

```markdown
# {{REPO_NAME}} discovery

{{ONE_LINE_REPO_PURPOSE}}

## Domains

Load the domain skill matching your task:

{{#each DOMAINS}}
- `/{{REPO_SLUG}}:{{this.slug}}` — {{this.summary}}
{{/each}}

## Conventions

This repo follows the shared stack conventions — see the `kigu:conventions` skill.
Repo-specific deltas, if any, are listed below.

{{REPO_SPECIFIC_NOTES}}
```

## Filled example

The `{{#each DOMAINS}}` block above is a slot to expand, not text to copy. A finished
instantiation contains no `{{...}}` or `{{#each}}` markers:

```markdown
# tejika discovery

Desktop app shell and UI components for the stack.

## Domains

Load the domain skill matching your task:

- `/tejika:storage` — local persistence, migrations, and data access
- `/tejika:windows` — window management and IPC patterns

## Conventions

This repo follows the shared stack conventions — see the `kigu:conventions` skill.
Repo-specific deltas, if any, are listed below.

Electron-only: renderer code never imports Node.js builtins directly.
```

## Instantiation checklist

- [ ] Replace `{{REPO_NAME}}`, `{{REPO_SLUG}}`, `{{ONE_LINE_REPO_PURPOSE}}`.
- [ ] List one `DOMAINS` entry per domain skill the repo ships.
- [ ] Fill or remove `{{REPO_SPECIFIC_NOTES}}`.
- [ ] Place the result at `plugins/<repo>/skills/discover/SKILL.md` and add the
      plugin to the repo's marketplace reference.
