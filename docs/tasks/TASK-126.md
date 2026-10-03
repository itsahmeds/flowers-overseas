# TASK-126 — PDP UI primitives in `src/modules/ui`: `Gallery` (hero + thumbs / placeholder), `TierSelector`, `DeliveryDatePicker` (grid, disabled date with its visible reason in the accessible name, occasion highlight, selected, `unavailable` empty form), `DateChip` (included / surcharge / closed), `AddonPriceList` (read-only rows, free card as a zero-priced line, no `<input>`), `PriceSummary` (normal / surcharge / stale-FX / demo / sticky), `DeliveryFacts` reuse; `/dev/components` and `system/components.dc.html` in step

Row: `TASKS.md` → TASK-126. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-126`; keep it current by editing this file, not the row.

## Binding

- **Scope, from spec 009 §12 task 6.** `Gallery` (hero + thumbs, and the no-photo placeholder),
  `TierSelector`, `DeliveryDatePicker` (the grid; a disabled date with its visible reason in the
  accessible name; the occasion highlight; the selected date; the `unavailable` empty form),
  `DateChip` (included / surcharge / closed), `AddonPriceList`, `PriceSummary`, and the reuse of
  `DeliveryFacts`. Each primitive appears on `/dev/components`, and
  `docs/design/system/components.dc.html` stays in step with `src/modules/ui`. Build pixel-for-pixel to the seven
  PR #69 drawings (`system/components.dc.html`, `wireframes/product-desktop.dc.html` and
  `product-mobile.dc.html`).
- **ACs owned.** AC-9 (each selectable chip prints "included" or the exact surcharge from
  `dateSurcharges()`; selecting changes exactly one total; there is no second money element).
  AC-23 (add-ons as read-only rows: name, per-country price, own VAT rate, **no input element**,
  and the free card as a visible zero line). AC-7's render half (the reason as visible words beside the date
  **and** in the accessible name, never colour or opacity alone). AC-25's slot half only: the
  `Gallery` takes `priority`. TASK-127 owns AC-25 itself.
- **Rulings that apply.**
  - Q6: in `preview`, the closed chips share one sentence.
  - There is no purchase affordance and no checkbox (§13 Q6, Q7).
  - The tier labels are spec 005's ICU plural keys, with stem counts, never adjectives.
  - Money goes through `formatMoney` only, dates through `formatDate` (weekday + month name), and times through
    `formatTimeInZone` with a named IANA zone.
  - No date literal appears in any component or string.
  - The primitives render from `productView()`'s types (TASK-125). They compute no money themselves.
  - `<bdi>` wraps the name/price and label/amount pairs, and logical CSS only.
- **Tests.** T-07 (e2e half), T-09 and T-23, through `/dev/components` and unit tests, plus the
  `/dev/components` a11y spec (zero serious/critical).
- **Copy: the English review gate has no headroom.** `en` is at 22/498 = 4.4 % unreviewed
  on `main`, and PR 98 will bring it to 25/511. `home-honesty.test.ts:285` asserts
  `isLocaleIndexable("en")`, so any PR past 5 % turns CI red. Reuse existing keys wherever they
  exist (`catalog.tier.*`, `catalog.surcharge.*`, `catalog.addon.*`, `a11y.*`). Every new `en`
  key is the implementer's draft, `reviewed: false`, listed in `AWAITING_FOUNDER_REVIEW` and in
  `## Escalations` with its exact text, for the founder to attest. Keep the count of new keys
  as small as the drawings allow, and say the number in `## Result`. `de`/`pl` are drafted by
  `pnpm i18n:draft`.

**Merged with TASK-127 as PR 135 (`966c2e87`) on 2026-10-03; live on production.**

## Read

- `specs/009-product-page-date-picker.md`: `## 0. Index`, then §5 (the tier selector, the date picker,
  add-ons, the summary), §7's i18n bullets (L227–233), §9 AC-7, AC-9, AC-23, AC-25, §10 T-07, T-09, T-23,
  §12 task 6, and §13 Q6/Q7.
