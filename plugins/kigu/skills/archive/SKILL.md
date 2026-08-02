---
name: archive
description: Use when housekeeping the plans folders, or when docs/agents/plans/completed/ has accumulated old entries.
---

# Archive Completed Plans

Consolidate unreferenced completed plans into monthly summaries. Invoke manually for housekeeping.

## Process

1. **Scan completed plans.** List all files in `docs/agents/plans/completed/`. If the folder is missing or empty, report there is nothing to archive and stop.

2. **Scan for cross-references.** Check these persistent locations for references to completed plans:
   - `docs/agents/plans/next/`
   - `docs/agents/plans/backlog/`
   - `docs/agents/plans/roadmap.md`
   - `docs/agents/plans/milestones/`

   A cross-reference is a markdown link (`[text](path)`) or a file path string that resolves to a completed plan's filename. `roadmap.md` and `milestones/` are optional, so treat a missing one as empty.

3. **Scan active work.** Check `docs/superpowers/plans/` and `docs/superpowers/specs/` for any active work referencing completed plans.

4. **Present findings to the user:**
   - **Safe to archive:** completed plans with no reference from any location in steps 2-3
   - **Still referenced:** completed plans still providing context (show what references them)

5. **User selects which to archive** (or accepts the suggestion).

6. **Group by month.** Use the date prefix in the completed plan's filename (e.g., `2026-01-28-feature.complete.md` goes into January 2026).

7. **Generate monthly summaries.** For each month being archived:
   - Generate or update `docs/agents/plans/archive/YYYY-MM-archive-summary.md`
   - Calibrate per-entry detail: one-liner for simple plans, short paragraph for significant work
   - If a monthly summary already exists, merge new entries into it
   - Use this format for the monthly summary:

     ```markdown
     # YYYY-MM Archive Summary

     ## Plans Completed

     - **feature-name** (YYYY-MM-DD, status) -- one-liner or short paragraph
     - **feature-name** (YYYY-MM-DD, status) -- one-liner or short paragraph
     ```

8. **Delete individual completed plan files** that were archived.

9. **Fix stale cross-references.** Search every location from step 2 for references to a deleted completed plan. Point each one at the monthly summary file, or remove it. A roadmap or milestone entry keeps its own text -- only the link target changes.

10. **Commit.** Stage all changes and commit with the message `docs: archive completed plans for <month(s)>`
