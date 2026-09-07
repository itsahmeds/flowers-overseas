---
name: spec
description: Write a numbered spec in specs/ for a feature or roadmap item using the fixed template, via the spec-writer agent. Use before any task is planned or code is written. Wires in /define-requirements for large or fuzzy features.
argument-hint: "<feature or roadmap spec number, e.g. 009 PDP with date picker>"
disable-model-invocation: true
---

# /spec <feature>

**When:** a roadmap item or new feature needs a contract before `/plan-tasks`. Never skip for "small" tasks.
**Inputs:** feature name or reserved spec number (`plan/09-roadmap.md`); optional pointers to plan sections.
**Agent:** `spec-writer` (subagent). For features touching >2 modules or with unclear acceptance criteria, the agent first runs the user-level `/define-requirements` flow and cites its output in §1–§4.
**Outputs:** `specs/NNN-<slug>.md` with `Status: draft`; a 5-line summary; open questions in §13.

## Steps
1. Resolve the number: reserved in the roadmap, else next free (`ls specs/`).
2. Launch the `spec-writer` agent with: the feature, the number, the plan sections to read, and the instruction to fill all template sections (SEO/i18n/compliance mandatory).
3. Present the summary and the open questions. Ask the founder to answer them; update the spec; when the founder says "approved", set `Status: approved`, `Approved by / date`.
4. Suggest `/plan-tasks specs/NNN-<slug>.md`.

## Never
Write code. Approve without the founder. Leave §6–§8 empty.
