# TASK-392 — Not available in the chosen country: `closestMatches(sku, iso2)` (colour and band, then colour, then band, then "Our order", then SKU, at most 3, core only), the chooser's 200 `noindex` page with the line, 3 cards at that country's prices and the back link, and the product page's destination control as the chooser's form

Row: `TASKS.md` → TASK-392. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-392`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Item 3 "A product not offered": the chooser renders with 200 and `noindex` `product.unavailable.line`, the 3 cards `closestMatches()` returns at that country's exact prices (TASK-389's card), and `product.unavailable.back`; never a 404 on this path.
- `closestMatches(sku, iso2)` pure in `src/modules/catalog`: core products saleable in `iso2`, never the product itself; same colour family and band, then colour, then band, then "Our order", then SKU; at most 3; bands by TASK-390's `priceBands()`, the original's in its own country.
- Spec 009 pointer: the product page's destination control becomes the chooser's form with `next=product/{slug}`; the URL's country wins.
- Class: keeps the breaker (prices on the matches).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a item 3, AC-83, AC-84
- `specs/009-product-page-date-picker.md` §14 A-founder-2026-10-24a pointer
- `docs/design/wireframes/product-unavailable-*`
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
