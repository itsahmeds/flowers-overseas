# TASK-497 — Capacity at the date picker and placement: `assertDateHasCapacity` in `place` under a lock, step 1's full-date refusal with the next date, the peak chip delta, "Order by" and "Fully booked" states, `fromPrice` with `unavoidableSurcharge`, `Offer` price and availability, `delivery:{iso2}` purges, the pressure-word check

Row: `TASKS.md` → TASK-497. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-497`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 024 approved by the founder on 2026-10-24 ("specs ok", on every open-question default); build from the spec text, its amendments and the boards on `main`.
- **No review steps (founder 2026-10-22).** No reviewer or breaker agent runs, and no mutation proofs or breaker cases are asked for. The PR description carries the owned AC list: each AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block.
- Countries are data, never code per country; nothing reads IP, `cf-ipcountry` or `Accept-Language` to decide what to show (ADR-0006). Order status only through `orderService.transition` (ADR-0009). Money in integer minor units with an ISO currency. New keys ship `reviewed: false`; no em dash in any key, text or comment.
- **ACs owned:** AC-8, AC-9, AC-10, AC-11, AC-13, AC-14, AC-15, AC-18, AC-19, AC-20, AC-24, AC-27, AC-28, AC-34.
- **One agent for `src/modules/geo/delivery` and spec 009's view model** (§12, shared resolver).
- **Board first:** the designer adds the peak chip (with its fee), the "Order by {date}, {time} {city} time" chip and the "Fully booked" chip, and checkout step 1's full-date refusal, to the date picker and checkout boards in `docs/design/` before the UI half is built.
- **Placement is atomic:** `assertDateHasCapacity` inside spec 010's `place` under a transaction lock before any payment intent; refused placement shows `checkout.coverage.noCapacity` and the next open date that passes capacity and `canServe`, never preselected.
- **Price shown = price charged:** the chip prints the delta of two projected totals before selection; summary, tier option, `Offer.price`, signed quote and charged total are one integer; a superseded peak row fails `verifyQuote` and asks for re-confirmation. `fromPrice` with `unavoidableSurcharge` never understates the headline (§8, UK CMA).
- **Earlier cutoffs** at the destination's local wall-clock instant (DST-safe); no countdown, no relative day label (spec 009 §13 Q4).
- **Honesty:** no remaining counts, "only N left", countdowns or any `PRESSURE_PATTERNS` match on buyer pages; capacity numbers appear nowhere public, only a date's state. Purges only on state changes and cutoff instants, never per order; robots, canonical, hreflang and sitemap unchanged by a purge.

## Read

- `specs/024-peak-capacity-surcharges.md`: `## 0. Index` first, then §2 "Capacity" (placement and picker), "Peak surcharges and price", "Earlier cutoffs"; §5.2, §5.3; §6; §8; §9 AC-8 to AC-11, AC-13 to AC-15, AC-18 to AC-20, AC-24, AC-27, AC-28, AC-34
- `docs/codebase-map.md`: where everything lives
- `src/modules/geo/` delivery resolver, the product page date picker and `src/modules/checkout/` placement
- `specs/009-product-page-date-picker.md` §13 (design Q3, Q4)

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
