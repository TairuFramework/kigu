---
name: conventions
description: Use when writing or editing code in any shared repo - canonical TypeScript, formatting, build, testing, planning, and agent-conduct conventions shared across the stack.
---

# Conventions

Canonical coding conventions for every TairuFramework stack repo. Single source of truth -- repos point here instead of restating rules.

## Quick Reference

| Rule | Do | Don't |
|------|----|----|
| Type definitions | `type Foo = {...}` | `interface Foo {...}` |
| Arrays | `Array<T>` | `T[]` |
| Unknown shapes | `unknown`, `Record<string, unknown>` | `any` |
| Class privacy | `#field` + getter | `private`, `readonly`, `protected` |
| Constructor params | single `ClassNameParams` object | positional params |
| Abbreviations | `threadID`, `HTTP`, `JWT` | `threadId`, `Http`, `Jwt` |
| Type imports | `import type { Foo }` | `import('...').Foo` |
| Placeholder values | real value, optional field, or throw | `{ id: '' }` to satisfy typecheck |
| Scope of change | only what the request requires | drive-by refactors and "improvements" |
| Build/tooling config | leave untouched unless the request is about it | "fixing" package.json scripts, lint config, `.npmrc` |
| Bulk rename/codemod | Node script, or `find` + `perl -pi -e` | `sed -i` on macOS (BSD sed silently no-ops) |
| Dependencies | stack packages (`kigu:stack-packages`) | third-party when a stack package fits |

Details and rationale below.

## 1. TypeScript Conventions

### Type Definitions
- **Always use `type` instead of `interface`** for all type definitions
- **Always use `Array<T>` instead of `T[]`** for array types
- **Never use `any` type** -- use `unknown`, `Record<string, unknown>`, or a more specific type
- Use union types and discriminated unions over enums
- Use descriptive generic type parameter names beyond single letters (e.g., `TData`, `TError`)
- Leverage conditional types and mapped types for complex transformations
- Use intersection types for composition

```typescript
// Correct
type ApiResponse<TData> = {
  data: TData
  errors: Array<ApiError>
}

// Incorrect
interface ApiResponse<T> {
  data: T
  errors: ApiError[]
}
```

### Class Conventions
- **Use ES private fields (`#field`), never the TypeScript `private` modifier**
- **Never use the TypeScript `readonly` modifier.** Use a `#field` for the value and expose a getter when external read access is needed -- this enforces immutability at runtime, not just at compile time
- Avoid the `protected` modifier; prefer composition over inheritance that relies on it
- Constructor params: single object parameter with a `ClassNameParams` type

```typescript
type ConnectionManagerParams = {
  transport: Transport
  maxRetries: number
}

class ConnectionManager {
  #transport: Transport
  #maxRetries: number

  constructor(params: ConnectionManagerParams) {
    this.#transport = params.transport
    this.#maxRetries = params.maxRetries
  }

  // Expose read-only access via a getter instead of `readonly`
  get maxRetries(): number {
    return this.#maxRetries
  }
}
```

```typescript
// Incorrect -- TS-only modifiers, no runtime enforcement
class ConnectionManager {
  private transport: Transport
  readonly maxRetries: number
}
```

### Naming
- Always use capital `ID` not `Id` (e.g., `threadID`, `spaceID`, `flowID`, `userID`)
- Apply the same pattern for similar abbreviations: `HTTP` not `Http`, `DID` not `Did`, `JWT` not `Jwt`
- Types use PascalCase, variables and functions use camelCase, constants use UPPER_SNAKE_CASE

### General Style
- Target ES2025 with strict mode enabled
- Use `const` assertions where appropriate
- Prefer template literals over string concatenation
- Export types alongside implementation when needed
- Use `type` keyword for type-only imports: `import type { Foo } from './foo.js'`

