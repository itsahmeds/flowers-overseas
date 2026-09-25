---
name: design
description: Draw the flows and wireframes an approved UI spec needs as .dc.html artboards in docs/design/, via the designer agent, before /plan-tasks. One desktop and one mobile artboard per page type, every state, real copy or [slot], the honesty and voice rules of docs/design/README.md. Writes only under docs/design/.
argument-hint: "<specs/NNN-slug.md>"
disable-model-invocation: true
---

# /design <spec>

**When:** a spec that changes any page or journey is `approved`, before `/plan-tasks`.
`/plan-tasks` refuses a UI spec whose artboards are not merged.
**Inputs:** the spec path.
**Agent:** `designer`.
**Outputs:** a `no-task` PR under `docs/design/` with the artboards and canvas entries; the list of `[slot]`s left.

## Steps
1. Verify `Status: approved`, and that the spec changes a page or journey. If it changes none,
   say so; `/plan-tasks` can proceed.
2. Fill in `.claude/templates/work-order.md` with the designer role section and dispatch `designer`.
3. Show the founder the canvas (`docs/design/canvas.json`). The founder's look is the approval.
   Then run `/break` and `/review` on the PR like any other, and merge on the usual rule.
4. Suggest `/plan-tasks specs/NNN-<slug>.md`.
