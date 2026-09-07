# ADR-0011 — Spec-driven development OS with agents, task IDs and an edit guard

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-09-05 |
| Deciders | Ahmed |
| Supersedes | — |
| Related | plan/12-dev-workflow.md |

## Context
Solo founder building with Claude Code across many sessions. Risk: vibe-coded features, no tests, unreconstructable decisions.

## Options considered
1. **Standalone system as briefed** — agents, skills, TASKS.md, specs, ADRs, hooks.
2. **Hybrid: the briefed system, built project-locally, borrowing the user-level sdd-* framework's ADR immutability rules and enforcement-hook idea, without depending on those skills.**
3. **Extend sdd-* fully** — adopt its product/ layout and build the missing downstream stages.

## Decision
Option 2: hybrid. Two automated hooks maximum (task-ID edit guard on application code; TASKS.md reminder on stop). Everything else is a checklist inside agent contracts.

## Consequences and the trade-off accepted
Easier: any session resumes cold from CLAUDE.md, TASKS.md and specs. Harder: process overhead for one person; reviewed after two weeks of real use and trimmed if it slows delivery.
