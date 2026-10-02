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
  proposal in `## Progress`). The tier selector needs 1: its legend ("Which size?"). The add-on
  rows need 1: "VAT {rate}", which the summary's VAT row shares. The price summary needs 2–4:
  "Delivery", "You pay", the demo heading ("Ordering is not open yet"), the demo line ("We are
  still choosing florists in {country}.") unless `catalog.availability.noPartner` is reused, and
  possibly a "{occasion}, {date}" surcharge-line label. Keys that can be reused: `catalog.tier.*`,
  `catalog.price.inclusive`, `catalog.availability.fxUnavailable`, `catalog.facet.occasion.*`,
  `a11y.media.gallery`, `media.placeholder.product`, `media.provenance.aiExample`, and perhaps
  `shop.empty.corridorLink` for the picker's corridor link. That puts `en` at about 42/518 = 8 %
  unreviewed, against the 5 % gate (`home-honesty.test.ts:285`). The founder needs to attest the
  list in one batch, or rule which drawn strings to drop. **Answered (founder, 2026-10-03): approve as we go.** Use the drawn texts verbatim, unreviewed; the batch went to the founder the same day.

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

## Result

**Partial: nothing shipped.** The role's 180-minute limit ran out during the reading phase, so
there is no code, no test and no PR. What was found is in `## Progress`, and two decisions are
`open` in `## Escalations`: E-1 (the facts block: the drawing and the spec disagree, and the fence
blocks reuse) and E-2 (about 19–21 new `en` keys against a gate with about 3 left). Re-dispatch
once E-1 is ruled, with the time limit re-armed.
