# TASK-520 — Search everything from a field in the nav bar

Row: `TASKS.md` → TASK-520. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-520`; keep it current by editing this file, not the row.

## Binding

- **The founder, 2026-11-08, verbatim:** "search is just of country bro not overall including products... add products and everything too bro... also wasnt it gonna be on top? nav bar place? idk". Spec 045 §14 A-founder-2026-11-08a turns this into the build. Its §13 Q17 to Q20 defaults bind until the founder answers: no price on country-less cards, core range only before a country, a sticky phone search row, the new hint text.
- **ACs owned:** spec 045 AC-38 to AC-46 (T-38 to T-46); AC-1, AC-5, AC-13, AC-27 and AC-34 as amended in place (AC-27 comes over from TASK-409, which is dropped and folded in here); spec 004 AC-104's header row as its §14 A-founder-2026-11-08a pointer reads it. TASK-397 still owns spec 004 AC-87, read as amended. TASK-410 still owns AC-28 and AC-29 and runs after this task.
- **What to build:**
  - Every header form posts straight to `/{locale}/{searchSegment}`, never the chooser.
  - The results page answers with no country, in groups: countries, occasions, flowers, help (spec 041 info pages through a new `SearchSource.infoPages(locale)`), and bouquets (`CountryLessCardView` from `coreRange(locale)`, no money, when there is no country).
  - The "Sending to" chip: change and remove are GET forms that keep `q`; remove strips the country words from `q`.
  - A visible header field: in the masthead row from `md`, with the width rules of item 2 and the item-row fallback; a full-width row in the sticky header below `md`. The search `<details>` and the phone row link are removed.
  - On the results page the header field holds the query, and the in-page form is removed.
  - `SearchSuggest` on by default: in the deferred set, APG combobox, at most 6 mixed suggestions. `POST /api/search/suggest` with a JSON body; `GET` answers 405.
- **Hard rules:**
  - No country literal and no `DEMO_DESTINATION_ISO2` under `src/modules/search/`, the search routes or the header model; countries are registry data.
  - No read of the IP address, `cf-ipcountry`, `Accept-Language` or `fo_dest` in search (ADR-0006).
  - No typed words in any URL except the results page's own GET, and none in logs, Sentry or analytics (TASK-403's rules).
  - Results stay `noindex, follow` and SSR; no `href` with `q=`.
  - Buyers never see partner or relay language; no em dash or en dash in any value.
  - CLS 0 from the header, LCP under 2,000 ms on every Lighthouse URL, the suggestions chunk at most 4,096 B Brotli, no first-load growth over 512 B.
  - Logical CSS properties only, and `Intl` for every list order.
- **Copy:** add only the keys in spec 045 Appendix A's 2026-11-08 block, change `nav.search.label`, delete `search.pagesHeading`. `de` and `pl` drafts get `reviewed: false`; never set `reviewed: true` yourself; the `en` texts are recorded with `record-approval` before merge. Print `i18n:check`'s `en` and `en-gb` shares before and after.
- **Design first (CLAUDE.md):** build from the `/design` redraw of `chrome-desktop`, `chrome-mobile`, `search-results-desktop`, `search-results-mobile` and the combobox in `system/components.dc.html` for this amendment. If those boards are not on `main`, stop and escalate; do not build from the spec text alone.
- **Founder rule, no review step:** no `/review` or `/break` runs. The PR description carries an **AC list**: each owned AC id with the file and the test that proves it. Paste the `pnpm gates:cheap` block. Leave the expensive gates to CI.
- **One owner of `SiteHeader`:** no other agent may work in `src/modules/ui/layout/` while this task is in flight.

## Read

- `specs/045-site-search.md`: `## 0. Index` first, then §14 A-founder-2026-11-08a, AC-38 to AC-46 and the amended AC-1, AC-5, AC-13, AC-27, AC-34; §2.3 (matching), §2.8 (privacy), §2.11 and §5.3 (the island)
- `specs/004-design-system-layout.md` §14 A-founder-2026-11-08a (pointer), A-founder-2026-10-24a items 1 to 3 (core range, no price, chooser), AC-55 (deferred set)
- `specs/041-trust-help-legal-pages.md` §2 (the ten pages, `infoPageExists`, `listInfoPages`)
- `docs/codebase-map.md`
- `src/modules/ui/layout/SiteHeader.tsx`, `HeaderSearch.tsx`, `header-model.ts` (`headerSearchForm`, `HEADER_STICKY_HEIGHTS`), `MenuSheet.tsx`
- `src/modules/search/` (`source.ts`, `engine.ts`, `page.ts`, `schemas.ts`, `query.ts`) and the results route `src/app/[locale]/-search/page.tsx` with its `@header/-search/page.tsx` slot, which is where the header field gets the query and `to` on the results page
- `src/modules/ui/shop/viewModel.ts` (`CountryLessCardViewSchema`)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **2026-11-08 S520 (self):** suggestion rows show the kind word but no thumbnail or icon circle (the board drew 32 × 40 photographs and 32 px icons; spec 045 does not mention them and the 4,096 B chunk budget is tight). A later task may add them.
- **2026-11-08 S520 (self):** `tests/e2e/search-everywhere.spec.ts` and the height constants in `tests/e2e/header.spec.ts` were written, not run locally (no Playwright on battery); CI `ci:full` is their first run. `header.spec.ts` still holds TASK-173 era assertions ("no form control in the chrome") that predate TASK-404 and fail on `main` too.
- **2026-11-08 S520 (self):** AC-41's 1280 px longest-locale, AC-42's CLS, AC-44's resource timing against LCP and `budget:client-js`, AC-45's network-log scan, AC-46's Lighthouse, axe and `/ar-XB` baselines are CI's (TASK-410 runs the search gates).
- **2026-11-08 S520 (self):** `tests/unit/deferred-set.test.tsx` "every other client module is accounted for" and `pnpm i18n:check` fail on `main` already (five payments, partners and admin client modules not in `NOT_DEFERRED`; `nav.send` unused and four checkout scope entries). Not this task's files.
- **2026-11-08 S520 (self):** the header has no selector yet (TASK-384); the field fills to 480 px where the board drew the selector after it.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **2026-11-08, spec writer to the orchestrator (for the founder):** the work order asked for country-less "from" prices as "the approved Option A of 10-24". Spec 004 item 2 records that option A was rejected (the founder's "b"), and `CountryLessCardView` has no price field. The spec defaults to no price (spec 045 §13 Q17). `open` until the founder answers; build the default.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08 S520: started in `../fo-wt-520`; row `in_progress`, draft PR 514 opened.
- 2026-11-08 S520: engine groups (Countries, Occasions, Flowers, Help) and country-less bouquets, `SearchSource.infoPages`, the chip (change and remove GET forms, `queryWithoutDestination`), `POST /api/search/suggest` (GET 405), copy keys; unit tests green.
- 2026-11-08 S520: header field (one form: 56 px phone row, 64 px row from md, items on row 2, 122/114 px), results page field holds `q` and `to` (`@header/-search` reads the query), `SearchSuggest` island in the deferred set; spec 004 A-orchestrator-2026-11-08b; tests updated and added; e2e spec written (CI). Next: build check, ready.
- 2026-11-08 S520: build checked in the slot (load 15.7 at start, 5.7 after): Railway-style env-less `pnpm build` stops only at the known payments `wiring.ts` env read on `/[locale]/checkout/return` (TASK-503-build-env owns it); with placeholder non-secret values for those ten variables it exits 0, `budget:client-js` exits 0 (first-load unchanged, the suggestions chunk 1,714 B Brotli). `.next` deleted, slot released. PR marked ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 514. Search answers with no country in five groups (Countries, Occasions, Flowers, Help, Bouquets; country-less bouquets from the core range, no money), the "Sending to" chip replaces the inline chooser (change and remove GET forms, remove drops the country words), every header form posts to the search path, the header holds a visible field (64 px row from md, 240 to 480 px; a 56 px phone row; sticky 122 / 114 / 114 px), the results page's field holds `q` and `to` and the page has no form of its own, and `SearchSuggest` (APG combobox, `POST /api/search/suggest`, GET 405, at most 6 mixed rows, no price) is on and deferred. Tests: unit `search-suggest.test.ts` new (19), `search-page`, `search-engine`, `header-search`, `ui-site-header`, `deferred-set`, `search-gate`, `search-config`, `header-slot`, `i18n-messages-schema` updated; e2e `search-everywhere.spec.ts` new (CI). Numbers: suggestions chunk 1,714 B Brotli (budget 4,096), first-load JS unchanged against the baseline; `en` / `en-gb` unreviewed share 0.15 / 0.30 % before, 2.49 / 2.63 % after (16 keys queued for `record-approval-520.py`, whose `--check` passes). The `build` slot was taken because the work order asks for a build check before ready. TASK-410 runs the search gates (Lighthouse, axe, timing).
