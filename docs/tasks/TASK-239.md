# TASK-239 — Poland reads "Ordering opens soon": status agrees with the pages, no cutoff text

Row: `TASKS.md` → TASK-239. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Keep it current by editing this
file, not the row.

## Binding

Founder ruling D2 A, 2026-10-14 ("R ok, D1–D5, …"; `docs/decisions-log.md`). Keeps the breaker
(dates and cutoffs; country data that decides what every page promises; `CLAUDE.md` DoD §4).

- **Spec 007 §14 A-founder-2026-10-14c, clauses 1 to 5. Owned: AC-33 (every surface except the
  checkout's closed state, which TASK-204 builds and owns), AC-34, AC-35 (T-34 to T-36).**
  1. One predicate: "ordering is open in a country" means exactly `deliveryDatesOpen(iso2)` in
     `src/config/countries.ts`. `corridorState(iso2) === "live"` implies it.
  2. Wherever a buyer page states a country's ordering state and the country is not open, the text
     is **"Ordering opens soon"** in `en` and `en-gb`: the destinations grid on the home and the
     destinations hub (today `destinations.state.guideNotDelivering`), the guide's state line, and
     the product page's primary-action status (today "Ordering is not open yet"). Change the
     **values of the existing keys** and name each key in the PR; rename or replace a key only
     where one key serves two meanings, and say so (TASK-188 and TASK-189 render these keys and
     must not break). Each changed `en`/`en-gb` value ships `reviewed: false` until the founder's
     own `record-approval` run; `de`/`pl` are drafts. Site-wide sentences not about one country
     (`infoPages.status.notYetOpen`, the demo sentence) are not changed here.
  3. The home sentence's country control marks a not-open country "soon" beside its name; none is
     marked or styled live unless open. Every country stays selectable; Continue is unchanged.
  4. No cutoff or order-by text while a country is not open: `nav.utility.cutoff`,
     `nav.utility.cutoffShort`, `finder.cutoff`, `faq.whoDelivers.answerCutoff`,
     `delivery.picker.live` and any later `reviewBeforeOrders` cutoff line render only for an open
     country, and the chrome ones only while `anyDeliveryDatesOpen()` is true.
  5. `status` agrees with the pages: `status === "live"` if and only if `deliveryDatesOpen(iso2)`.
     Poland becomes `demo` (today L303 `status: "live"`), and its `citiesKey` goes with it (the
     schema at L233 refuses a city list on a non-live country). Corridor and shop-root existence
     read `status === 'live' || guidePublished` and do not change; Poland's availability becomes
     `country.demo` (spec 005 §14 A4). Opening a country stays a data flip.
- **Spec 004 §14 A-founder-2026-10-14f (pointer):** A19's gate is spec 007 AC-34;
  `destinationStateKey()`'s "Delivering now" renders only for an open country.
- **Fixture:** the Poland-open fixture (operations block, an active-partner provider,
  `status: "live"`) shows Poland's live state and cutoff, and only for Poland.
- **Order and files.** This task edits `SentencePicker`, `DestinationsGrid`, `HomeFaq` and the
  product page's status line, so it waits for the home feature (TASK-231 and TASK-232) and the
  product feature (TASK-228 to TASK-230) to merge, and never runs beside TASK-188, TASK-189 or the
  TASK-233 feature PR on the same files.
- **Gates:** `pnpm gates:cheap` with the block pasted; CI green on the head with `ci:full`
  (AC-34's crawl is CI's); `/review` and `/break`. Mutations watched red, from T-34 to T-36: the
  destinations grid reading `country.status` again (Poland shows "Delivering now");
  `faq.whoDelivers.answerCutoff` rendered unconditionally; Poland set back to `live`.

## Read

- `specs/007-corridor-pages.md`: `## 0. Index`, then §13 Q3, §14 A9, A11, A12, A-founder-2026-10-14c
- `specs/004-design-system-layout.md`: §14 A19, A21 clause 4, A-founder-2026-10-14f
- `specs/003-i18n-foundation.md`: §14 A15 clause 4 (the cutoff key list), A17 clause 5
- `docs/codebase-map.md`
- `src/config/countries.ts` (L150 to L240, L295 to L380, L440 to L500), `src/modules/geo/corridor.ts`,
  `src/modules/ui/home/destination-status-provider.ts`, `DestinationsGrid.tsx`, `HomeFaq.tsx`,
  `SentencePicker.tsx`, `src/modules/ui/layout/header-model.ts`, `src/modules/ui/product/ProductPage.tsx`,
  `src/modules/catalog/availability.ts`

## Carry-forwards

- **From the site test (2026-10-14):** QA summary item 6: Poland `live` in the settings while every
  page says "not delivering yet", and "Order by 14:00 in Warsaw for delivery today" still renders
  in places; QA-5: "not yet" said four ways per page. `.claude/state/qa-2026-10-14/QA-5-content.md`.
- **Not this task:** spec 007 §13 Q11 (the `de`/`pl` destination rows' links) is open; with `de`
  and `pl` hidden (TASK-237) it affects only visitors who reach them by URL.
- **From the site test (2026-10-18, QA-1 and QA-2 on `c8d3b334`; screenshots in `.claude/state/qa-2026-10-18/`):**
  - N-06 (P1, QA-2): the destinations hub reads Poland as "Guide · not delivering yet" while the home says Poland is where to shop. When this task sets Poland's state line to "Ordering opens soon", the hub's line for Poland must agree (TASK-188 R6 prints the hub's state line).

## Escalations

_None recorded._

## Progress

- 2026-10-20: Poland `demo` with no `citiesKey`; `statusDisagreements()` (AC-35); the four `en` values changed (`reviewed: false`), `de`/`pl` redrafted; finder options all selectable with "(soon)"; the FAQ cutoff gated on Poland's own predicate. Ripples of the flip kept at today's output (see `## Result`). Commit `bbb01b8b`, draft PR 293.
- 2026-10-20: `tests/unit/ordering-state.test.tsx` (T-34/T-35/T-36 unit halves), `tests/e2e/ordering-state.spec.ts` (the AC-34 crawl and AC-33 surfaces), `tests/fixtures/poland-registry.ts` for the suites whose subject is the live path; four mutations watched red. Rebased on `df4a48f9`.

## Result

_Pending._
