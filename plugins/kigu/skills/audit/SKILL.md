---
name: audit
description: Use when asked to audit, assess, or review the overall health, security, architecture, UX, or strategy of a repo or set of packages - not for reviewing a single diff or PR.
---

# Repo Audit

Read-only fan-out audit: parallel per-package explorers, evidence-verified findings, one ranked report.

## Rules

- **Read-only.** No code changes, no commits. The only writes are the report file and the docs index link.
- **Every finding needs evidence.** Exact `file:line` citation, or a minimal reproduction. A claim without evidence does not enter the report -- drop it or go verify it.
- **Check subagent capabilities before fanning out.** Explorer agents need Bash plus read tools. If Bash is denied, tell the user and ask how to proceed -- never silently fall back to doing every package in the main context.

## Process

1. **Scope.** List the audit units: packages under `packages/`, apps, `tests/` suites, CI workflows -- whatever the repo contains. Confirm the dimensions with the user if not stated: security, architecture, code health, UX, strategy alignment.

2. **Fan out.** Dispatch one explorer agent per unit, in parallel. Each agent returns findings as: one-line summary, severity (critical/high/medium/low), `file:line` evidence, suggested remediation. Agents are read-only.

3. **Verify.** For every critical and high finding, read the cited code yourself (or dispatch a verifier agent) and confirm it holds. Downgrade or drop anything that does not reproduce from the evidence. Findings that survive get marked verified.

4. **Synthesize.** Merge duplicates across units, rank by verified severity, keep medium/low findings in a secondary section.

5. **Write the report.** Save to `docs/agents/audits/YYYY-MM-DD-<scope>.md` (today's date; scope like `security` or `full`). Structure: summary paragraph, ranked verified findings (each with severity, evidence, remediation), secondary findings, list of units covered and any units skipped.

6. **Link it.** Add the report to `docs/index.md`. Create the `docs/agents/audits/` folder on demand.

7. **Stop.** Do not commit, do not start fixing findings. Offer follow-ups: fixes can become `docs/agents/plans/next/` or `backlog/` items via triage (`kigu:project-loop`).

## Coverage honesty

If any unit was skipped, any dimension not audited, or any finding left unverified, say so explicitly in the report and in the final summary to the user. A truncated audit that reads as complete is worse than a smaller honest one.