- `docs/codebase-map.md`: `src/modules/ui` and the `catalog` module (`productView()`'s types).
- The drawings: `docs/design/system/components.dc.html` and `docs/design/wireframes/product-{desktop,mobile}.dc.html`.
- TASK-108 (`66800190`) is the pattern: the UI primitives under `src/modules/ui/shop/`, the
  `/dev/components` entries, the components-file sync, and the a11y spec.

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review N` (YYYY-MM-DD):** what must change or be carried into this task.
- **From `/review 135` round 1 and `/break 135` round 1 (2026-10-03), required (one PR for
  TASK-126 + TASK-127):** (1) replace the PR description with TASK-126/127's own, referencing every
  AC the two briefs own; (2) AC-1 trailing slash → 308 to the bare URL, recorded in spec 009 §14 A7
  (orchestrator ruling) with one e2e case; (3) TASK-126 `## Result` declares that the cutoff time is
  printed raw and the city comes from `zoneCity()`, not `formatTimeInZone`; (4) fix the mobile
  `chrome-honesty.spec.ts:87` red on `/dev/components` ("order-by cutoff promise": a cutoff line
  shown only on phones is not lifted by the sweep); (5) close breaker HOLE 1 (PDP robots tag:
  `INDEX_FOLLOW` at `[grandchild]/page.tsx:252` passes every test), HOLE 3 (`TierSelector.tsx`
  42/92/99: each tier's own price, the preselected size and the stem count), HOLE 4 (a chip's
  printed date tied to its value: `labels.ts:33`, `DateChip.tsx:112`, and the summary's
  surcharge-line date `PriceSummary.tsx:128`), HOLE 5 (a closed date can print "included",
  `DateChip.tsx:115`) — each with a test that goes red under the breaker's mutation; (6) rebase on
  main (PR 136 changed `messages/*` and the visual baselines) and CI green on the new head.
- **Accepted (`/review 135` round 1):** HOLE 2 ACCEPTABLE (PDP canonical; owned by TASK-132,
  AC-17); HOLE 6 ACCEPTABLE (page layout order; owned by TASK-133, AC-28); HOLE 7 ACCEPTABLE
  (country shop-root card links; TASK-131's crawl must cover the shop roots).
- **From `/review 135` round 2 and `/break 135` round 2 (2026-10-03), required:** HOLE 8, a
  one-tier product's price and label (`TierSelector.tsx:67/69`) — `tests/unit/product-page.test.tsx`
  "prints a one-tier product's own price and its own label, in `en` and `pl` (HOLE 8)", red under
  a wrong price at :69, `en` formatting at :69 and a wrong label at :67. HOLE 9, the A19 controls
  must read through the sweep's own read — `tests/e2e/chrome-honesty.spec.ts` `sweptText()` is the
  one hide/read/restore function for the sweep and the planted-promise case, and "on
  /dev/components the lift takes a marked cutoff line and leaves an unmarked one beside it"; with
  the read returning `""` both controls went red on both projects (local production build).
  **Ruled out of this PR:** a promise nested inside a marked node is lifted with it — carried to
  TASK-133: check every `[data-fo-cutoff]` node's text is exactly its catalogue line; and
  "Arrives tomorrow" matches no pattern in `tests/support/listing-honesty.ts:65` — a nit for the
  next task that touches that file.
- **From `/review 135` round 2 (2026-10-03), HOLE 10 ACCEPTABLE (copied by the orchestrator after
  merge):** widening the sweep's lift from the product state boxes to every `[data-fo-cutoff]` on
  a page leaves all 58 `chrome-honesty` cases green. Accepted because hiding a real promise takes
  two visible changes and no line outside the product page is marked today; carried to TASK-133.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **E-1 (2026-10-03, implementer → orchestrator → founder): `DeliveryFacts` — the drawing and the
  spec disagree, and the fence allows neither reading.** Spec 009 §5.3 and the drawing's own note
  say "Spec 007's block reused unchanged, not re-implemented". The drawing
  (`system/components.dc.html`, "Delivery-facts summary") instead draws **different rows**:
  Delivering / Order-by time / Soonest date / What the price covers, plus a new sentence
  ("Nothing is added at a later step."). Spec 007's block (`src/modules/geo/ui/CorridorFacts.tsx`)
  prints Order by / Delivery days / Sundays / Cities we reach / Prices from. Reusing it is not
  possible inside this task's fence. It lives in `geo/ui`, the geo barrel does not export it, it
  takes a whole `CorridorView`, and `geo/ui` imports the `ui` barrel, so a `ui/product` import of
  it would be a runtime cycle. Choose one: **(a)** reuse unchanged. `geo` exports `CorridorFacts`
  with a narrowed prop (`{ facts, nameKey, locale }`), TASK-127 mounts it, and the drawing is
  redrawn to 007's rows. This edits `geo`, which is outside TASK-126's fence. **(b)** a new
  `ui/product/DeliveryFacts.tsx` with the drawn rows. That is a re-implementation and needs about
  4–5 new `en` strings. Recommendation: (a). It adds no new copy, and §5.3 says "reused". **Answered (orchestrator, 2026-10-03): (a).** The fence includes the `geo` export.
- **E-2 (2026-10-03, implementer → orchestrator → founder): the copy gate will go red, by about
  20 keys.** There are no `delivery.*` or `product.*` keys on `main` (counted). Counted from the
  drawings, the six primitives need at least these new `en` keys, about **19–21** in total. The
  date picker needs 15: its legend ("When should it arrive?"), "included", "selected", the submit
  button ("Use this date"), the five calendar reasons (`beforeEarliest`, `pastCutoff`,
  `publicHoliday`, `sundayClosed`, `notDeliveryDay`), the three picker notices `unavailable` /
  `preview` / `live` (the live one is the cutoff line), and possibly `notOrderable` (see the
  proposal in ``). The tier selector needs 1: its legend ("Which size?"). The add-on
  rows need 1: "VAT {rate}", which the summary's VAT row shares. The price summary needs 2–4:
  "Delivery", "You pay", the demo heading ("Ordering is not open yet"), the demo line ("We are
  still choosing florists in {country}.") unless `catalog.availability.noPartner` is reused, and
  possibly a "{occasion}, {date}" surcharge-line label. Keys that can be reused: `catalog.tier.*`,
  `catalog.price.inclusive`, `catalog.availability.fxUnavailable`, `catalog.facet.occasion.*`,
  `a11y.media.gallery`, `media.placeholder.product`, `media.provenance.aiExample`, and perhaps
  `shop.empty.corridorLink` for the picker's corridor link. That puts `en` at about 42/518 = 8 %
  unreviewed, against the 5 % gate (`home-honesty.test.ts:285`). The founder needs to attest the
  list in one batch, or rule which drawn strings to drop. **Answered (founder, 2026-10-03): approve as we go.** Use the drawn texts verbatim, unreviewed; the batch went to the founder the same day.
- **E-3 (2026-10-03, implementer → orchestrator → founder): three `en` keys beyond the approved
  28, and one approved string not built.** The page needs three strings no drawing carries as
  approved copy: `delivery.reason.beforeEarliest` ("This date has passed") and
  `delivery.reason.notDeliveryDay` ("We do not deliver on this day in {country}"), the two calendar
  reasons no drawing shows but the calendar can produce, and `product.trust.substitution.body`
  ("We substitute to the same value, style and colour, and we tell you what changed."), which the
  artboard draws beside a `[slot]`. With them `en` was 28/541 = 5.18 % unreviewed, over the 5 %
  gate. Separately, the related row's "See all {count}" link stays **unbuilt**: `ProductView`
  carries no count, and a number the view model cannot back is not printed. So the approved 28
  are used 27. **Answered (founder, chat, 2026-10-03, "approve 3"):** the three keys are attested
  byte-for-byte (`reviewedBy: "founder (chat, 2026-10-03; PDP keys 29–31)"`), and `en` is
  25/541 = 4.62 %. "See all {count}" stays unbuilt until a view model carries the count.
- **E-4 (2026-10-03, implementer → orchestrator): spec 007's "Prices" row on the PDP.** Spec 007's
  facts block prints a "Prices" row, which in the guide state says there is no price on the page.
  The PDP prints its own all-in price two blocks further down, so that row would be false there,
  and a "from" price is the one thing a PDP may never show (AC-21). The narrowed `DeliveryFacts`
  export takes `prices: "omit"` and the PDP passes it; every other row is 007's, unchanged.
  **Accepted (orchestrator, 2026-10-03):** leaving the row out is right, because the PDP does show
  a price.
- **E-5 (2026-10-03, implementer → orchestrator): the vase sentence on a product with no
  photograph.** The approved exclusion sentence (`product.excludes`, "What the price does not
  include: a vase. The photograph is styled with one…") gives the photograph as its reason. On
  the no-photo placeholder (72 of 84 products) there is no photograph, so the sentence's reason is
  false there. **Ruled (orchestrator, 2026-10-03):** the sentence renders **only when the product
  shows a photograph**; with the placeholder it is omitted. The vase stays in the add-on list. No
  new string.

## Progress

- **2026-10-03 — stopped at the role's time limit, before any code was written (partial).** I read
  the brief, the spec 009 sections it names, `productView()`'s types (`src/modules/catalog/product.ts`),
  `modules/geo/delivery` (`types.ts`, `calendar.ts`, `schemas.ts`), the `ui` barrel, TASK-108's
  `ui/shop` pattern, the drawings' spec 009 group, and the existing `en` keys. Nothing is
  implemented and no tests are written. `TASKS.md` was not edited, because the guard closed it
  before the status flip. The findings below are for whoever picks this up:
  - **Import direction.** `ui` imports only `i18n` and `config`, and `catalog` imports `ui` at runtime
    (`ProductCardViewSchema`, `altFor`, `assetsForProduct`). So `ui/product/*` may take
    `ProductView`, `TierOption`, `AddonLine`, `DateTotals`, `DeliveryReasonKey` and similar as
    **`import type` only**. Importing a value from `@/modules/catalog` or `@/modules/geo` is a
    runtime cycle.
  - **`notOrderable` and Q6.** The `preview` chips share one sentence. Proposal: closed `preview`
    chips print no text of their own, and each radio's `aria-labelledby` lists its date label and
    the preview notice's id. Both halves of AC-7 then hold (the reason is visible, once, and it is
    in every chip's accessible name) without breaking Q6.
  - **The submit button** ("Use this date") is drawn inside the picker, but the form is TASK-128's.
    Proposal: render it only in `live`, and only when a date is selectable. A button that
    submits nothing selectable would be the same lie as a checkbox that does nothing.
  - **The drawn "peak day" text on a chip** cannot be rendered from data: `DeliveryDate` has a
    surcharge `Money` but no surcharge kind. Proposal: print the occasion name and the fee, and
    redraw the sheet to match.
  - **The sticky summary and AC-9.** "No second money element" means the ≤390 px sticky bar must be
    the **same** summary element restyled, not a second bar that repeats the total.
  - **T-09 on `/dev/components`.** There is no island (TASK-129) and no form (TASK-128) yet, so
    "selecting" needs a GET form on the gallery that reads `?date=`. Its fixture `ProductView`
    must pass `ProductViewSchema` in a unit test. For the "hard-coded fee → red" check to bite,
    the expected fee has to come from `dateSurcharges()` and `priceProjection()`, never from the
    fixture's own literal.
  - **The sheet.** Shipping the six drawings also deletes the "None of the seven exists in
    `src/modules/ui` today" paragraph (`components.dc.html` L320) and the spec 009 clause of the
    "Specified, not yet shipped" note (L116).

- **2026-10-03 — stage 1, the page renders (combined dispatch with TASK-127).** The six primitives
  are in `src/modules/ui/product/` (`Gallery`, `TierSelector`, `DateChip`, `DeliveryDatePicker`,
  `AddonPriceList`, `PriceSummary`) with `ProductPage` assembling them in block order; the depth-4
  route gains the product branch with `dynamicParams = true`; `site-links.ts` publishes `product`,
  so the Poland listing cards are links; spec 007's facts block is reused through a narrowed
  `DeliveryFacts` export from `geo`. Copy: the founder's 27 approved strings (of 28; "See all
  {count}" is not built, see `## Escalations`) are `reviewed: true`, three new keys wait.
  Screenshots on `pnpm dev`: `docs/tasks/assets/TASK-126/listing-en-poland-roses-desktop.png`,
  `docs/tasks/assets/TASK-126/pdp-en-poland-amber-hour-desktop.png`,
  `docs/tasks/assets/TASK-126/pdp-en-poland-amber-hour-mobile.png`.

- **2026-10-03 — stage 2, unit layer.** `tests/unit/product-page.test.tsx` (19 cases: AC-7, AC-8,
  AC-9, AC-10, AC-21, AC-22, AC-23, AC-25) and `tests/unit/product-route.test.tsx` (4 cases: AC-1)
  render the real `productView()` in all three picker states (Poland `preview` from its authored
  block, `live` through `withActivePartnersProvider`, the six others `unavailable`). Each AC was
  broken once on purpose and seen red: fee +1 on the chip, reason dropped, `preview` chips
  enabled, a checkbox in an add-on row, the VAT row renamed, `priority={false}`, a second
  `data-fo-price-total`, "basket" in the demo box, `dynamicParams = false`, the product branch
  dropped. One mutant survives by construction: the route's `notFound()` on an `undefined` view
  after the resolver said yes cannot be reached without moving data under a running page.

- **2026-10-03 — stage 3a, copy gate and E-5.** The founder's "approve 3" is applied to the three
  keys whose `en` text is byte-identical to his list; `AWAITING_FOUNDER_REVIEW` loses them and `en`
  is 25/541 = 4.62 % (`home-honesty.test.ts` green). E-5: `PriceSummary` prints the vase sentence
  only beside a photograph; three unit cases, one per branch, and both conditions were broken on
  purpose and seen red (sentence shown on the no-photo product; vase clause dropped). This brief's
  Read, Carry-forwards, Escalations and first Progress bullet, lost from the stage-2 commit, are
  restored from `fbad137c`.

- **2026-10-03 — stage 3b, the sticky summary and `/dev/components`.** The summary's own total
  row docks below `sm` (640 px, so the 390 px artboard and every phone): the same element
  restyled, one `data-fo-price-total`, one live region; the bar's size/date line and its status
  line (demo sentence, or live the cutoff) are `aria-hidden` repeats. A named breakpoint, because
  an arbitrary `min-[…]:` once emptied the stylesheet (TASK-048); pinned. The document reserves
  room through `body:has()` padding and `html:has()` scroll padding. Unit case (moving the docked
  style onto the section went red) and an e2e case at 390 px. `/dev/components` gains "Product and
  date-picker blocks": every drawn state of the six primitives from fixtures built through
  `productView()`'s own schemas and parsed against the calendar's in a unit case; no summary
  docks there (four bars would cover the listing blocks' mobile baselines). `tests/visual/
  product.spec.ts` adds seven PDP baselines (three states × two widths, plus the docked bar).

- **2026-10-03 — stage 3c, the production build.** In the build slot (load 4.7 at acquire, 10.1
  at release), `pnpm build` from `.env.example` and `next start -p 3126`: e2e `product-page` +
  `dev-components` on both projects 68 passed / 2 skipped (the case-insensitive-host skips),
  a11y `product-page` + `dev-components` 11 passed with zero serious/critical, visual
  `product` + `listing` + `notices` green after the darwin refresh. The build printed the product
  existence table once. The first PDP visual draft shot all of `main`; it was dropped because the
  date grid moves with the build date (`corridor.spec.ts`'s precedent), and the PDP is now shot by
  date-free block.

- **2026-10-03 — TASK-127 E-1 fixed by spec 009 §14 A6 (finisher run, shared PR).** Every
  product page is prebuilt (2 352 in four locales); the listing cards' 420-per-locale dead links
  are gone. The six E-1 e2e cases pass on a local production build. Evidence and build times are
  in TASK-127's `## Progress` and `## Result`. No TASK-126 file changed.

- **2026-10-03 — `/review 135` round 1 fix round (finisher).** Rebased on `origin/main` (PR 136):
  one conflict, the visual manifest, resolved to main's two `occasion-hub` hashes plus this PR's
  eleven `product-*` entries; `messages/*` and the codebase map merged clean. No PNG this PR owns
  prints the florist sentence (the PDP baselines are date-free blocks; the gallery's fixtures are
  not seed copy), but the longer sentence in the description above moved three desktop blocks by a
  fraction of a pixel (`product-desktop-addons` 212 → 211 px, CI run 37083501768). Those three
  (`-addons`, `-summary`, `-picker-unavailable`) were re-shot by `visual-baselines` run
  37084269614, all three opened (content unchanged), committed with the manifest: 104/104. The mobile A19 red was a race in
  the sweep, not a missing mark (below). HOLES 3, 4 and 5 closed in `tests/unit/product-page.test.tsx`,
  each seen red under the breaker's mutant and green once restored.
- **2026-10-03 — CI on `06b48066`:** e2e green on both projects (1 198 passed, 6 skipped, no
  flaky), including the mobile `/dev/components` A19 case and the new 308 case; `visual` red only on
  the sub-pixel shift above, fixed by the re-shot baselines.

- **2026-10-03 — `/review 135` round 2 fix round (finisher).** HOLES 8 and 9 closed, see
  `## Carry-forwards`. HOLE 9's red was watched on a local production build in the build slot
  (load 1.60 at acquire, 6.83 at release; `pnpm build` 101 s; `chrome-honesty` 58/58 green on
  both projects, 4 red under the empty-read mutant, the server stopped by its PID).

## Result

**Done, in review — [PR #135](https://github.com/itsahmeds/flowers-overseas/pull/135) (with
TASK-127).** The six primitives and `ProductPage` are in `src/modules/ui/product/` and on
`/dev/components` ("Product and date-picker blocks", every drawn state); `components.dc.html` is
in step.
- **AC-9:** `tests/unit/product-page.test.tsx` (chip fee = two projections' difference; one total
  moves by exactly the chip; the docked bar is the summary's own total row, one
  `data-fo-price-total`, one live region), the gallery and PDP e2e at 390 px.
- **AC-23:** unit (no input element, card a zero line) and gallery e2e.
- **AC-7 render half:** unit (reason in the label), e2e (reason in the computed accessible name).
- **AC-25 slot half:** the hero is the page's one `priority` image (unit).
- **E-5:** the vase sentence renders only beside a photograph; three unit cases, both conditions
  seen red when broken.
- **Copy:** 30 new `en` keys, all attested by the founder on 2026-10-03 (27 + 3, E-3); `en` is
  25/541 = 4.62 % unreviewed. "See all {count}" stays unbuilt (E-3).
- **The founder's 28, accounted for (orchestrator check, 2026-10-03).** Strings 1–27 each sit on
  exactly one key, byte-identical, marked `founder (chat, 2026-10-03; PDP batch of 28)`
  (`delivery.legend`, `.picker.unavailable`, `.corridorLink`, `.picker.preview`,
  `.reason.notOrderable`, `.reason.sundayClosed`, `.reason.publicHoliday`, `.reason.pastCutoff`,
  `.cutoffPreview`, `.picker.live`, `.submit`; `product.included`, `.selected`, `.tier.legend`,
  `.addons.label`, `.vat`, `.summary.delivery`, `.summary.total`, `.demo.heading`, `.demo.body`,
  `.excludes`, `.destination.label`, `.destination.change`, `.trust.label`,
  `.trust.substitution.title`, `.related.label`, `.related.heading`). No marked key carries
  unapproved text. #28, "See all {count}", is in no catalogue because the page does not render it.
- **Tests:** unit `product-page` 24, `product-route` 5; e2e +2 gallery cases, +1 PDP sticky case;
  visual +11 PDP baselines (`darwin` here, `linux` from `visual-baselines.yml`), and the gallery's
  `dev-components-desktop` and seven 1 px-shifted listing parts refreshed.
- **Declared deviation, the cutoff's formatting (`/review 135` round 1, required change 3).** The
  binding clause says times go through `formatTimeInZone`. The page does not: the picker, the
  chips' `pastCutoff` reason and the docked bar print the destination's **authored**
  `sameDayCutoffLocal` ("14:00") **raw**, and the city comes from `zoneCity()` (`labels.ts`), which
  reads the IANA zone the view carries (`Europe/Warsaw` → "Warsaw"). That matches the approved copy
  ("Order by {time} in {city}") and spec 007's facts row, which prints the same authored value;
  there is no instant to format, only a wall-clock time already in the recipient's zone. The cost,
  carried as `/review 135` nit 1: `zoneCity()` is the zone database's English exemplar, so once
  `de`/`pl` are translated "Warsaw" would sit inside German and Polish sentences. That belongs to
  the de/pl PDP translation task, as a per-destination city key.
- **`/review 135` round 1 required change 4, the mobile `/dev/components` A19 red.** The marking
  was right: the trace of CI run 37080265401 shows the lift removed all four marked nodes
  (`{"n":4}`: the live and preview picker lines, the two live summaries' docked lines), then a
  React #418 hydration error, after which React re-rendered the tree on the client and the lines
  were back before `innerText` read the body. Only the slower `e2e-mobile` project lost that race.
  `tests/e2e/chrome-honesty.spec.ts` now hides the same `[data-fo-product-state] [data-fo-cutoff]`
  set, reads `body.innerText` and restores, all in one synchronous `evaluate`: same lift list,
  same whole-document sweep, no DOM left changed for React to undo.
- **HOLES 3, 4, 5 (`/break 135` round 1).** `tests/unit/product-page.test.tsx`:
  "prints every tier's own `formatMoney(price)` and stem-count label, in three locales" (red under
  `TierSelector.tsx:99` every radio at the selected tier's price, and `:42` count 1); "checks
  exactly the selected tier" (red under `:92` last tier preselected); "prints each chip's own
  `data-fo-date` as its date" (en, pl; preview, live; red under `labels.ts:33` one day early and
  under the breaker's `T02:00Z` + `DateChip.tsx:112` `America/New_York`); "dates the summary's
  surcharge line, and the docked bar, with the chosen chip's date" (red under `PriceSummary.tsx:128`
  one day late, and under `labels.ts:33`); "prints no `included` fee on any closed chip" (four
  locales, preview and live; red under `DateChip.tsx:115` `true`). The expected date is built
  without `instantOf()`, so a shift there cannot move both sides. Unit `product-page` is 29.
- **Accepted holes:** HOLE 2 (canonical, `page.tsx:253`) → TASK-132, AC-17; HOLE 6 (block order,
  `ProductPage.tsx:140/179/201`) → TASK-133, AC-28; HOLE 7 (shop-root card links,
  `[child]/page.tsx:424`) → TASK-131's AC-20 crawl must include the country shop roots.
- **Expensive gates run locally**, because the change adds baselines and a docked element whose
  position only a browser computes; CI is the gate of record.
