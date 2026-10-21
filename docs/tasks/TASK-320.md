# TASK-320 — Spec 012b slice A.2 bulk upload, part 2: Apply and photos

Row: `TASKS.md` → TASK-320. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §14 A-founder-2026-10-21b, approved 2026-10-21, founder "bulk defaults". Spec §12 task 14b. Merges after TASK-319 and TASK-299.
- **ACs owned:** AC-43, AC-44 (writes, `Offer.price` = `quote()`), AC-45, AC-47 (audit rows, permissions, its routes), AC-48. Tests T-45, T-46, T-47, T-49, T-50, T-51, and T-52, T-53 for the Apply, report and photo-step states.
- **Review class: keeps the breaker** (money, data flows).
- Apply is one transaction over slice A's commands, each of which gains a transaction handle here; the plan-hash re-check refuses an Apply when a product changed between preview and Apply; one `invalidate()` with the union of tags; a drafts-only file calls none. It creates drafts only, never changes a product's status, closes a price without a successor, deletes a row or touches a `source = 'seed'` product.
- The photo step stores images through TASK-299's upload path and matches them to `primary_photo` cells; the runbook section and RoPA flow 2 (the 24-hour payload) land here.
- **Design:** the Apply, report and photo-step states are in `docs/design-012b-bulk`; `/implement` waits for it to merge.

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §14, §12 task 14b, AC-43 to AC-45, AC-47, AC-48, T-45 to T-47, T-49 to T-53
- `docs/codebase-map.md`
- TASK-319's `planImport` and `catalogue_import`, TASK-299's `uploadOriginal` and attach, `docs/runbooks/catalogue.md`, `docs/compliance/` RoPA

## Carry-forwards

One dated bullet per `/review`, newest last.

_None recorded._

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
