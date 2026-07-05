# Learning Loop Skill — Design

**Date:** 2026-07-05
**Status:** approved

## Goal

Import kubun's `execute-learning-loop` skill into the kigu plugin as a stack-shared skill, integrate it with `kigu:dev-loop` as an execution mode, and upgrade its probe-dispatch mechanics with insights from `superpowers:subagent-driven-development`.

## Background

Kubun forked kigu's `dev-loop` and added a local `execute-learning-loop` skill: plans structured as questions to answer (not tasks to complete), each question going through a five-step cycle (announce → probe → show → discuss → record) with mandatory user feedback between steps. It replaces `superpowers:executing-plans` / `subagent-driven-development` for high-uncertainty work. The kubun version depends on repo-local docs (`docs/agents/implementation-process.md`, `docs/agents/conventions.md`), so it cannot be shared as-is.

## Decisions

1. **One dev-loop, two modes.** `kigu:dev-loop` stays the single cycle orchestrator. The planning stage picks a plan format; the executing stage routes on it. Kubun deletes its local skill forks and uses the plugin versions (follow-up in kubun, out of scope here).
2. **Question-plan format lives in the skill.** The learning-loop philosophy and question-based plan format (genericized from kubun's `implementation-process.md`) go in `plugins/kigu/skills/learning-loop/references/question-plans.md`. Kubun-specific UX/DX framing is stripped; repos may add their own domain decision framework in local docs.
3. **Mode decided at planning stage by criteria.** Question-based (learning loop) when: unvalidated design assumptions, spec likely to move, integration unknowns, user wants tight per-step feedback. Task-based (superpowers) when: work well understood, tasks mechanical/independent, spec stable. Confirmed with the user; recorded as `**Mode:**` in the plan file beside `**Stage:**`.

## Components

### New skill: `plugins/kigu/skills/learning-loop/`

**SKILL.md** — the five-step loop per question, kept from kubun:

1. Announce (question, assumption, approach, expected files; wait for approval)
2. Probe (subagent does focused work; trivial probes inline)
3. Show (raw findings + pasted test output; no interpretation)
4. Discuss (user approves / redirects / updates spec / asks / skips)
5. Record (append decision log entry, commit)

Plus problem handling (failure IS the finding; spec contradictions block progress; question sizing), phase transitions (summary + exit criteria + user approval), and the "does NOT do" list (no chaining, no judgment calls, no parallel implementation probes, no skipping discuss, no auto-advance).

Reference swaps from the kubun version:

- `docs/agents/implementation-process.md` → `references/question-plans.md` (in-skill)
- `docs/agents/conventions.md §4` comment rule → `kigu:conventions` (Comments section: no plan/implementation-specific references)
- Verify command → repo root commands per `kigu:development`: `pnpm run build && pnpm run lint && pnpm test`

Probe-dispatch upgrades (from `superpowers:subagent-driven-development`):

- **File handoffs.** Orchestrator writes a probe brief file (exact question, spec excerpt verbatim, approved approach, report contract) to a scratch location; subagent reads the brief, writes a full report file, returns only status + commits + one-line test summary + concerns. Show step reads the report file and pastes actual test output to the user.
- **Status contract.** Probe returns DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED. NEEDS_CONTEXT → supply context, re-dispatch. BLOCKED → the finding itself, go straight to Show; never re-dispatch with "try harder". DONE_WITH_CONCERNS → surface concerns in Show.
- **Model selection.** Mechanical check → cheap model; default probe → standard; design-sensitive probe → capable. Model explicit on every dispatch.
- **Parallel research.** Read-only research questions may batch as parallel subagents. Implementation probes stay serial, one at a time. Trivial probes (read a file, check one API) done inline without a subagent.

Superpowers integration section kept (brainstorming produces the spec; systematic-debugging when a probe reveals a bug; verification-before-completion at phase exits; requesting-code-review at phase level; finishing-a-development-branch at the end; using-git-worktrees for isolation). Explicit "replaces" list: `superpowers:executing-plans`, `superpowers:subagent-driven-development`, `superpowers:writing-plans` — for question-based plans only.

**references/question-plans.md** — genericized from kubun's implementation-process doc:

- Learning-loop philosophy: implementation is a sequence of small probes; code is a side effect, learning is the primary output; probe → result → capture → inform next step.
- How a step works: state assumption, minimal code/test, run and observe, capture learning, decide next step from learning (not from the task list). Difficulty is information.
- Where learning goes: task-level → decision log (ephemeral, `docs/superpowers/`); spec/plan-level → update spec/plan before proceeding; repo-level → `MEMORY.md` or `docs/agents/`; cross-repo → `MEMORY.md`.
- Critical rule: learning that contradicts the design updates the design before more code is written.
- Question structure: assumption to validate, done-when criteria, spec excerpt (copied, not linked), verify command, learned (filled after).
- Rules: usage-as-test-first, nothing silently deferred to "future work", two strikes then ask, paste verification output, capture learning before moving on.
- Note: repos add their own domain decision framework (e.g. kubun's UX → DX → implementation chain) in local docs; this reference covers only the shared mechanics.

### Updated skill: `plugins/kigu/skills/dev-loop/SKILL.md`

- **Planning stage picks the mode.** Criteria above, confirmed with the user (AskUserQuestion where available). Plan file records `**Mode:** learning-loop` or `**Mode:** tasks` beside `**Stage:**`.
- **Planning stage skill by mode.** Tasks → `superpowers:writing-plans`. Learning-loop → write the plan collaboratively with the user in the question-based format per `kigu:learning-loop`'s `references/question-plans.md`; do NOT use `superpowers:writing-plans`.
- **Executing stage routes on Mode.** `learning-loop` → `kigu:learning-loop`. `tasks` → `superpowers:subagent-driven-development` (or `superpowers:executing-plans` without subagent support). Plan without a `**Mode:**` field → ask the user which mode applies (pre-existing plans).
- Stage table updated accordingly; all other stages unchanged.

### Docs

- `AGENTS.md` workflow-skills list gains `learning-loop`.

## Out of scope

- Kubun repo changes (delete local `execute-learning-loop` and `dev-loop` skills, slim `implementation-process.md` to domain framing). Follow-up in kubun.
- Changes to `kigu:conventions` (comment rule already present) or `kigu:development`.

## Testing

Skills are markdown; verification is review-based: re-read authored skills against `superpowers:writing-skills` guidance, check all cross-references resolve (skill names, file paths), confirm no kubun-specific paths remain.
