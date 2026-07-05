# Question-Based Plans

The plan format the learning loop executes. Plans are structured as questions to answer, not tasks to complete.

## Philosophy

Implementation is a sequence of small probes that build confidence or surface problems. Code is a side effect — learning is the primary output.

```
probe → result → capture what was learned → learning informs next step
```

Each probe is a small, contained change that validates one assumption from the spec or plan:

1. **State the assumption** — "the query builder supports separate migration tables per plugin"
2. **Write the minimal code/test to verify it** — a focused test, not a full implementation
3. **Run it, observe the result** — either confirms or contradicts
4. **Capture the learning** — record what was learned, at the right level (see below)
5. **Decide the next step based on what was learned** — not based on the plan's question list

If a step takes longer than expected, that IS the finding. Stop, report what's blocking. Difficulty is information, not a challenge to push through.

## The Critical Rule

**If learning contradicts the design, update the design before writing more code.** Do not adapt the code to work around a design problem. Surface it, discuss it, update the spec if needed. Pushing through when something doesn't fit is how drift starts.

## Where Learning Goes

| Level | Example | Where to record |
|-------|---------|-----------------|
| **Question** | "the migration-table option works as expected" | Decision log (ephemeral, `docs/superpowers/` during implementation) |
| **Spec/Plan** | "the schema builder needs an extension point we didn't design" | Update the spec or plan before proceeding |
| **Repo** | "SQLite adapters return 1/0 for booleans in JSON" | `MEMORY.md` or `docs/agents/` |
| **Cross-repo** | "this plugin pattern composes well with sibling-repo execution chains" | `MEMORY.md` |

## Plan File Structure

Plans live in `docs/superpowers/plans/`, grouped into phases with exit criteria and a decision log at the bottom:

```markdown
# <Feature> Plan

**Stage:** planning
**Mode:** learning-loop
**Spec:** docs/superpowers/specs/<spec-file>.md

## Phase 1: <name>

Exit criteria: <what must be true to close the phase>

### Question 1.1: <the question to answer>
- **Assumption:** <the specific thing this probe is testing>
- **Done when:** <explicit acceptance criteria>
- **Spec excerpt:** <relevant spec section copied in, not linked>
- **Verify:** pnpm run build && pnpm run lint && pnpm test

## Decision Log
```

Each question must include:

1. **Assumption to validate** — the specific thing this probe is testing
2. **Done when** — explicit acceptance criteria. If it's in scope, it's in the criteria. Nothing is implicitly "future work" unless the criteria say so.
3. **Spec excerpt** — the relevant spec section copied into the question, not just linked
4. **Verify command** — the exact command, run from repo root. Paste actual output.
5. **What was learned** — filled in after completion (in the decision log), before moving to the next question

## Rules

1. **Write usage as a test file.** Before implementing an API, write an actual test showing how a developer would use it. If the test reads awkwardly, fix the API before implementing.

2. **Nothing is "future work" unless the question says so.** Do not defer parts of a question to make it easier. If the question is too large, ask to split it — don't silently shrink it.

3. **Two strikes, then ask.** If an approach has failed twice, or you're about to deviate from the plan, stop and explain what's happening before trying a third thing. Difficulty is a signal, not a challenge.

4. **Paste verification output.** Run the exact verify command and paste actual output. Not a summary, not "tests pass" — the output.

5. **Capture learning before moving on.** After each probe, record what was learned. If the learning changes the plan, say so. Then proceed.

## Repo Domain Framing

This reference covers the shared mechanics only. A repo may add its own domain decision framework — the questions to answer before any code is planned (e.g. a UX → DX → implementation chain) — in its local `docs/agents/`. When such a doc exists, read it alongside this reference.
