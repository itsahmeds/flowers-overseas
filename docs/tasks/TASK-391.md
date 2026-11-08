# TASK-391 — The remembered country fills prices after load: the cached `/api/prices/{locale}/{iso2}` document (ISR, public, no cookie read, robots-disallowed, at most 8,192 B Brotli), the island's price, equivalents and href fill on country-less pages, "Sending to {country}" with "change destination", and the URL rule's update of an existing `fo_dest`

Row: `TASKS.md` → TASK-391. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-391`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Item 3 "With a remembered country": `/api/prices/{locale}/{iso2}` (route handler, ISR 3,600 s, tag `catalog:{iso2}`, public cache, reads no cookie, robots-disallowed, at most 8,192 B Brotli) holds per core product the server-formatted card price, equivalents and slots, and the `next`-key link map. The island, only with `fo_dest` naming a shop country, fills each card's reserved boxes, removes "Choose where to send", rewrites every chooser href to the country's URL (else the path form) and shows `shop.chosen.line` with `product.destination.change`. Server HTML byte-identical with and without the cookie; layout shift at most 0.01.
- **Orchestrator's design call (delegated, 2026-10-24):** once a country is remembered and the fill runs, the `shop.hub.noMoney` line is replaced by the "Sending to {country}" line in the same reserved box (it would be untrue beside prices). AC-75 stays about the served HTML.
- URL rule (AC-81): on a country page, an existing `fo_dest` naming another shop country is updated to the URL's; no `fo_dest` is ever created by a URL.
- Class: keeps the breaker (prices, a cookie).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a item 3, "Rendering", AC-80, AC-81
- `docs/design/wireframes/home-*`, `occasion-hub-*` (the remembered-country states)
- `docs/codebase-map.md`

## Carry-forwards

- **Owed to the later test pass:** T-86 and T-87 e2e (byte-identical served HTML with and without `fo_dest`, layout shift at most 0.01, the fill against the shop root's cards in a browser, JavaScript off unchanged, the `Set-Cookie` scan of cached responses) and the **deferred island byte share**: the fill and URL rule ride the existing `motions` chunk (`src/modules/ui/shop/remembered-country.ts`, about 150 lines of source); its Brotli growth was not measured (no build run) and must be printed against the 2,560 B shared budget.
- **Prices document size:** measured in unit, Brotli 795 to 883 B per document (en/pl, en-gb/de, de/pl, pl/pl), well under 8,192 B.
- **Deferred island budget, shared:** TASK-384 (hover, selector label), TASK-385 (history replace), TASK-391 (fill, URL rule) and TASK-393 (countdown) together add at most 2,560 B Brotli to the existing deferred set, no new island on any route (spec 004 item "Rendering"). Print this PR's share and the running total; if it will not fit, drop the hover first (Q-24g), then stop and report.
- **From `/plan-tasks` (orchestrator, 2026-10-24), keyless strings:** the boards mark several strings `[slot]` with no message key. Do not invent a key or text: list each one this PR needs, with a proposed key and text, in the PR and here as an escalation for the founder's copy batch.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._ (No `[slot]` string was needed: `shop.chosen.line` is in the amendment's table and `product.destination.change` is reviewed.)

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-08 (builder L390, in PR 504 with TASK-390): `rememberedPricesView()` and `pricesDocuments()` (`src/modules/catalog/remembered-prices.ts`), the route `src/app/api/prices/[locale]/[iso2]/route.ts` (ISR 3,600 s, `public` Cache-Control, no cookie/header/query read, 404 outside launch locales and the shop set), its paths under `catalog:{iso2}` in `src/lib/cache.ts`, the island half in `src/modules/ui/shop/remembered-country.ts` called from `MotionIsland` (no new island), `shop.chosen.line` added unreviewed. Done; PR ready.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 504 (with TASK-390). With `fo_dest` naming a shop country on a country-less page (the header's `data-fo-mega-context` empty), the motions chunk fetches `/api/prices/{locale}/{iso2}` once after paint, fills each card's reserved price box (`data-fo-card-ask`) with the server-formatted "from" price and inclusive wording and the CTA box with the equivalents line (no-break space when none), rewrites chooser links from the link map (home, every category and occasion hub, each core product) or to the path form (price bands, products not sold there), and swaps the no-money box for `shop.chosen.line` with the reviewed "change destination" link. On a country page an existing `fo_dest` naming another country becomes the URL's; none is created. Unit: 15 cases in `tests/unit/remembered-country.test.ts` (fake DOM, the view against the shop root's cards, the route's headers, 404s and Brotli size). The cache pins in `cache-invalidate`/`cache-product-tags` now include the prices documents.
