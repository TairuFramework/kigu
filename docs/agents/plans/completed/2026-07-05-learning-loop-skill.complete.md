# Learning Loop Skill and Dev-Loop Mode Routing

**Status:** complete
**Commit:** ea5f972

## Goal

Make kubun's question-based execution loop a stack-shared skill (`kigu:learning-loop`) and let `kigu:dev-loop` route between it and the task-based superpowers execution skills.

## What was built

- `plugins/kigu/skills/learning-loop/` — the five-step loop (announce → probe → show → discuss → record) executing plans structured as questions to answer, with mandatory user feedback between steps. `references/question-plans.md` carries the plan format and philosophy (learning is the primary output; code is a side effect).
- `plugins/kigu/skills/dev-loop/SKILL.md` — new Plan Modes section: the planning stage picks `tasks` or `learning-loop` by criteria (spec stability, design uncertainty, feedback needs), confirms with the user, and records `**Mode:**` in the plan file; the executing stage routes on it.

## Key design decisions

- **One dev-loop, two modes** — rather than separate loop skills per style; the mode is per-feature, not per-repo, decided at the planning stage.
- **Question-plan format lives inside the skill** (`references/question-plans.md`), genericized from kubun's `implementation-process.md`; repos add their own domain decision framework (e.g. kubun's UX → DX → implementation chain) in local `docs/agents/`.
- **Probe dispatch hardened with superpowers subagent-driven-development patterns:** file handoffs (per-question brief/report files in an ephemeral probes directory, subagent returns only status + commits + summary + concerns), a status contract (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, where BLOCKED is the finding — never "try harder"), explicit model selection per probe complexity, and parallel batching for read-only research questions only (implementation probes stay serial).
- **Verification was review-based plus subagent comprehension tests** (mode routing and loop-mechanics scenarios); ambiguities the tests surfaced were patched (batch-cycle mapping, two-strikes scoping, probe file naming/cleanup).

## Follow-up (kubun repo)

Kubun still carries local forks: delete `.claude/skills/execute-learning-loop/` and `.claude/skills/dev-loop/`, rely on the kigu plugin versions, and slim `docs/agents/implementation-process.md` to kubun-specific domain framing only.
