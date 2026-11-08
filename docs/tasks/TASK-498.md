# TASK-498 — Florist "Your days" and the admin calendar: the florist screen (60 days, booked and capacity, busy days, per-date capacity and days off) in en, pl, de, and the admin month calendar per country with the florist breakdown, row editor, caps and "Suggest peak days"

Row: `TASKS.md` → TASK-498. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-498`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 024 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-29, AC-30, AC-31.
- **No board yet.** The designer draws the florist "Your days" screen (390 px first; en, pl, de) and the admin calendar per country (month view, florist breakdown, row editor, caps, "Suggest peak days for {year}") before this task starts.
- **Florist screen** in the florist area (`/vendor`, spec 026a): default capacity, next 60 days with booked and capacity, busy-day markers by occasion name, per-date capacity and days off through TASK-496's commands; refusals that protect accepted orders; no buyer price or surcharge shown (§13 Q7).
- **Admin calendar:** kind, surcharge, order-by, cap, florist sum, held, remaining and state per date with the per-florist breakdown; read-only without `calendar.edit`; a `demo` country editable with capacity columns blank.
- axe zero serious or critical on both screens; every editor keyboard operable.

## Read

- `specs/024-peak-capacity-surcharges.md`: `## 0. Index` first, then §2 "Florist area, admin, alerts"; §5.3; §9 AC-29 to AC-31
- `docs/codebase-map.md`: where everything lives
- `src/app/vendor/`, `src/app/admin/`
- TASK-496's commands in `src/modules/partners/capacity`

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
