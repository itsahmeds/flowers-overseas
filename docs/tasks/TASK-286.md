# TASK-286 — Add-ons as a ruled price list

Row: `TASKS.md` → TASK-286. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

Spec 004 §14 A-founder-2026-10-19c: "item 8 redraws `product-*` only, and spec 009 AC-23 as rebound by
A-founder-2026-10-14c already binds the static price list ('no spec change', README row 8)". README row 8, option A:
"A plain ruled price list: no VAT rate on a row, one VAT sentence for the section, the card reads 'Included'".

- Restyle the product page's add-on block so no row looks like a control: name and all-in price per row in the page's
  currency, ruled rows, one VAT sentence for the section, the card row reading "Included", no `<input>`.
- **ACs re-verified:** spec 009 AC-23 as rebound (T-23, T-38); AC-33 and T-36 (the add-on section in every picker
  state, nothing priced inside a closed `<details>`); a visual baseline at 1440 and 390.
- Amounts and the add-on projection do not change. **Review class: review-only (presentation);** if the diff touches
  the add-on price projection, the VAT sentence's text or any money value, the PR keeps the breaker; say which in the
  PR.
- Reuse the existing reviewed add-on keys; no new key.
- **Copy headroom is zero** (`en-gb` unreviewed share 4.98% of spec 003 A17's 5%). Add no counted message key: reuse a reviewed key with the identical wording, or stop and report the key and its proposed text. Never set `reviewed: true`.
- **Spec 043 (site clarity)** is being drafted now on branch `docs/spec-043-site-clarity`. It may later change the header, the listing chips and the cards. Build to today's approved clauses; do not anticipate 043, and do not edit its draft.

## Read

- `specs/009-product-page-date-picker.md` §14 A-founder-2026-10-14c (AC-23 rebound), AC-33
- `docs/design/wireframes/product-{desktop,mobile}.dc.html` (after TASK-278)
- `src/modules/ui/product/AddonPriceList.tsx` (per the codebase map)

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/plan-tasks` (orchestrator, 2026-10-20):** after TASK-278. Product page: never beside TASK-128, TASK-129, TASK-249 or TASK-287.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-20 (frontend-implementer → orchestrator): **review class.** The 8A artboards name `nav.utility.pricesInclude` ("Prices include delivery and VAT") as the section's VAT sentence, above the rows; the page printed `catalog.price.inclusive` ("Includes VAT and delivery") under them. Built to the artboard, so the VAT sentence's text changes and, per this brief, the PR keeps the breaker. No amount, no projection and no key changes. Answer: open.
- 2026-10-20 (frontend-implementer → orchestrator): **the allergen line is not on the page.** The 8A artboards draw `catalog.addon.allergen` under the list, but `AddonLine` (the catalog view model) carries no `allergenNoteRequired`, so the line cannot be shown only where a food add-on is listed without a catalog-module change outside this task. Not built here; proposed as its own row (spec 005 §7, plan/10 §1.1). Answer: open.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-20 (frontend-implementer): `AddonPriceList` restyled to 8A (one rule over the list, one under each row, no fill/radius/shadow/pointer; the VAT sentence once, above the rows, as `nav.utility.pricesInclude`, the key the artboard names); unit + e2e tests red first, then green; next: visual baselines from CI (`visual:baselines`).

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
