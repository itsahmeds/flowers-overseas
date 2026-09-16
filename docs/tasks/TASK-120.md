# TASK-120 — Honest cutoff copy: gate `nav.utility.cutoff`, `nav.utility.cutoffShort`, `finder.cutoff` and `faq.whoDelivers.answer` on spec 009's `pickerState('PL') === 'live'` (false in Phase 0) with honest fallback strings in four locales; remove the PL `sunday` surcharge seed rows while `sundayDelivery: false`; e2e asserts no same-day or cutoff promise renders anywhere while no destination is live

Row: `TASKS.md` → TASK-120. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-120`; keep it current by editing this file, not the row.

## Binding

- Spec 004 §14 A19 and spec 009's §13 design-round resolution (Q1, Q2): gate every same-day / cutoff promise in the site chrome on the destination's picker state, false everywhere in Phase 0; honest fallback copy in four locales; PL `sunday` surcharge seed rows removed while `sundayDelivery: false`.
- **Widened by `/review 70` (2026-09-16):** the set is not only the four keys — the header's "Same-day delivery" and the footer's "Delivery times and cutoffs" links carry the same promise on every guide page whose facts block says "no cutoff" (spec 007 AC-19's forbidden set). Enumerate every chrome string that asserts a cutoff, a same-day or a delivery-time promise (grep `messages/*.json` for cutoff/same-day/today/delivery time) and gate them all by one predicate. TASK-095's whole-document AC-19 scan depends on this task.
- Predicate: `deliveryDatesOpen(iso2)` in `src/config/countries.ts` until spec 009 task 3 (TASK-123/124) re-sources it to `pickerState()`; same shape as `ActivePartnersProvider`.

## Read

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