### Comments
- **Keep comments short.** No overly long comments -- include only the necessary context, minimal token count.
- Comment the *why*, not the *what*. Self-explanatory code needs no comment.
- No redundant comments that restate the code, no commented-out code, no decorative banners.
- **No plan/implementation-specific references** in code, comments, `describe`/`test` names, or identifiers -- no internal task numbers, plan item labels (e.g. `G7`, `Task 6`), or ticket IDs. Reference the durable concept or external spec (e.g. `SEP-2243`, `x-mcp-header`) instead; plan labels are ephemeral and meaningless once the plan is archived.

### Placeholder Values
- **NEVER use placeholder values to satisfy the type checker.** This is a MAJOR source of bugs that pass typecheck but fail at runtime.
- If a type expects a real value (UUID, URL, ID, token, etc.), provide a real one or refactor so the value is not required at that call site
- Do not write `{ id: '' }`, `{ url: 'TODO' }`, `{ token: 'xxx' }`, or similar just to make types compile
- If you genuinely cannot supply a real value, make the field optional in the type, use `null`/`undefined` explicitly, or throw -- do not lie to the type system

```typescript
// Incorrect -- passes typecheck, breaks at runtime
const user: User = { id: '', name: 'Alice' }

// Correct -- generate or accept a real value
const user: User = { id: crypto.randomUUID(), name: 'Alice' }

// Correct -- make field optional if absence is meaningful
type User = { id?: string; name: string }
```

---

## 2. Formatting

All repos use **Biome** for linting and formatting. Configuration lives in the repo root.

- **Indentation**: 2 spaces
- **Line width**: 100 characters
- **Quotes**: single quotes for strings, double quotes for JSX attributes
- **Trailing commas**: in all contexts
- **Semicolons**: as needed (not required everywhere)
- **Arrow functions**: always use parentheses -- `(param) => result`
- **JSX brackets**: same line
- **Imports**: Biome auto-organizes imports

Run `pnpm run lint` to format and lint all packages. Run before committing.

---

## 3. File Naming

| Category | Convention | Example |
|----------|-----------|---------|
| React components | PascalCase | `UserProfile.tsx` |
| Utilities and non-component files | camelCase | `messageTransport.ts` |
| Configuration files | kebab-case | `vite.main.config.ts` |
| Test files | `.test.ts` suffix | `tokenizer.test.ts` |
| Generated files | Never edit manually | `lib/`, `__generated__/`, `.gen.ts` |

---

## 4. Import Conventions

- Prefer **named imports** over default imports
- Group imports in order: external libraries, internal `@scope/` packages, relative imports
- Use workspace protocol for internal packages (e.g., `@sozai/schema`, `@kokuin/token`)
- Use **`type` keyword** for type-only imports
- **Always import types via module-level `import type`, never via dynamic `import()`** -- dynamic `import()` type annotations defeat tree-shaking, hurt readability, and bypass import organization

```typescript
// Correct
import type { Transport } from '@enkaku/transport'

function connect(transport: Transport) {}

// Incorrect
function connect(transport: import('@enkaku/transport').Transport) {}
```

```typescript
import { describe, expect, test } from 'vitest'

import type { Transport } from '@enkaku/transport'
import { Client } from '@enkaku/client'

import { createHandler } from './handler.js'
import type { HandlerConfig } from './types.js'
```

---

## 5. Agent Conduct

How an agent should behave when writing or editing code in any stack repo. These apply to every change, not just feature work. For trivial tasks, use judgment -- they bias toward caution over speed.

### Think Before Coding
- State assumptions explicitly. If uncertain, ask before implementing.
- If multiple interpretations exist, surface them -- do not pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop and name what is confusing.

### Simplicity First
Write the minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that was not requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.
- Before adding a third-party dependency or writing new utility code, check the `kigu:stack-packages`
  skill and prefer a stack package when one fits (e.g. `@sozai/schema` over Zod).

This is the same ethos as the Placeholder Values rule (section 1): do not add structure to satisfy an imagined requirement any more than you add fake values to satisfy the type checker.

