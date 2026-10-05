# TASK-200 — Spec 010 checkout core, no database: `src/config/checkout.ts`, `checkout-samples.ts`, `checkoutMode()`, `legalReadiness()`, `checkoutEntryFor()`, the step zod schemas, `addressFormModel()`, phone parsing with `libphonenumber-js`, `countGraphemes` in `format.ts`, `addonPriceProjection` (the spec 005 amendment), `QUOTE_SIGNING_SECRET` in `lib/env.ts`, the `en` checkout keys

Row: `TASKS.md` → TASK-200. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-200`; keep it current by editing this file, not the row.

## Binding

- `specs/010-checkout.md` §12 task 1. Owns **AC-1, AC-4, AC-8 (the `addressFormModel()` half: field order, required fields, label keys, `postcodeRegex` after `normalisePostcode`, a generic-only destination is `closed`), AC-9, AC-10 (the `countGraphemes` half: 200 accepted, 201 refused, a Polish letter, a Cyrillic letter and a ZWJ sequence each count one), AC-18**; tests **T-01, T-04, T-08 (unit half), T-09, T-10 (unit half), T-18**.
- **Scope (§5.2):** `src/config/checkout.ts` (steps, limits 200/40/120 graphemes, demo cap 200 per UTC day, quote lock 30 min, draft lifetime 24 h); `src/config/checkout-samples.ts` (one plainly fictional sample recipient and buyer per destination, labelled "Sample", `@example.com`, §13 Q12); `src/modules/checkout/{mode,schemas,address,phone,index}.ts`; `countGraphemes(text, locale)` in `src/modules/i18n/format.ts` (`Intl.Segmenter` is constructed only there, `fo/no-adhoc-intl`); `libphonenumber-js` as a server-only dependency; `QUOTE_SIGNING_SECRET` in `src/lib/env.schema.ts` and `.env.example` (005 §13 Q5); the `checkout.*` and `confirmation.*` `en` keys of Appendix A and the `en-gb` overrides ("postcode", "mobile").
- **The spec 005 amendment (§5.2):** `addonPriceProjection(addonKey, countryIso, locale)` in `modules/catalog`, mirroring `priceProjection()`: the same FX snapshot, buffer and rounding, integer minor units, the add-on's own VAT rate. Spec 005 AC-18's signature test is extended to it (no buyer-country parameter). Additive; rollback deletes the function.
- **`checkoutMode()` is pure** and decides every row of the §5.2 table from data: country `checkout.open`, `pickerState()`, `checkout.demo_guard`, `payments.stripe`, the Stripe key kind, `APP_ENV`, `legalReadiness()`, and the registered payment steps. It returns `test` only when spec 013 has registered a test step and never where `APP_ENV = production`; this task registers none, so Phase 0 yields `demo`. `legalReadiness(locale, buyerCountry)` is a conjunction of named predicates so AC-4 can make each one false in turn. `checkoutEntryFor(pickerState, deployment)` is database-free (the PDP calls it at build time, TASK-206).
- **AC-1's grep (ruling R5, decisions log 2026-10-05, "Specs 010, 011 and 012: cross-spec ownership"):** it covers code that reads a flag's value to decide a mode. `src/config/feature-flags.ts` (TASK-219) declares the keys and `/admin/flags` (TASK-220) toggles them; both sit on the test's allow-list by path, as do TASK-021's seed migration and the test fixtures that carry the key strings, and the allow-list is a constant in the test. The database read of the two flags lives in `mode.ts` too, wired by TASK-203 through `isEnabled`.
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

- **From `/plan-tasks` (2026-10-05):** dispatchable now. No artboard binds this task (no UI), but the merged round-2 `docs/design/wireframes/checkout-*.dc.html` (PR 189, `docs/design/audits/2026-10-05-round-2.md`) carry none of Appendix A's demo strings, and their guard band reads differently from Appendix A's banner. The keys follow Appendix A; the spec 010 design pass (`/design 010`) reconciles the boards, and any difference goes to the founder, not into the code.
- **From `/plan-tasks` (2026-10-05):** TASK-203, TASK-205 and TASK-207 go to the same backend agent, in that order, because they share `src/modules/checkout`.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-10-05, em dash in `checkout.demo.place` ("Place demo order — nothing is charged") and the live "Continue — {total}":** to the founder through the PR. Default applied until answered: a full stop ("Place demo order. Nothing is charged."). `open`.
- **2026-10-05, the `en` checkout keys cannot ship `reviewed: false` (TASK-200 implementer):** spec 003's gate (`isLocaleIndexable()`, 5 % threshold, `src/modules/i18n/review.ts`) counts every `en` key. `en` is at 22 of 537 unreviewed (4.1 %, room for about 6 more); the 65 checkout and confirmation keys take it to 87 of 602 (14.5 %), which turned `en` and `en-gb` `noindex` and failed about 30 SEO tests. An agent may not mark copy reviewed, so the keys are **not in `messages/`** in PR 201. The code names them (`CHECKOUT_ERROR_KEYS`, `PHONE_NON_LOCAL_KEY`, `PLACE_KIND_LABEL_KEYS`, `SAMPLE_LABEL_KEY`, the address label and placeholder keys). Two ways forward, for the founder or orchestrator: (a) the founder approves the batch below, and the keys ship `reviewed: true` with `reviewedBy` naming that approval; or (b) a spec 003 amendment excludes `noindex`-only namespaces (`checkout.*`, `confirmation.*`) from the share. The drafted `en` batch (Appendix A plus the strings the schemas and form need) is listed in full in PR 201's description, ready to paste. `en-gb` overrides: `checkout.address.postcode` "Postcode", `checkout.buyer.phone` "Your mobile number". `open`.
- **2026-10-05, codebase-map size cap (TASK-200 implementer):** `docs/codebase-map.md` was 16 239 B on main against `tests/unit/codebase-map.test.ts`'s 16 KB hard cap (145 B left). The new `checkout` module and two config files need about 320 B even with the shortest purpose lines. PR 201 raises the cap to 17 KB, with a cited comment. TASK-095's generator compression is the remedy. **Accepted** by `/review 201` round 1: a dated note in spec 001 §14 A16, and no further raise before TASK-095. `closed`.
- **2026-10-05, `QUOTE_SIGNING_SECRET` on Railway (founder step):** the key is optional at server start and required at use: a deployed environment without it throws on the first quote, and nothing issues one before TASK-203. Before TASK-203 merges, set `QUOTE_SIGNING_SECRET=$(openssl rand -hex 32)` on Railway `staging`, `production` and the PR environments, a different value per environment. `pnpm railway:check` reports it missing until then. `open`.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-05 `8cb213c8`: `QUOTE_SIGNING_SECRET` in the env contract (29 keys), with `quoteSigningSecret()` wired into spec 005's `quote.ts`; `addonPriceProjection()` and its schemas; `countGraphemes()`; `src/config/checkout.ts`; `libphonenumber-js`. Draft PR 201 opened.
- 2026-10-05 `13dba8f3`: the `checkout` module (`mode`, `schemas`, `address`, `phone`, `currency`, `index`), registered in `MODULES` and `docs/architecture.md` §3; `checkout-samples.ts`; the module files added to `check:no-db`.
- 2026-10-05 `e3b83bf9`: tests T-01, T-04, T-08 (unit half), T-09, T-10 (unit half), T-18, plus config, samples and the quote key. The shared `phones` fixture's AT row was corrected: `+43 1 1234567` fails the full metadata, so it is now `+43 1 5123456`.
- 2026-10-05 `681b4485`: the `en` keys were taken out (see Escalations); pins updated (railway contract 29/25, i18n barrel, Minor lists, no-db list); map cap set to 17 KB. 22 of 22 mutations of AC-carrying subjects went red. **Next (finisher):** `git fetch && git rebase origin/main`, `pnpm codebase:map` if the map conflicts, `pnpm gates:cheap` (the last full run's only reds were the en-indexability cascade, fixed in `681b4485`, and load timeouts: `dev-os`, `url-pii`, a load average of 30 to 40), push, `gh pr ready 201`, `gh pr edit 201 --add-label ci:full`, then set the TASKS row to `in_review` with PR 201. The row is still `in_progress`: the time limit blocked the `TASKS.md` edit.
- 2026-10-05 `29621c27`, `079cac31`: round 1 (`/review 201`, `/break 201`) answered: holes 1–5 and changes 2, 7–9; spec 001 A16 note; PR link in TASKS; gates PASS on `079cac31`.

## Result

**Ready for round 2.** PR 201, branch `task/TASK-200-checkout-core`. The code head is `079cac31`; the commit after it changes this brief only. Round 1 (`/review 201` FAIL, `/break 201` HOLES 1–5 on `22a5c780`, where CI was green) is answered in `29621c27` and `079cac31`.

What shipped:
- **Mode:** `checkoutMode()`, `legalReadiness()`, `checkoutEntryFor()`, and inside `mode.ts` only `stripeKeyKind()` and `CHECKOUT_FLAG_KEYS`, both now off the barrel (AC-1, AC-4, AC-8's closed row).
- **Address:** `addressFormModel()` (AC-8 model half).
- **Phones:** `parseRecipientPhone()` / `parseBuyerPhone()` on `libphonenumber-js/max`. "Local" means the destination's calling code (AC-9).
- **Graphemes:** `countGraphemes()`, and the 200/40/120 limits in the step schemas (AC-10 count half).
- **Currency:** `checkoutCurrency()` and `addonPriceProjection()` (AC-18; spec 005 amendment).
- **Schemas:** `CheckoutStartSchema`, `RecipientStepSchema`, `CardAndBuyerStepSchema`, `ReviewStepSchema`.
- **Env:** `QUOTE_SIGNING_SECRET`.

Round 1 fixes, one per finding:
1. The AC-1 scan parses every source file's syntax tree. It catches imports, renames, whole-module routes and string keys, not only literals.
2. Step 1 always requires the recipient's name and phone, and `AddressFormatSchema` refuses a row without them. No casts remain.
3. Each 120-grapheme limit is tested through the schemas.
4. Free text has a raw ceiling of 4 code units per grapheme, and 64 for short fields.
5. Controls and lone surrogates are refused. Invisible-only text counts as blank.
6. The development quote key is refused under `NODE_ENV=production` or an unparseable `APP_ENV`, and at boot when it is configured as the value.

Nit a (one converted literal pinned) and nit b (AT sample and cited file) are done.

**Tests:** 7 checkout unit files, 205 cases: `checkout-mode` 47, `checkout-address` 22, `checkout-phone` 31, `checkout-graphemes` 23, `checkout-currency` 19, `checkout-config` 26, `checkout-boundary` 31. Existing pins were extended: catalog barrel, project signatures, geo surface, env 29, railway contract 29/25, i18n barrel, no-db list, Minor lists, client graph.

**Mutations:** 22 of 22 red in round 0. In round 1, 19 of 19 red: M11/M11b/M11c (planted readers), G9/G11/G12/G12b (schema limits), H3/H3b (raw ceiling), H4–H4d (controls, invisible, line breaks), C2/C2b (missing phone), H5–H5c (signing key), N-a (literal).

**Rulings (`/review 201`):**
- The English checkout copy waits. It must land, founder-approved and `reviewed: true`, before TASK-201 or TASK-204 merges.
- The 17 KB map cap is accepted. The dated note is in spec 001 §14 A16, and there is no further raise before TASK-095.
- `QUOTE_SIGNING_SECRET` is optional at boot. The founder sets it on Railway before TASK-203 merges.

**Carry-forwards to later tasks:**
- TASK-203 wires the flag and key reads inside `mode.ts`.
- TASK-205 pins `addonPriceProjection().priceVersion` and the "PL lists no wine" rule in `listAddons()`.
- Pin `DEMO_ENTRY_ENVIRONMENTS` when §13 Q1 can change.

```
gates:cheap · 079cac31b5c9b64326daf86c31fe10f53ff4a939 · tree clean · base origin/main · 2026-10-05T05:56:28.068Z
typecheck             exit 0 · 2.5 s
lint                  exit 0 · 17.6 s
format:check          exit 0 · 11.6 s
i18n:check            exit 0 · 0.4 s
check:no-db           exit 0 · 0.2 s
codebase:map --check  exit 0 · 0.2 s
tests                 exit 0 · 245.0 s · changed 258 + map 0 + always 0 · always run: zod-boundaries, lint-coverage, url-pii
RESULT: PASS
```
(load average 5.7 at the start of the run.) No expensive gate was run locally; CI is the gate of record.
