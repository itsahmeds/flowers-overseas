# TASK-298 — Spec 012b prices and margin

Row: `TASKS.md` → TASK-298. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 012b §12 slice A task 6. Founder approval 2026-10-20, "all defaults, keep going" (every §13 default; Q16: C2 yes, C1 in part, C3 no).
- **ACs owned:** AC-18, AC-19, AC-20, AC-21; tests T-18 to T-21 and T-39's AC-20 rows.
- Money is integer minor units plus an ISO currency: `parseMinorInput` has no `parseFloat`, no `Number(` on input text, no float literal (AC-18).
- `lowestPriceInLast30Days` includes the superseded amount; the visible price, JSON-LD `Offer.price` and `quote()` stay the same integer (AC-19).
- Add this task's commands to T-09's table (TASK-296).
- **Review class: keeps the breaker** (CLAUDE.md DoD 4): money and the Omnibus lowest price.
- New admin strings go in `messages/admin/en.json` only (the `admin` surface does not count toward spec 003 A17's share) and ship `reviewed: false`; the 012b artboards' `[slot]`s are proposed wording the founder approves as one batch. No public catalogue or meta file changes (AC-27).
- Migrations are numbered at implementation after the last one merged, each with a `.down.sql` the round-trip test runs (§12). Integration tests run on a throwaway local Postgres 16 only, never `.env.local`'s `DATABASE_URL` (Neon production).

## Read

- `specs/012b-cms.md`: `## 0. Index`, then §2, §5 and §9/§10 for the ACs below, and §14
- `docs/codebase-map.md`
- `src/modules/catalog` price providers, `admin-price-change-*`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **2026-11-11 (implementer, self-review):** (1) T-19's contract half (after a change, the PDP's visible price, JSON-LD `Offer.price` and `quote()` are one integer) is not asserted here: `supersedePrice` writes the rows spec 005's one database price provider reads, and the integration suite proves the 30-day lowest includes the superseded amount on those rows; the provider-level equality is owed to the e2e or a provider contract test. (2) T-20's e2e and T-39's `admin-price-change-*` visual are owed; the confirmation is server-rendered from the query (`country`, `tier`, `amount`), not a client island. (3) The margin view uses the newest EUR-based `fx_rate` day on or before today, at the mid rate (no FX buffer); a payout currency with no rate that day is named as unconverted rather than guessed. (4) `removeFromCountry` reads today in the country's zone through the price context, which needs a VAT row in that country (it answers `no_vat_rate` in a country with no price at all, where there is nothing to remove).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-11 implementer (with TASK-297, PR #543): `parseMinorInput`, `pricePreview`, `marginView`, `suggestedPrice` (pure, `src/modules/catalog/cms/`); `supersedePrice`, `replaceDraftPrice`, `previewPriceChange`, `marginTab` in `src/modules/admin/catalogue.ts`; the prices and margin tabs with the confirmation.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR [#543](https://github.com/itsahmeds/flowers-overseas/pull/543), with TASK-297. AC-18: `parseMinorInput(text, currency)` (`src/modules/catalog/cms/money-input.ts`) parses by character codes against the currency's exponent; `tests/unit/catalog-cms-prices.test.ts` pins AC-18's examples, a round trip for all eleven configured currencies over 212 integers each (dot and comma), and a source scan for `parseFloat`, `Number(` and float literals; the repo's `fo/no-float-money` lint covers the file. AC-19: `supersedePrice` closes the open row with `active_to` = today in the country's zone (23:30 UTC on 10 November is 11 November in Warsaw in the fixture) and inserts a new open row; the audit row of its one `UPDATE` names `active_to` and not `retail_minor`; a same-day second change is refused; `replaceDraftPrice` replaces a draft's price three times in a day and is refused once `first_active_at` is set, when a raw `DELETE` and `UPDATE … retail_minor` both raise (0044's guard). AC-20: `pricePreview` renders old and new in `en`, `en-gb`, `de`, `pl`, the change in basis points, the warning beyond 30 % (31 % warns, 29 % and 30 % do not) and the 30-day lowest; `PriceChangeSchema` is strict with no net or buyer-country key. AC-21: `marginView` gives the fixture's exact integers (22900 PLN at 8 %: VAT 1696, net 21204, payouts 12750 from EUR 30.00 at 4.25 and 12900, margin 8304, share 6084 bp), `suggestedPrice` 23900; a 66 % share needs a reason; a net equal to the highest payout is refused, one minor unit above is not. Tests: unit `catalog-cms-prices` (T-18, T-20, T-21, 33 cases); integration `catalog-cms` (T-19 and the margin refusal and reason).
