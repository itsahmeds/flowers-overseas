# TASK-066 — FX and rounding: `pricing/fx.ts` (`fxRateFor` failing **closed** past `MAX_FX_AGE_HOURS = 48`, `convert` pure/total/integer-only, `FX_BUFFER_BP = 250`) and `pricing/round.ts` (`roundToStyle`, upward-only, per the currency's `x99 | x90 | x9 | none`)

Row: `TASKS.md` → TASK-066. Brief written by `pnpm tasks:migrate` (spec 001 §14 A15, AC-34);
keep it current by editing this file, not the row.

## Binding

Branch `task/TASK-066-fx-rounding`. Spec 005 §13's 2026-09-09 resolution note is binding: Q1 EUR/GBP `x90`, PLN `x9`, HUF `x90`; Q2 ECB daily rates, 2.5% buffer, 48 h max age then destination currency; Q3 add-ons priced per country with their own VAT rate; Q4 plain stem-count / S-M-L / single tier names; Q5 30-minute signed quote, secret lands in spec 010; Q6 middle tier preselected via `product_tier.is_default`; Q7 surcharges as dated rows; Q8 all three schema amendments folded into spec 002's `0003` (spec 002 §14 A1); Q9 this spec owns the dataset in `src/config/catalogue/*.data.ts`; Q10 no money on destination-less hubs; Q11 EUR/GBP/PLN only behind `currency.{code}` flags. Conversion is exactly `amountMinor x rate_ppm x (10 000 + FX_BUFFER_BP) / (1 000 000 x 10 000)` in integers, then **psychological rounding upward, never nearest** — rounding down could put the charged amount below the converted cost, and the 250 bp buffer exists to absorb intraday movement, not to be eroded by rounding. The implementation contains no `/` producing a non-integer, no `Math.round` on money and no `Number` division of an amount, asserted by lint **and** a source scan (AC-12); expectations come from the hand-computed PLN→GBP / PLN→EUR / EUR→PLN table in `tests/fixtures/catalogue.ts` (TASK-069 owns the fixture file; transcribe the FX table here and move it there). Fail-closed is the point of AC-15: a rate older than 48 h returns `null`, `priceProjection()` falls back to the destination currency with `reasonKey = "catalog.availability.fxUnavailable"`, and **no converted amount appears anywhere in the output tree** — a stale rate never becomes a displayed price. `roundToStyle` is monotone and never returns below its input, over a generated range per style. ECB publishes on working days only, so a Monday rate is Friday's; that is what the buffer is for (§13 Q2). Gates: `lint`, `typecheck`, `test-unit`, `catalogue-check`. Tests: T-10, T-13.

## Read

- `specs/005-*.md` — read `## 0. Index` first, then only the sections the ACs below name
- `docs/codebase-map.md` — where everything lives
- `src/config/catalogue/*.data.ts`
- `tests/fixtures/catalogue.ts`

## Carry-forwards

_None recorded._

## Escalations

_None recorded._

## Result

Done. PR [#51](https://github.com/itsahmeds/flowers-overseas/pull/51); `/review` pass recorded in `TASKS.md`.
