# TASK-314 — Polish classic-rose prices for the odd stem counts: FO-BQ-001, -003 and -007 in PL at `stems_11` 199 zł, `stems_15` 239 zł, `stems_21` 329 zł (the three-SKU ladder override), the PL `classic` ladder 199/229/259 zł, `catalogue:check` band mode for those SKUs, and the pricing runbook entry

Row: `TASKS.md` → TASK-314. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-314`; keep it current by editing this file, not the row.

## Binding

Spec 005 §14 **A-founder-2026-10-15a** points 2, 3, 9 and its **AC-37, AC-38, AC-39** (read them in full). In short:
- AC-37: in `prices.data.ts`'s expanded retail rows, FO-BQ-001, -003 and -007 in PL are `stems_11` 19 900, `stems_15` 23 900 and `stems_21` 32 900 PLN minor units, default `stems_15`; the PL `classic` ladder is 19 900 / 22 900 / 25 900.
- AC-38: the ladder overrides are exactly point 2's table (three SKUs, PL only, three tier keys each); `catalogue:check` band mode holds those three SKUs in PL to 19 900 to 32 900 and every other row to its unchanged band.
- AC-39: `docs/runbooks/pricing.md` gains a "Changes made in place" entry: merge date, the six cells old and new, FO-BQ-004's count change, and point 9's rule that no reduction is announced.
- Found by TASK-240's implementer and ruled by its reviewer (PR 305, 2026-10-21): today these three bouquets cost 229/259 zł for 15/21 stems against the founder's 239/329 zł, so the shop under-charges. Must land before the indexing flip and before ordering opens (TASK-096).
- Money is integer minor units; price shown = price charged; JSON-LD Offer equals the visible price. Keeps the breaker (money).
- Starts after TASK-240 (PR 305) merges: it builds on the `stems_{n}` keys.

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

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
