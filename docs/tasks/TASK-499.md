# TASK-499 — Capacity jobs, alerts and runbook: `capacity.watch` (release reopens a date, 80 % and 100 % alerts), `peak.readiness` digests 14 and 3 days before, `delivery.cutoff_purge`, capacity log privacy, `docs/runbooks/peak-day.md`

Row: `TASKS.md` → TASK-499. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-499`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 024 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-21, AC-25, AC-26, AC-33.
- **Jobs:** `capacity.watch` (a released slot from spec 013's sweep or a full refund reopens the date and purges `delivery:{iso2}` once; 80 % and 100 % alerts once per country, date and threshold), `peak.readiness` (digest per live country per peak row at exactly 14 and 3 days before; none for `demo`), `delivery.cutoff_purge`.
- **Alerts** through `raiseAlert` if spec 025's TASK-488 has merged when this task starts; otherwise ops email plus Sentry as §11 says. No postcode, town, name, email, phone or card message in any capacity event, log or alert.
- **Runbook** `docs/runbooks/peak-day.md` (named by `plan/06` §7): setting up a peak, what the alerts mean, raising capacity mid-day, closing a date, rerouting after an admin day off, the 1 Feb checklist.

## Read

- `specs/024-peak-capacity-surcharges.md`: `## 0. Index` first, then §2 "Florist area, admin, alerts"; §5.2; §9 AC-21, AC-25, AC-26, AC-33; §11; §12
- `docs/codebase-map.md`: where everything lives
- `src/jobs/handlers.ts`, `src/modules/payments/` (sweep)
- `plan/06-*.md` §7

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
