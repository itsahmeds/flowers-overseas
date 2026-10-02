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

_None recorded._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
