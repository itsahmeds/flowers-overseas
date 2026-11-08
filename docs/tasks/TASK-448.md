# TASK-448 — Spec 047 §13 Q15 Option B: the same code control on step 3 directly above the express panel, the compact block listing the discount line and reduced total, the wallet amount equal to that total, a code applied on either step shown on the other

Row: `TASKS.md` → TASK-448. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-448`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 047 approved by the founder 2026-10-24 ("specs ok", every open-question default); §14 A-orchestrator-2026-10-25 is binding as a reading (step 4, one code per purchase, express paths). Designs merged: `docs/design/wireframes/admin-discounts-*`, `checkout-*` and `confirmation-*` (PR 426, "Basket" note), the five components in `system/components.dc.html`.
- **No new AC.** Reading of AC-12 and AC-25 under §13 Q15's recommended default (Option B, drawn in PR 426): the same `<details>` control renders on step 3 directly above the express panel whenever the panel renders and the flag is on for every line's destination; applying or removing there re-renders step 3; the compact block lists the discount line and the reduced total; the wallet amount (spec 013 X.2) is that reduced total; a code applied on either step shows on the other. "Keep my credit for later" stays on step 4.
- **Before dispatch:** Q15 is still open in the spec. The orchestrator confirms Option B under the founder's delegation of 2026-10-31 (one file in `docs/decisions/`) or the founder answers; if Option A is chosen instead, rewrite this brief (the panel steps aside while a reduction is held).
- **Waits for** TASK-447 (the control and actions) and TASK-422 (the express panel on step 3).
- **Checks: self-review only (founder 2026-10-22 and 2026-11-02).** No reviewer, breaker or advisor agent runs and no mutation proof is asked for. The PR description carries `## Self-review`: every owned AC id with the file:line and the test that covers it, and the pasted `pnpm gates:cheap` block. Anything left unfixed goes under Carry-forwards here.
- **House rules.** Migrations are named `NNNN_...` here and numbered after the last merged one when the task starts, each with its `.down.sql`; database work only on a throwaway local Postgres 16. Money is integer minor units beside an ISO currency. New message keys `reviewed: false`, no em dash anywhere. Countries are data; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). No PII in logs, URLs or analytics.

## Read

- `specs/047-discount-codes.md`: `## 0. Index` first, then §2, §5, §14, §13 Q15
- `docs/design/wireframes/checkout-*` (PR 426, step 3 with the express panel), TASK-422's brief
- `docs/codebase-map.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.

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
