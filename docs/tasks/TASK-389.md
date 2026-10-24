# TASK-389 — Cards in a country and equivalents on every price: the country card form ("from" with the exact all-in price, inclusive label, equivalents line, reserved delivery box, "Only in {country}"), `displayRateFor()` with `EQUIVALENTS_MAX_AGE_DAYS = 14`, equivalents in item 7's order on cards and the product page's price block and summary, never in JSON-LD, quotes or checkout

Row: `TASKS.md` → TASK-389. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-389`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Spec 008 AC-6 (as amended) and spec 004 items 7 and 8: the country card shows "from" with the smallest size's exact all-in price (`fromPriceProjection`, `catalog.price.from`), `catalog.price.inclusive`, the equivalents line, the reserved delivery box (filled by TASK-393), and `shop.card.localSpecial` on a product saleable in that one country; no rating, star, strike-through or add-to-basket.
- Equivalents (item 7, reversing A-founder-2026-10-19b clause 2): the other currencies of {GBP, EUR, USD, PLN}, never the displayed one, the locale's display currency first when different, then GBP, EUR, USD, PLN, mid rate without buffer, `catalog.price.equivalents`, 4.5:1, smaller than the price. Never in JSON-LD, `ItemList`, `Offer`, sitemap, meta, `priceTable`, a sort key, a band, a quote or checkout.
- `displayRateFor()` with `EQUIVALENTS_MAX_AGE_DAYS = 14`: a rate through the end of day `as_of + 14`, `null` after; `fxRateFor`, `MAX_FX_AGE_HOURS` and the stale fallback unchanged and spec 005 AC-35's tests unedited; `fxReasonKey` hides the line.
- **The founder's ask of 10-23** ("local pricing, as well as USD and GBP... also euros", on product pages and listings) is this task: the product page's price block and summary (spec 009 pointer) and every country card. Later placements (in-context featured cards TASK-383, not-available cards TASK-392, filled cards TASK-391) reuse this card and extend T-111.
- Class: keeps the breaker (money).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a items 7, 8, AC-105, AC-106
- `specs/008-country-shop-category-occasion-pages.md` AC-6
- `src/modules/catalog/pricing/equivalents.ts`, `src/config/catalogue/fx.data.ts`, the card component
- `docs/design/wireframes/country-shop-*`, `country-category-*`, `product-*`
- `docs/codebase-map.md`

## Carry-forwards

- **From `/plan-tasks` (orchestrator, 2026-10-24), keyless strings:** the boards mark several strings `[slot]` with no message key. Do not invent a key or text: list each one this PR needs, with a proposed key and text, in the PR and here as an escalation for the founder's copy batch.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

_Not started._

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
