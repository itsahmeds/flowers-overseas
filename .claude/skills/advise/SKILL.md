---
name: advise
description: Independent second opinion for the founder — the advisor agent reads a draft spec, or a decision before it becomes an ADR, from four angles (building, Google, law and compliance, customer) and writes a one-page memo to docs/advice/ with a GO / GO WITH FIXES / NO-GO verdict, the risks, and the questions to ask. Opinion only; it never approves or edits.
argument-hint: "<specs/NNN-slug.md | decision in plain words>"
disable-model-invocation: true
---

# /advise <spec-or-decision>

**When:** every spec, after `/spec` writes it and before the founder approves it; every decision
headed for `/adr`.
**Inputs:** a draft spec path, or the decision and its options.
**Agent:** `advisor`.
**Outputs:** `docs/advice/YYYY-MM-DD-<slug>.md` opening `ADVISOR: GO | GO WITH FIXES | NO-GO`; the verdict, its sentence, the fixes and the questions shown to the founder.

## Steps
1. Fill in `.claude/templates/work-order.md` with the advisor role section and dispatch `advisor`.
2. Show the founder the verdict line, its sentence, any fixes and the questions, beside the spec's own §13
   open questions. Don't merge the two lists: the advisor's questions are the founder's to ask.
3. The founder decides. On GO WITH FIXES, the spec writer makes the fixes the founder accepts, and the orchestrator checks each one landed before asking for approval. A NO-GO blocks nothing. Record the decision the way `/spec` or `/adr` already does; the memo stays
   as the record of what was advised.
