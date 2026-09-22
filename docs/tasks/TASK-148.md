# TASK-148 — Price provider immutability: `staticPriceProvider.countryPrices()` returns its module-level array unfrozen, so a caller's `.length = 1` truncates every later read (3,332 rows → 1); return a frozen or copied value, and make the shared provider contract case mutate the **returned** value so it can fail — proved by mutation on both providers the contract runs

Row: `TASKS.md` → TASK-148. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-148`; keep it current by editing this file, not the row.

## Binding

- **The defect (TASK-143 escalation, 2026-09-23).** `staticPriceProvider.countryPrices()` returns
  its module-level array, unfrozen. A caller doing `.length = 1` truncates every later read, from
  3,332 rows to 1. Prices are money, and CLAUDE.md requires that the price shown is the price
  charged; a provider that any caller can corrupt breaks that for every later request in the
  process.
- **The test that should have caught it cannot fail.** The shared provider contract case mutates a
  *copy*. Make it mutate the value the provider **returned**, then read again and assert the second
  read is unchanged. Prove this on **both** providers the contract runs: remove the freeze or copy
  and the case goes red on each. Assert exact row counts, not `> 0`.
- **Fix in the provider, not at the callers.** Return a frozen value (`Object.freeze` deep enough
  for the rows) or a fresh copy per call. If you copy, say why in `## Result`, and note the cost at
  3,332 rows. Callers must not need to change. If one does, escalate.
- **Money, so a full `/review`.** Implementer gates are in `CLAUDE.md` §Definition of done.

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
