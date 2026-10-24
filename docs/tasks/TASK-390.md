# TASK-390 — Country listings: 24 per page, spec 045's "Our order" by default, the price sort on the displayed card price, `priceBands()`, the `price` and `colour` facets on the shop root and country category (`noindex,follow`, GET forms only), local specials on their one country, `CategoryChipRow`'s "Also for {country}"

Row: `TASKS.md` → TASK-390. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-390`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Spec 008 A-founder-2026-10-24a: 24 per page (`?page=` past the last answers 404), spec 045's "Our order" by default (bands 0 until its signal), `price-asc`/`price-desc` on the displayed card price, `priceBands()` (integer minor units, nicest 1, 2, 2.5, 5 × 10^n, no typed thresholds), `FACET_PARAMETERS.priceBand = "price"` and `colour` on the shop root and country category (`noindex,follow`, canonical to the bare URL, in no sitemap, GET forms only, no `<a href>` with `price=` or `colour=`), local specials only on their country.
- `CategoryChipRow`'s "Also for Poland" becomes "Also for {country}" from the URL (one changed key; founder approval before merge).
- Do not touch the listing head (TASK-289, redrawn in design PR 347). Class: keeps the breaker (price sort, bands, facets).

## Read

- `specs/008-country-shop-category-occasion-pages.md` AC-9, AC-10 and §14 A-founder-2026-10-24a (AC-90 to AC-92)
- `docs/design/wireframes/country-shop-*`, `country-category-*`
- `src/modules/catalog/listing.ts`, `src/modules/ui/shop/CategoryChipRow.tsx`
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
