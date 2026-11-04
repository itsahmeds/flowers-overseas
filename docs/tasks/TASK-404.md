# TASK-404 — Header search: from `md` the search icon as a `<details>` summary in the `fo-mega` group whose panel holds the one `<form role="search" method="get">` (search path with the hidden `to` on a country URL, else `/{locale}/{chooseSegment}/search`), the phone row link, the Menu form, `headerSearchHref`, the `search` site link published with owner 045

Row: `TASKS.md` → TASK-404. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-404`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Spec 045 approved by the founder 2026-10-24 ("search ok, strong boost"), as amended by §14 A-orchestrator-2026-10-24 (design PR 404): no default search country, a search with no country goes through the chooser (spec 004 §14 A-founder-2026-10-24a, AC-73), "Did you mean" only on zero results, the header search is an icon opening a panel form. §13 Q14 and Q15 are open; their defaults bind until the founder answers. Build from the spec text on `main` once PR 404 has merged.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and, where the class keeps the breaker, the awkward cases. CI green on the head SHA. `pnpm gates:cheap` block pasted.
- **Countries are data** (founder 2026-10-24): no country literal, no `DEMO_DESTINATION_ISO2`, no `defaultSearchDestination` under `src/modules/search/` or the search routes. Never read IP, `cf-ipcountry`, `Accept-Language` or `fo_dest` to decide what to show (ADR-0006).
- **Class (DoD §4): review-only** (presentation), unless the reviewer calls the breaker. Owner: frontend-implementer, its own PR on `task/TASK-404-header-search`.
- **Sequencing:** starts only after TASK-383 and TASK-384 (the header and menu they rewrite) have merged: never two agents in `SiteHeader`, `MenuSheet` or `header-model.ts`. Needs TASK-385's chooser path and the results page (feature PR TASK-400 to TASK-403) on `main`.
- AC-1, AC-2, AC-34 as amended by A-orchestrator items 1 and 4: from `md` the icon is the `<summary>` of a native `<details>` in the `name="fo-mega"` group; its panel holds the header's one search form; with JavaScript off it opens and submits. The action is the search path with hidden `to` only on a URL naming a destination with a shop, else `/{locale}/{chooseSegment}/search`. Phone: the row link (with `?to=` on a country URL) and the same form in the Menu.
- No new island: "focus on open" only inside spec 004's existing deferred island and its byte budget. `HEADER_STICKY_HEIGHTS` unchanged; same prerendered routes as `main`; byte-identical HTML across cookies and headers.
- `src/config/site-links.ts`'s `search` entry `published: true`, `owningSpec: "045"`, a `route` target of page type `search`. Uses the reviewed keys `nav.search.label` and `nav.search.submit`; adds no key.

## Read

- `specs/045-site-search.md`: `## 0. Index` first, then only the sections named here
- `docs/codebase-map.md`
- spec 045 §2.1, §5.3 (header), §14 A-orchestrator-2026-10-24 items 1 and 4
- `docs/design/wireframes/search-results-desktop.dc.html` ("Header search opened"), `docs/design/system/components.dc.html` (search field), PR 372's chrome boards
- `src/modules/ui/layout/` header files (`SiteHeader`, `MenuSheet`, `header-model.ts`), `src/config/site-links.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-11-04 (SR404, self-review, not a `/review`): left for a built site, none run on the founder's no-CI night:
  (1) T-01's e2e half: the five pages at 1440 x 900, 768 x 1024 and 390 x 844 with JavaScript off (open the summary, submit; the phone link; the opened Menu's form), the served-body hashes across `fo_locale`, `fo_currency`, `fo_consent`, `fo_dest`, `Accept-Language` and `cf-ipcountry`, the header row's height against `HEADER_STICKY_HEIGHTS`, and the build's prerendered route list against `main`;
  (2) T-02: typing "roses" on `/en/poland/flowers` and pressing Enter loads `/en/search?q=roses&to=pl` (the hidden `to` follows the field so the address reads in that order), status 200, a card's link and price equal to the listing's;
  (3) visual baselines of the opened panel (1440, 1280, 768) and the phone row and Menu (390), `/ar-XB` mirrored; axe on the opened panel and the Menu (TASK-410 owns the axe pass).
- 2026-11-04 (SR404): the board's "the field takes focus on open", Esc and the close mark need script. A-orchestrator item 4 allows them only inside spec 004's existing deferred island and its byte budget; that island has no mega menu handling yet (TASK-384's hover, Esc and click-outside are not on `main`), and the budget can only be judged on a build. Not drawn rather than drawn dead (spec 004 A20); whoever adds the mega menu's Esc adds the search panel's with it.
- 2026-11-04 (SR404): "the header's exactly one form" is read per viewport: the DOM holds the panel's form (hidden below `md`) and the Menu's (hidden from `md`), as §2.1 asks for both; at any width exactly one is rendered. The e2e count should use visible forms.
- 2026-11-04 (SR404): the chooser page carries the words as a hidden `q` in its form (chips, "Continue to" and the typed country all submit it); the no-match state's path-form country links (`/{locale}/{chooseSegment}/{iso2}/search`) do not carry them, because no link we render may hold `q`.
- 2026-11-04 (SR404): `tests/unit/catalog-mega-menu.test.ts` "en/en-gb equals the pinned table for each shop country" is red on `main` too (FR featured prices 5390 vs 4690, 7090 vs 6190); not touched here.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-11-04 (SR404): stacked on TASK-403 (PR 497). `headerSearchHref(locale, iso2?)`, `headerSearchForm(locale, iso2?)` in `header-model.ts`; `src/modules/ui/layout/HeaderSearch.tsx` (disclosure in the `fo-mega` group, the GET form, the phone link); `SiteHeader` draws them from the mega menu's context (the URL's country with a shop) and passes the form to `MenuSheet`; `search` site link published for spec 045; the chooser page carries `q`. Spec 004's header tests updated to the drawn state; `header-search` (11) green; 10 mutations red.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

[PR 498](https://github.com/itsahmeds/flowers-overseas/pull/498), stacked on PR 497: from `md` the header row's search icon is the `<summary>` (44 px, named by `nav.search.submit`) of a native `<details name="fo-mega">`, closed in the server HTML, whose panel hangs under the row and holds the one `<form role="search" method="get">` (`q` with `maxlength="80"`, `autocomplete="off"`, `enterkeyhint="search"`, named and hinted by `nav.search.label`, the submit `nav.search.submit`); its action is the locale's search path with a hidden `to` on a URL naming a destination with a shop (the mega menu's context), else `/{locale}/{chooseSegment}/search`. Below `md` the 64 px row has an icon link to the search page (`?to=` in context) and the Menu holds the same form. No island, no new key, no new prerendered route; `HEADER_STICKY_HEIGHTS` unchanged. The `search` site link is published for spec 045 (`route`, page type `search`), and the chooser page carries the words on as a hidden `q`. Unit tests: 11 in `header-search`, spec 004's `ui-site-header` and `site-links-config` updated to the drawn state; no build, Playwright, Lighthouse or screenshot ran (founder's no-CI night).
