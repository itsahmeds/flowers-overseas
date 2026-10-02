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
  as small as the drawings allow, and say the number in `- **2026-10-03 — stage 1, the page renders (combined dispatch with TASK-127).** The six primitives
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

## Result

**Partial — the page ships and every owned AC has unit evidence. Three stage-3 items remain.**
[PR #135](https://github.com/itsahmeds/flowers-overseas/pull/135) (draft, with TASK-127). The six
primitives and `ProductPage` are in `src/modules/ui/product/`, and the PDP route serves
`/{locale}/{country}/{product}/{slug}` from `productView()` alone. AC-7 (render half), AC-9,
AC-23 and AC-25 (slot half): `tests/unit/product-page.test.tsx` (19 cases). Each AC was broken once
and seen red (see `## Progress`). The e2e half is `tests/e2e/product-page.spec.ts` (22 passed
against `next dev` on port 3126 inside the build slot), and axe is `tests/a11y/product-page.spec.ts`
(8 passed, zero serious/critical after one `link-in-text-block` fix). `components.dc.html` is in
step, and its delivery-facts rows are redrawn to spec 007's.
**New `en` keys: 30**, 27 attested and 3 waiting (E-3). `pnpm gates:cheap`: typecheck, lint,
format, i18n, no-db and map are green. Tests are red only from E-3's 5.18 %.
**Remaining:** `/dev/components` entries for the six primitives; the sticky ≤390 px summary;
visual baselines (`darwin` locally, `linux` from CI); and the production-build run of
e2e/a11y/visual in the build slot.
