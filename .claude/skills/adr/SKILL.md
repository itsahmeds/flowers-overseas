---
name: adr
description: Create a new Architecture Decision Record from docs/adr/_template.md with the next sequential ID, append it to docs/decisions-log.md and the decisions table in plan/00-summary.md. Accepted ADRs are immutable; superseding creates a new one.
argument-hint: "<decision title>"
disable-model-invocation: true
---

# /adr <title>

**When:** any architectural or business decision is made, or an existing one is reconsidered.
**Inputs:** title; context from the conversation.
**Agent:** none (inline); borrows rules from the user-level `sdd-decide` skill: one decision per ADR, options with costs, recommendation flagged, founder's call recorded honestly ("accepted recommended default" when so), trade-off in the founder's confirmed wording, `deferred` needs guardrails + revisit trigger + cost of deferral.
**Outputs:** `docs/adr/ADR-NNNN-<slug>.md`, log line in `docs/decisions-log.md`, row in `plan/00-summary.md` §6.

## Steps
1. Next ID = max existing + 1 (`ls docs/adr/ADR-*.md`).
2. Draft context, 2–4 options (mark agent-contributed ones `[agent-inferred]`), recommendation with trade-off; ask the founder for the decision and the trade-off wording; write the file from the template.
3. If it supersedes an ADR: set the old one's Status to `superseded-by ADR-NNNN` (the only edit ever allowed to an accepted ADR) and fill `Supersedes`.
4. Append to the log and the summary table.
