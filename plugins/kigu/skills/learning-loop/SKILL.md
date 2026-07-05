---
name: learning-loop
description: Use when executing a question-based implementation plan, or when plan work rests on unvalidated design assumptions that need user feedback at each step.
---

# Learning Loop

Execute a question-based implementation plan through small probes with mandatory user feedback between each step.

**Announce at start:** "Using the learning loop to work through [plan name]. Let me find the next question to answer."

## Overview

Plans in this mode are structured as questions to answer, not tasks to complete — see [references/question-plans.md](references/question-plans.md) for the format and philosophy. Learning is the primary output; code is a side effect. Each question goes through a full feedback cycle with the user — no chaining, no autonomous batching.

For task-based plans, use `superpowers:executing-plans` or `superpowers:subagent-driven-development` instead. The `kigu:dev-loop` planning stage decides which mode applies.

## On Start

1. Read the plan file (from `docs/superpowers/plans/`)
2. Read the spec it references (from `docs/superpowers/specs/`)
3. Read [references/question-plans.md](references/question-plans.md) for the question format and rules
4. Check the decision log at the bottom of the plan — find the last answered question
5. Present to user: "Here's where we are. The next question is [X]. Ready to start?"

## The Loop

For each question in the plan, follow these five steps exactly. Do not skip or combine steps.

### Step 1: Announce

Explain to the user:
- Which question you're answering (quote it from the plan)
- What assumption is being validated
- What you're about to try — the specific approach
- What files/code you expect to touch

**Wait for user approval before writing any code.** The user may redirect, add context, or say "skip this one." Do not proceed without explicit go-ahead.

### Step 2: Probe

Dispatch a subagent to do the focused investigation/implementation work. Hand context over as files, not pasted prompt text — it keeps your own context lean across a long session.

**Probe brief.** Write a brief file to a scratch location (e.g. `docs/superpowers/probes/question-2.3-brief.md`, matching the plan's question numbering; the `probes/` directory is ephemeral — briefs and reports are deleted with the rest of `docs/superpowers/` at the completing stage), containing:
- The exact question being answered
- The relevant spec section (copied verbatim, not referenced)
- The approved approach from Step 1
- Instructions to stop and report `BLOCKED` if the approach doesn't work (do not try alternatives without asking)
- Instructions to run the repo's verify command (`pnpm run build && pnpm run lint && pnpm test` from root, per `kigu:development`) and include the output in the report
- The report contract: write the full report to the sibling report file (`question-2.3-brief.md` → `question-2.3-report.md`); return only status, commits, a one-line test summary, and concerns
- Pointers to `kigu:conventions` and the repo's `CLAUDE.md` — including the conventions rule that code, comments, and test names never reference plan questions, decision numbers, or phase labels (no `// Q3.2:`); capture the constraint or invariant directly

**Status contract.** The probe subagent reports one of:

| Status | Handling |
|--------|----------|
| `DONE` | Read the report file, proceed to Step 3 |
| `DONE_WITH_CONCERNS` | Read the concerns; surface them explicitly in Step 3 |
| `NEEDS_CONTEXT` | Supply the missing context, re-dispatch |
| `BLOCKED` | The blocker IS the finding — go straight to Step 3. Never re-dispatch with "try harder" |

**Model selection.** Specify the model explicitly on every dispatch: mechanical probe (complete approach, 1–2 files) → cheap model; default probe → standard model; design-sensitive probe → most capable model.

**Serial vs parallel.** Implementation probes run one at a time — never in parallel. Read-only research questions may batch as parallel subagents; the batch shares one loop cycle — announce and get approval for the batch together in Step 1, present all findings together in Step 3, and record each question's entry in the decision log in Step 5.

**Retries.** The "two strikes, then ask" rule (see references) applies to the loop, not the probe: a probe subagent stops at the first failure of the approved approach and reports `BLOCKED`; the user may then approve a second approach in Step 4. If that fails too, do not propose a third without discussing what the failures mean.

**If the probe is trivially small** (checking a single API, reading a file), do it directly instead of dispatching a subagent. Subagents are for code changes, not for reading docs.

### Step 3: Show

Read the probe's report file, then present the findings to the user:
- What was confirmed or contradicted
- The actual test output (pasted, not summarized)
- Any surprises or unexpected findings
- If the findings contradict the spec, say so explicitly

**Do not interpret the results for the user.** Present the raw findings and let the user draw conclusions. If you have an opinion, state it as an opinion, not as a decision.

### Step 4: Discuss

Wait for user feedback. The user may:
- **Approve** — findings are good, move on
- **Redirect** — approach was wrong, try something different
- **Update spec** — findings mean the design needs changing (do this before continuing)
- **Ask questions** — answer them, provide more detail
- **Skip** — defer this question for later

**Do not proceed to Step 5 until the user explicitly signals to move on.**

### Step 5: Record

Append to the decision log at the bottom of the plan file:

```
### [Date] — Question [N.N]: [question title]
**Findings:** [what was confirmed/contradicted]
**Spec impact:** [none / needs update: description]
**Learned:** [what we now know that we didn't before]
```

Commit the decision log update and any code from the probe.

Then present the next question and return to Step 1.

## Handling Problems

**Probe reports difficulty or failure:**
Do not re-dispatch with "try harder." Present the failure to the user in Step 3 and discuss in Step 4. The failure IS the finding.

**Question turns out to be bigger than expected:**
If the probe reports the work is large or complex, surface this in Step 3. The user may want to split the question or adjust scope.

**Findings contradict the spec:**
Flag this clearly in Step 3. Do not continue to the next question until the spec is updated in Step 4. Building on a wrong spec creates compounding errors.

**You're unsure about the next question:**
Ask the user which question to tackle next. The plan's ordering is a suggestion, not a mandate — the user may want to change priorities based on earlier findings.

## Phase Transitions

When all questions in a phase are answered:
1. Present a summary of the phase: what was confirmed, what changed, what surprised us
2. Check phase exit criteria from the plan — are they all met?
3. Wait for user approval before starting the next phase

## What This Skill Does NOT Do

- **Does not chain questions** — each question goes through the full 5-step cycle
- **Does not make judgment calls** — presents findings, user decides
- **Does not run implementation probes in parallel** — one probe at a time (parallel subagents for read-only research are OK)
- **Does not skip the discuss step** — even if findings seem obviously good
- **Does not auto-advance to the next phase** — user approves phase transitions

## Integration

**Works with these skills:**
- `superpowers:brainstorming` — produces the specs that question-based plans reference
- `superpowers:systematic-debugging` — use when a probe reveals a bug
- `superpowers:verification-before-completion` — use at phase exit criteria checks
- `superpowers:requesting-code-review` — use for phase-level review
- `superpowers:finishing-a-development-branch` — use when all phases are complete
- `superpowers:using-git-worktrees` — use for isolated feature work
- `kigu:dev-loop` — orchestrates the full cycle; routes to this skill when the plan's `**Mode:**` is `learning-loop`

**Replaces these skills (for question-based plans only):**
- `superpowers:executing-plans` — replaced by this loop
- `superpowers:subagent-driven-development` — subagents are used for probes only, not autonomous task execution
- `superpowers:writing-plans` — plans use the question-based format (see [references/question-plans.md](references/question-plans.md))
