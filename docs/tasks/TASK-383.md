# TASK-383 — The mega menu: `megaMenuModel(locale, iso2 | null)` out of and in context, six native `<details name="fo-mega">` panels from `xl` (two rows `md` to `xl`), featured cards, `RECIPIENT_GROUPS`, Coming up across shop countries, the phone Menu accordions and the home's phone round links, the "Send flowers" pill and `DEMO_DESTINATION_ISO2` gone

Row: `TASKS.md` → TASK-383. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-383`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Item 5 (the mega menu and the header) and spec 043's pointer: `megaMenuModel(locale, iso2 | null)` from the existence functions, the taxonomy and the registry only (an entry whose page does not exist is not drawn); hub entries plain links, shop entries (colour, price, "All flowers", featured cards) chooser links with `rel="nofollow"`; in context every entry with a country page links it, others are absent, featured products are that country's at its exact price (spec 043 AC-50).
- Native `<details name="fo-mega">`, closed in the server HTML, panel inside the header frame (no shift), panel images lazy at most 384 px and 25,600 B, header plus Menu at most 6,144 B Brotli. The phone Menu: the selector first (TASK-384), then six accordions, no images. The home's phone round links (item 4) are drawn on the chrome boards and owned here (AC-104).
- Spec 043 AC-2 and AC-3 were rewritten in place; their pinned tables (T-01 to T-03, T-06) are regenerated from the model. AC-6 is met by the menu linking every hub out of context (closes TASK-288's escalation of the 20 unlinked category hubs).
- Removes `DEMO_DESTINATION_ISO2` from `src/config/site-links.ts` and the "Send flowers" pill (Q-24d). The Basket link slot is TASK-349's; keep its place at the row's end.
- Class: keeps the breaker (in-context featured prices).
- Merges after TASK-385 (every chooser href answers 200) and TASK-382 (featured cards render the core range).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a item 5, "Rendering", "Core Web Vitals", AC-99 to AC-104
- `specs/043-site-clarity.md` AC-2, AC-3, AC-6 and its A-founder-2026-10-24a pointer (AC-50)
- `docs/design/wireframes/chrome-desktop.dc.html`, `chrome-mobile.dc.html`, the "Commerce structure" group of `docs/design/system/components.dc.html`
- `docs/tasks/TASK-288.md` (the header slot this builds on)
- `docs/codebase-map.md`

## Carry-forwards

- **From the implementer (2026-10-25), left for the finisher of this PR:** (1) the e2e and a11y specs that pin the old row (`tests/e2e/header.spec.ts`, `header-in-context.spec.ts`, `links.spec.ts`, `chrome-honesty.spec.ts`, `phone-chrome.spec.ts`, `deferred-chunks.spec.ts`, `frame-laptop-band.spec.ts`, `head-dash-scan.spec.ts`, `home.spec.ts`, `home-v3.spec.ts`, `motion.spec.ts`, `product-v3.spec.ts`, `tests/a11y/home.spec.ts`) still look for `data-fo-header-item`, `data-fo-menu-item` and the Send pill; rewrite each against `megaMenuModel()` (AC-99, AC-101's keyboard half, AC-102, AC-104) and then delete `tests/fixtures/header/out-of-context-hrefs.json`; (2) AC-103's Brotli byte test of header plus Menu (render `SiteHeader` with the `en` model and a country listing's, `brotliCompressSync`, at most 6,144 B) is not written; (3) the home's phone round links (item 4, AC-104's last clause) are not built: the media manifest has no 144 px variant (smallest is 384 px, 10 to 23 KB), so AC-104's 6,144 B per image needs a pipeline variant first (a new row for spec 006); (4) the dead header registry (the `category-row-*` site links, `src/config/categories.ts`, `headerCategoryItems`, `inContextListingHrefs`, `destinationShopLinks`) is no longer drawn and can be deleted with its tests; (5) `DEMO_DESTINATION_ISO2` stays in `src/config/site-links.ts` for its two remaining readers (`TrendingRow`, the home's shop link), which TASK-386 replaces; whoever removes the last reader deletes it; (6) the Destinations panel's "grouped by region past 12 entries" is not built (7 today); (7) in-context featured cards render the listing card's default-tier price, as country listings do today; "from" with the smallest size and the equivalents line arrive with TASK-389 for both; (8) screenshots at 1440, 1280 and 390 against the boards are not taken yet.

- **From `/plan-tasks` (orchestrator, 2026-10-24), keyless strings:** the boards mark several strings `[slot]` with no message key. Do not invent a key or text: list each one this PR needs, with a proposed key and text, in the PR and here as an escalation for the founder's copy batch.
- **From `/plan-tasks` (orchestrator, 2026-10-24), board escalations of PR 372:** the For whom label for "a loved one" fails the voice scan (it is a `[slot]`; use only the spec's `nav.mega.recipient.*` keys); the Destinations panel's "Ordering open" group keys on `deliveryDatesOpen`, never on a status string.

## Escalations

- **2026-10-24, the colour shape** (`open`): see TASK-381; colour entries use the colour's category hub key where one exists, else the shop root, as the spec says.
- **2026-10-25, copy headroom trips** (`open`, founder): the 24 new keys (`nav.mega.*` 19, `shop.price.choose`, `shop.cta.chooseCountry`, `shop.price.bandWord.low/mid/high`), all from the amendment's i18n table, ship `reviewed: false`. `i18n:check`'s share: `en` 4.4% and `en-gb` 4.6% before, 8.3% and 8.4% after, so English is `noindex` on this branch and about 70 unit/contract cases that pin English as indexable go red (sitemaps, hreflang, PDP schema, indexability). They turn green when the founder records approval of the 24 keys on the branch (`record-approval`); nothing else is needed for them. The PR cannot merge before that.
- **2026-10-25, the partner label** (`open`, founder): `nav.mega.recipient.partner` ("For your partner") fails the voice scan (`src/config/voice.ts`); the board draws it as a `[slot]`. `RECIPIENT_GROUPS` holds the other four; the partner group (to `romance`) is one line once the founder gives wording. Proposed key `nav.mega.recipient.partner`, text for the founder to choose.
- **2026-10-25, AC-103's 6,144 B and the logo** (`open`, spec writer or founder): the header's logo lockup is 3,503 B of Brotli by itself (the wordmark's 11 KB of inline path data, TASK-176), and the header without any menu is 4,642 B. Read literally, AC-103 leaves 1,502 B for the six panels and the Menu, which item 5's ~60 entries and four featured cards cannot fit (the menu adds 2,832 B after its markup was shared between the panels and the Menu's accordions). `tests/unit/ui-mega-menu-bytes.test.tsx` counts everything but the two inline SVGs (3,917 B on `/en`, at most 3,584 B pinned for the SVGs). The question: does AC-103 mean the menu's markup, or the whole banner with the logo? If the whole banner, the logo needs an external sprite first.
- **2026-10-25, ten occasion-kind category hubs stay unlinked out of context** (`open`, spec writer): item 5's table names occasion hubs (`/occasions/birthday`), not the category hubs of kind `occasion` (`/flowers/birthday-flowers`, and nine more). The menu links the other ten of TASK-288's twenty; AC-6's e2e pin keeps the ten that are left by name.
- **2026-10-25, By price in context** (`open`, designer): the spec's table says By price has no featured card; the board's frame 12 draws one in context. Built as the spec says (none).
- **2026-10-25, the stack** (`open`, orchestrator): the work order said "build on main", but `megaMenuModel()` needs TASK-381's `chooserPath`, `coreRange` and `shopCountries`, so the branch is stacked on PR 412 (`task/TASK-381-commerce-foundation`), as TASK-385 is; the PR's base is that branch until 412 merges.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-25 (implementer): branch stacked on PR 412. Done: `src/config/mega-menu.ts` (`RECIPIENT_GROUPS`, panel keys), `megaMenuModel()` in `src/modules/catalog/mega-menu.ts` with its data seam, the model schema in `src/modules/ui/layout/mega-model.ts`, `MegaMenu.tsx` (six `<details name="fo-mega">` panels, featured cards, phone accordions), `SiteHeader` and `MenuSheet` rewired (no Send pill, 76 px row from `xl`, 64 + 48 px rows from `md`), the `@header` slot passing the route's model, the panel image cap (`maxWidth` 384 in `resolveMedia`), 24 new keys `reviewed: false`, pinned model tables for `en`, `en-gb` and every shop country. Unit tests green for the files touched: `catalog-mega-menu`, `ui-site-header`, `ui-phone-chrome`, `header-slot`, `motion-markup`, both barrels. Next: the carry-forwards above (e2e rewrite, AC-103 bytes, round links, screenshots), then the founder's copy approval.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

_Pending._
