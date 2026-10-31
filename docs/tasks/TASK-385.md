# TASK-385 — The country chooser: `/{locale}/{chooseSegment}/{next}` (SSR, uncached, `noindex`, robots-disallowed, in no sitemap), its form and no-match list, the choice's 303 with `Set-Cookie: fo_dest` (path form too), the `fo_dest` cookie register row and policy line, the history replace in the deferred island, no geo or language read

Row: `TASKS.md` → TASK-385. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-385`; keep it current by editing this file, not the row.

## Binding

- **Approval.** Founder 2026-10-24: "shop ok", "apply shop", "b" (no price before a country; a country must be chosen before any priced page), "trust" ("our florist" stays), "2" (trust bar option 2), "trust copy ok". Countries are data: no code names a country (AC-73).
- **Spec and design are on `main`:** spec 004 §14 A-founder-2026-10-24a (PR 391, with its pointers in specs 005, 007, 008, 009, 010, 011, 012b, 043) and the commerce boards (PR 372). Match the artboards named under Read pixel for pixel; `docs/design/README.md`'s "commerce structure leads the code" row lists the board escalations, and this task removes its part of that row.
- **Self-review (founder 2026-10-22):** `## Self-review` in the PR with every owned AC at file:line and its test, the mutation that turned each AC assertion red, and the awkward cases where the class keeps the breaker. CI green on the head SHA.
- **Copy headroom is zero (spec 003 A17, AC-112):** add only keys from the amendment's i18n table that this PR renders; each new key on an indexable page needs the founder's `record-approval` on the branch before merge; never set `reviewed: true` yourself; print `i18n:check`'s `en-gb` share before and after. No em dash anywhere.
- Item 3: the chooser is a normal page (header, H1 `home.picker.label`, `<main>`, no dialog), SSR, `Cache-Control: private, no-store`, `noindex, nofollow` in meta and `X-Robots-Tag`, disallowed in `robots.txt`, in no sitemap. Buttons for the shop countries (first `PICKER_CHIPS` by `sortWeight`, then collation), a search field with a `<datalist>` of every registry country, `home.picker.submit`, `shop.choose.remember`; with `fo_dest` a first `shop.choose.continue` button, and never a forward on its own (200, never 3xx).
- The choice (GET `to`, or the path form `/{locale}/{chooseSegment}/{iso2}/{next}`): ISO code or any launch-locale name; a shop country answers 303 to `countryVersionOf(next, country)` with one `Set-Cookie: fo_dest` (180 days, `SameSite=Lax`, `Secure`, `Path=/`, not `HttpOnly`); no match lists the closest names; a non-shop country goes to TASK-395's not-live page (until it lands, the chooser's no-match list with the full grouped list).
- `fo_dest` row in `src/config/cookies.ts` (essential, `consent.cookies.dest.purpose`) and the cookie policy line (ePrivacy Art. 5(3), PECR reg. 6(4)(b)). With JavaScript on, the island turns the submit into `location.replace()`.
- No read of `cf-ipcountry`, `Accept-Language`, `x-forwarded-for` for geography or geolocation (ADR-0006, AC-89); no cached response sets a cookie.
- Class: keeps the breaker (a redirect, a cookie, consent text).

## Read

- `specs/004-design-system-layout.md` §14 A-founder-2026-10-24a item 3, "Compliance" (the cookie), AC-77 to AC-79, AC-89, AC-90
- `docs/design/wireframes/choose-country-desktop.dc.html`, `choose-country-mobile.dc.html`, `docs/design/flows/buyer-journey.dc.html`
- `src/config/cookies.ts`, `src/app/robots.ts`
- `docs/codebase-map.md`

## Carry-forwards

- **Deferred island budget, shared:** TASK-384 (hover, selector label), TASK-385 (history replace), TASK-391 (fill, URL rule) and TASK-393 (countdown) together add at most 2,560 B Brotli to the existing deferred set, no new island on any route (spec 004 item "Rendering"). Print this PR's share and the running total; if it will not fit, drop the hover first (Q-24g), then stop and report.
- **From `/plan-tasks` (orchestrator, 2026-10-24), keyless strings:** the boards mark several strings `[slot]` with no message key. Do not invent a key or text: list each one this PR needs, with a proposed key and text, in the PR and here as an escalation for the founder's copy batch.