### Surgical Changes
Touch only what the request requires. Every changed line should trace directly to the user's request.

- Do not "improve" adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Match existing style, even if you would do it differently.
- Remove imports/variables/functions that **your** changes made unused. Do not delete pre-existing dead code -- flag it instead.
- **Never modify `package.json` scripts, lint/build configuration, or `.npmrc` unless the request is explicitly about them.** If one looks wrong, flag it -- do not fix it in passing.

### Bulk Edits and Codemods
Development happens on macOS, where BSD `sed` differs from GNU sed in ways that fail silently.

- **Never use `sed -i` for bulk edits.** BSD sed's `-i` takes a mandatory backup suffix, multi-file
  invocations misbehave, and `\b` word boundaries are unsupported -- the command exits 0 having
  changed nothing.
- Write a small Node script, or use `find <dir> -name '*.ts' -exec perl -pi -e 's/old/new/g' {} +`.
- After any bulk edit, verify with `git diff --stat` that the expected files actually changed --
  a zero-file diff after a "successful" codemod means it no-opped.

### Goal-Driven Execution
Turn tasks into verifiable goals, then loop until verified.

- "Add validation" -> "Write tests for invalid inputs, then make them pass"
- "Fix the bug" -> "Write a test that reproduces it, then make it pass"
- "Refactor X" -> "Ensure tests pass before and after"

Strong success criteria let the agent loop independently; weak criteria ("make it work") force constant clarification. This complements the TDD and verification-before-completion workflows, and the multi-stage `kigu:dev-loop` lifecycle documented in the `kigu:development` skill.

## 6. Root AGENTS.md shape

Every repo's root `AGENTS.md` is thin and repo-specific. It never restates the guardrails -- those
live in this skill -- and `CLAUDE.md` is just `@AGENTS.md`. Changing a shared rule then touches
only this skill, never every repo.

Shape:

```markdown
# <repo>

> Conventions: `kigu:conventions` skill (canonical -- do not restate).
> Stack map / sibling docs: `kigu:stack-map` skill.

## What this repo is
<one paragraph, repo-specific>

## Guardrails
See the `kigu:conventions` skill. Repo-specific only: <anything genuinely local, e.g. pnpm only>.
```

## 7. Canonical repo layout

Every stack repo matches one shape. Shared guidance is sourced from kigu skills, not copied.

### Root files
- `AGENTS.md` -- thin pointer (see §6). Source of truth for repo context.
- `CLAUDE.md` -- single line `@AGENTS.md`.
- `README.md` -- human-facing.
- `.changeset/` -- present where the repo publishes packages.

### docs/ tree
```
docs/
  index.md              # repo doc entry; links the stack overview (TairuFramework/kigu/docs/stack.md)
  agents/
    architecture.md     # repo-specific
    development.md       # thin: pointer to the `kigu:development` skill + repo-specific deltas only
    audits/             # read-only audit reports (`kigu:audit`), created on demand
    plans/              # permanent planning -- project-loop/dev-loop/complete/archive operate here
      next/ backlog/ completed/ archive/   # created on demand (no placeholder dirs)
      milestones/                          # optional
      roadmap.md  project-loop-state.md    # created on first project-loop write
  reference/            # domain docs
  guides/               # optional, user-facing
  superpowers/          # EPHEMERAL -- specs/ + plans/, branch-only, deleted before merge
```

### Rules
- Conventions are NOT duplicated per repo -- this skill is canonical. No `docs/agents/conventions.md`.
- Shared build/test/release workflow lives in the `kigu:development` skill. Each repo's
  `docs/agents/development.md` is a thin pointer plus repo-specific notes only.
- Domain reference docs live under `docs/reference/` (one name -- not `domains/` or `capabilities/`).
- Plan folders are created on demand; never scaffold empty ones.
- The shared skills load because each repo's committed `.claude/settings.json` enables the
  kigu marketplace and the `kigu` plugin.
