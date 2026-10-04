# TASK-200 — Spec 010 checkout core, no database: `src/config/checkout.ts`, `checkout-samples.ts`, `checkoutMode()`, `legalReadiness()`, `checkoutEntryFor()`, the step zod schemas, `addressFormModel()`, phone parsing with `libphonenumber-js`, `countGraphemes` in `format.ts`, `addonPriceProjection` (the spec 005 amendment), `QUOTE_SIGNING_SECRET` in `lib/env.ts`, the `en` checkout keys

Row: `TASKS.md` → TASK-200. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-200`; keep it current by editing this file, not the row.

## Binding

- `specs/010-checkout.md` §12 task 1. Owns **AC-1, AC-4, AC-8 (the `addressFormModel()` half: field order, required fields, label keys, `postcodeRegex` after `normalisePostcode`, a generic-only destination is `closed`), AC-9, AC-10 (the `countGraphemes` half: 200 accepted, 201 refused, a Polish letter, a Cyrillic letter and a ZWJ sequence each count one), AC-18**; tests **T-01, T-04, T-08 (unit half), T-09, T-10 (unit half), T-18**.
- **Scope (§5.2):** `src/config/checkout.ts` (steps, limits 200/40/120 graphemes, demo cap 200 per UTC day, quote lock 30 min, draft lifetime 24 h); `src/config/checkout-samples.ts` (one plainly fictional sample recipient and buyer per destination, labelled "Sample", `@example.com`, §13 Q12); `src/modules/checkout/{mode,schemas,address,phone,index}.ts`; `countGraphemes(text, locale)` in `src/modules/i18n/format.ts` (`Intl.Segmenter` is constructed only there, `fo/no-adhoc-intl`); `libphonenumber-js` as a server-only dependency; `QUOTE_SIGNING_SECRET` in `src/lib/env.schema.ts` and `.env.example` (005 §13 Q5); the `checkout.*` and `confirmation.*` `en` keys of Appendix A and the `en-gb` overrides ("postcode", "mobile").
- **The spec 005 amendment (§5.2):** `addonPriceProjection(addonKey, countryIso, locale)` in `modules/catalog`, mirroring `priceProjection()`: the same FX snapshot, buffer and rounding, integer minor units, the add-on's own VAT rate. Spec 005 AC-18's signature test is extended to it (no buyer-country parameter). Additive; rollback deletes the function.
- **`checkoutMode()` is pure** and decides every row of the §5.2 table from data: country `checkout.open`, `pickerState()`, `checkout.demo_guard`, `payments.stripe`, the Stripe key kind, `APP_ENV`, `legalReadiness()`, and the registered payment steps. It returns `test` only when spec 013 has registered a test step and never where `APP_ENV = production`; this task registers none, so Phase 0 yields `demo`. `legalReadiness(locale, buyerCountry)` is a conjunction of named predicates so AC-4 can make each one false in turn. `checkoutEntryFor(pickerState, deployment)` is database-free (the PDP calls it at build time, TASK-206).
- **AC-1's grep (ruling R5, decisions log 2026-10-05, "Specs 010, 011 and 012: cross-spec ownership"):** it covers code that reads a flag's value to decide a mode. `src/config/feature-flags.ts` (TASK-219) declares the keys and `/admin/flags` (TASK-220) toggles them; both sit on the test's allow-list by path, and the allow-list is a constant in the test. The database read of the two flags lives in `mode.ts` too, wired by TASK-203 through `isEnabled`.
- **No database** (`pnpm check:no-db` covers every file this task adds). Money is integer minor units with an ISO currency (`fo/no-float-money`); the currency equals the PDP's for the locale, the destination currency when FX is stale (005 §14 A3); no approximate-equivalents line in checkout.
- **No em dash in copy** (founder, 2026-10-05: "approve the wording just no em dash"; ruling R9 of the decisions log 2026-10-05, "Specs 010, 011 and 012: cross-spec ownership"). Where a spec string carries one, ship it with a full stop or a comma in its place, assert the message key and the substituted text, and list each changed string in the PR for the founder.
- **Review flags.** An `en` key is `reviewed: true` only with a `reviewedBy` naming the founder's batch approval of the spec's Appendix A; an agent never marks copy reviewed. Until that approval is recorded in the decisions log or the PR thread, the keys ship `reviewed: false`. `de` and `pl` are drafted by `pnpm i18n:draft` (spec 003 §14 A15) and stay `reviewed: false`.
- **Class:** not review-only (`CLAUDE.md` DoD §4): money (the add-on projection), the gate that decides whether a payment may happen, env and a new dependency. `/review` and `/break` both run.

## Read

- `specs/010-checkout.md`: `## 0. Index`; §2 ("One decision decides", "Money", "The date"); §5.2 (the `checkoutMode()` table, `legalReadiness`, the zod schemas); §7 (addresses and names, phones); §9 AC-1, AC-4, AC-8, AC-9, AC-10, AC-18; §10; §12 task 1; §13 Q9, Q12; Appendix A.
- `specs/005-catalogue-pricing-module.md` §13 Q5 and AC-18; `specs/009-product-page-date-picker.md` (`pickerState()`); `specs/003-i18n-foundation.md` §3 (what 003 left to 010).
- `docs/codebase-map.md`; `src/config/address-formats.ts`, `src/modules/i18n/format.ts`, `src/modules/catalog` (`priceProjection`, `quote`, `verifyQuote`), `src/lib/env.schema.ts`, `src/config/payment-methods.ts`.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (2026-10-05):** dispatchable now. No artboard binds this task (no UI), but its keys must read as the round-2 `wireframes/checkout-*.dc.html` Copy rows once `docs/design-round2-2026-10-05` merges; where they differ, the difference goes to the founder, not into the code.
- **From `/plan-tasks` (2026-10-05):** TASK-203, TASK-205 and TASK-207 go to the same backend agent, in that order, because they share `src/modules/checkout`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-05, em dash in `checkout.demo.place` ("Place demo order — nothing is charged") and the live "Continue — {total}":** to the founder through the PR. Default applied until answered: a full stop ("Place demo order. Nothing is charged."). `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
