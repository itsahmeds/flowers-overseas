# TASK-496 — Peak calendar and capacity data: migration `NNNN_calendar_capacity` + down (calendar days, florist day capacity, `peak_day` moved out of `country_price`), the provider swap, `dateSurchargeOn`, `upsertCalendarDay`, peak suggestions, `floristCapacityOn`, `dayCapacity`, florist capacity commands, spec 016's routing on per-date capacity

Row: `TASKS.md` → TASK-496. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-496`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 024 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- The migration is written `NNNN_calendar_capacity` in the spec; give it the next number after the last merged migration when the task starts, with its `.down.sql`; database work only on a throwaway local Postgres 16.
- **ACs owned:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-12, AC-16, AC-17, AC-22, AC-23, AC-32.
- **Scope (§12 steps 1 and 2).** Migration and seed: country calendar days (`peak` or `closed`, surcharge, order-by, cap), florist day capacity overrides, `occasion_country.peak`, `order_status.holds_capacity`, the `peak_day` rows moved out of `country_price` with the narrowed CHECK, the provider swap behind the parity test (AC-1); then `dateSurchargeOn` (one surcharge per date, the peak replaces Sunday's, §13 Q3), `upsertCalendarDay` (retire and insert, audit, `invalidate(['delivery:{iso2}', 'catalog:{iso2}'])`), `suggestPeakDays` and `applyPeakSuggestions`, `floristCapacityOn`, `dayCapacity`, florist commands (`setFloristDayCapacity`, `addFloristDayOff`), spec 016's `eligibleCandidates` on per-date capacity.
- **Countries are data:** no ISO code, date or money literal outside tests and seed (AC-6); no parameter matching `/buyer|ip|geo|visitor/i` (AC-32).
- **Depends on spec 012b's database providers and `invalidate()`** (TASK-294, open PR 449) and spec 016's routing (TASK-327, TASK-328).
- Flag `delivery.capacity` (country scope, default off, high risk). Seed peaks per §13 Q1 and Q2.

## Read

- `specs/024-peak-capacity-surcharges.md`: `## 0. Index` first, then §2 "Data", "Capacity"; §5.1, §5.2; §9 AC-1 to AC-7, AC-12, AC-16, AC-17, AC-22, AC-23, AC-32; §12; §13
- `docs/codebase-map.md`: where everything lives
- `src/modules/geo/` (delivery window, holidays), `src/modules/catalog/` (price provider, surcharges), `src/modules/orders/routing/route.ts`
- spec 012b's providers and `invalidate()` (TASK-294)

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