- **To TASK-392 (from TASK-385):** the not-available state lives at `/{locale}/{chooseSegment}/{next}?to={iso2}` (the choice route 303s there with the cookie set); `chooserPageState()` returns `unavailable {iso2, sku}` and the page draws the ask form for it today.
- **To TASK-395 (from TASK-385):** a registry country outside the shop set 303s back to the chooser with `?to={iso2}`; the page shows the no-match box with the full grouped list until the not-live page lands (`notLive` state in `chooserPageState()`).
- **To TASK-384 and TASK-386 (from TASK-385):** `CountryPicker` (`src/modules/ui/shop/CountryPicker.tsx`) takes `variant="page"` only; add the selector's and the home's skins there, and post to `choiceRoutePath(next)`.
- **To spec 045 / TASK-404 (from TASK-385):** the `search` shape lands on the shop root; the form's `q` is not carried yet.
- **Known gap (from TASK-385):** a typed endonym that is no launch locale's name ("España") gets no match; the datalist offers the launch-locale names.

## Escalations

- **2026-10-24, the colour shape** (`open`): see TASK-381.
- **2026-10-25, the copy share trips** (`closed` 2026-10-31: the nine keys recorded under the founder's delegation, spec 003 A-founder-2026-10-31a, commit on this branch): the 9 new `en` keys ship `reviewed: false` (de and pl echo-drafted). The unreviewed share goes from 4.4 % to 5.88 % (`en`) and from 4.6 % to 6.06 % (`en-gb`), over the 5 % gate, so both locales read `noindex` and 24 unit and contract files go red, every one of them only because of the share (probed: with the 9 keys marked reviewed on a throwaway tree, all 24 pass apart from `sitemap-fixtures`' lastmod, which regenerates at approval). Needs the founder's `record-approval` of the list in PR 423's "Copy for the founder", then `UPDATE_SEO_FIXTURES=1 pnpm exec vitest run tests/unit/sitemap-fixtures.test.ts`.
- **2026-10-25, three [slot] keys** (`closed` 2026-10-31 with the same delegated record): the boards draw three strings with no message key: `shop.choose.noMatch` "We could not find “{query}”.", `shop.choose.closest` "Did you mean <countries></countries>?", `shop.choose.all` "Every country we send to". Proposed keys and texts are in the PR; the founder confirms or rewrites them.
- **2026-10-25, routing as built** (`noted`, no spec change): the form's `action` is the choice route `/api/choose/{locale}/{next}`, and the proxy rewrites the path form there; a page render can set no cookie and pick no 303, and the proxy's graph may not reach the catalogue (`next/font`). The visitor's address is the spec's `/{locale}/{chooseSegment}/{next}` throughout, apart from the form's GET, which lands on `/api/choose/...` for one 303. The page is served from an internal `-choose/-next/` route so the product `beforeFiles` rewrite cannot take it.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-25: route, page, cookie row, policy line, island replace and tests built (aac9b5b62, 6af1ead30); the form posts to the choice route and the proxy stays synchronous (e71e784af); pseudo-locale 404 case (a9639dedc). Screenshots at 1440, 1280 and 390 match the boards (header aside: TASK-383/384). Blocked only on the founder's copy approval.
- 2026-11-01: rebased on main c0d6b6f2c (catalog-barrel conflict: both export lists kept); the delegated copy record is on the branch, so the share is back under 5 %; `pnpm gates:cheap` PASS (209 files, 5760 tests); CI fired on the new head.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 423 (base `main`). AC-77, AC-78, AC-79, AC-89 and AC-90 are built and tested; the nine new English keys are recorded under the founder's copy delegation (spec 003 A-founder-2026-10-31a), so the unreviewed share stays under 5 %. Tests: unit `chooser-choice` (26), `chooser-proxy` (8), `chooser-page` (8), `chooser-unavailable` (4), plus updates to `cookies-config`, `seo-robots`, `url-pii`, `catalog-barrel`, `ui-barrel`, `listing-rewrites`; e2e `country-chooser.spec.ts` (29 cases × desktop and mobile, 58/58 green on a local `next start` in the build slot, run because the 303, the cookie and the history replace cannot be judged without a server). Cookie register: a server-set cookie now needs `serverScope: "uncached"` (the spec's "server-set" rule). Island share: about 120 B Brotli, estimated from the minified diff (CI's `budget:client-js` judges it). Known red on main, not this PR: Lighthouse LCP on home and listings (TASK-411), e2e time limit and the whole-tree lint test timeout (TASK-412).
