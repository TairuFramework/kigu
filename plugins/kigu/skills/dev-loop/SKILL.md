---
name: dev-loop
description: Use when starting or resuming feature work in a stack repo, at any stage of the development cycle.
---

# Dev Loop

Orchestrate the full development cycle with session resumption.

## On Invocation

Before starting anything new, detect in-progress work:

1. Check `docs/superpowers/plans/` for plan files. If found, read the `**Stage:**` field to determine current stage. If a plan file has no `**Stage:**` field, treat it as `executing` (the most common state for a plan mid-flight) and confirm with the user before proceeding.
2. Check `docs/superpowers/specs/` for spec files without a corresponding plan in `docs/superpowers/plans/`. If found, brainstorming is in progress (no Stage field exists yet).
3. Check git branch. If on a feature branch with commits ahead of main, work is in flight.
4. Check `docs/agents/plans/next/` for prioritised work.

Based on findings, present:
- **"Continue X"** -- resume detected in-progress work at the right stage
- **"Start new"** -- nothing in flight, pick from `next/`, `backlog/`, or a fresh idea

## Starting from next/ or backlog/

When the user picks a `next/` or `backlog/` item: the item serves as input context for brainstorming, not as a plan itself. Delete the original file from `next/`/`backlog/` once brainstorming produces a spec. If the user abandons the idea during brainstorming, leave the original item in place.

## Plan Modes

Two plan formats. The planning stage picks one; the executing stage routes on it.

| Mode | Fits when | Plan format | Executing skill |
|------|-----------|-------------|-----------------|
| `tasks` | Work well understood, tasks mechanical and independent, spec stable | Task list via `superpowers:writing-plans` | `superpowers:subagent-driven-development` (or `superpowers:executing-plans` without subagent support) |
| `learning-loop` | Unvalidated design assumptions, spec likely to move, integration unknowns, user wants feedback at each step | Question-based, written collaboratively (see `kigu:learning-loop` references/question-plans.md) | `kigu:learning-loop` |

At the start of the planning stage, assess the work against these criteria, recommend a mode, and confirm the choice with the user before writing the plan. Record it in the plan file as `**Mode:** tasks` or `**Mode:** learning-loop` beside `**Stage:**`. If an existing plan has no `**Mode:**` field, ask the user which mode applies and add the field.

## Stages

Guide through stages in order, invoking the appropriate skill at each:

| Stage | Skill | State signal |
|-------|-------|--------------|
| brainstorming | `superpowers:brainstorming` | Spec exists in `docs/superpowers/specs/`, no plan |
| planning | by mode (see Plan Modes) | `**Stage:** planning` in plan file |
| executing | by mode (see Plan Modes) | `**Stage:** executing` |
| reviewing | `superpowers:requesting-code-review` | `**Stage:** reviewing` |
| qa | (prompt user to test) | `**Stage:** qa` |
| completing | `kigu:complete` | `**Stage:** completing` |
| finishing | `superpowers:finishing-a-development-branch` | `**Stage:** finishing` |

Stages are not atomic -- `executing` and `reviewing` can span multiple sessions. Update `**Stage:**` in the plan file when a stage completes (not during), then commit. The `**Stage:**` field lives only in the plan file -- never add one to the spec.

If the user has said not to commit in this session, still update the `**Stage:**` field but skip the commit and say the stage transition is uncommitted.

The `superpowers:*` skills come from the superpowers plugin. If they are not available in the current session, tell the user the plugin is missing rather than improvising the stage's workflow.

## Stage Details

### brainstorming
Invoke `superpowers:brainstorming`. Once a spec is produced in `docs/superpowers/specs/`, this stage is complete.

### planning
Pick the mode first (see Plan Modes) and confirm with the user. Then:
- `tasks` — invoke `superpowers:writing-plans`.
- `learning-loop` — write the plan collaboratively with the user in the question-based format (see `kigu:learning-loop` references/question-plans.md). Do NOT use `superpowers:writing-plans`.

The plan file is created in `docs/superpowers/plans/` with `**Stage:** planning` and the chosen `**Mode:**`. Once the plan is written and approved, update Stage to `executing` and commit.

### executing
Route on the plan's `**Mode:**` field:
- `tasks` — invoke `superpowers:subagent-driven-development` (or `superpowers:executing-plans` without subagent support). Work through the plan tasks.
- `learning-loop` — invoke `kigu:learning-loop`. Work through the plan's questions; each requires user feedback before the next.

Once all tasks are checked (or all phases answered and exit criteria met), update Stage to `reviewing` and commit.

### reviewing
Invoke `superpowers:requesting-code-review`. Address feedback. Once review passes, update Stage to `qa` and commit.

### qa
Prompt the user to test. Provide test guidance from the plan if available. Wait for user confirmation that QA passes. Once confirmed, update Stage to `completing` and commit.

### completing
Invoke the `kigu:complete` skill. This summarises the finished plan, writes to `docs/agents/plans/completed/`, and cleans up ephemeral files. Once complete, update Stage to `finishing` and commit.

### finishing
Invoke `superpowers:finishing-a-development-branch`. This handles merge/PR/cleanup.
