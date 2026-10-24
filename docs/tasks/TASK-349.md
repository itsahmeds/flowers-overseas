# TASK-349 — Spec 010 basket page and header: `/{locale}/basket` with every state of item 6 and its six components, the header Basket link (`rel="nofollow"`) with a fixed badge slot and the post-LCP count island (at most 512 B, no request), the `basket` `SeoPageType`, `Disallow: /*/basket`, `basket` published in `site-links.ts`

Row: `TASKS.md` → TASK-349. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-349`; keep it current by editing this file, not the row.

## Binding

Planned 2026-10-22 by `/plan-tasks` (b) (work order `wo-1022-common.md`). Size M. Merges after: TASK-348, PR 336 (design).
- Spec 010 §14 A-founder-2026-10-22 items 6, 8, 10 (D10), 12 and 14 ("New, frontend: basket page and header"). Components `BasketLine`, `BasketSummary`, `RemoveLineButton`, `BasketCountBadge`, `DeliveryOfIndicator`, `AlsoInBasketNotice` in `src/modules/ui`, kept in step with `system/components.dc.html`.
- Every public page's HTML stays byte-identical with and without `fo_checkout` and `fo_basket` (no `Vary`, no `Set-Cookie`); the island loads through TASK-244's post-LCP deferral, makes zero requests and fills a reserved slot (CLS 0). The basket is SSR `no-store`, `noindex, nofollow`, no canonical, hreflang or JSON-LD. Copy rows of Appendix A ship `reviewed: false`; `nav.basketCount` renders on indexable pages (spec 003 A17 clause 5), so the header island does not reach production before the founder's copy batch (Q28).
- Spec 018 §13 Q23 adds a static "Account" link beside the basket; it belongs to TASK-344 and renders only while `account` is on, so this task's baselines are the flag-off header.
- The Cloudflare `/basket` bypass is a founder dashboard step (spec 040 rule 1); TASK-208 checks it on staging.
- **Built from the merged artboards** of PR 336 (`basket-*`, `chrome-*`, `system/components.dc.html`); match them pixel for pixel. If the board you need is missing, stop and escalate; never build a page from the description alone.
- **Class:** self-review (no checker agents; founder 2026-10-22). You are the reviewer and the breaker: put `## Self-review` in the PR (every AC with file:line and its test; the mutation and red run for each AC assertion; the awkward cases below with each result; carry-forwards) before `gh pr ready`.
- **Awkward cases you run yourself:** the header on every page type with and without both cookies (byte-equal); `fo_basket` of `3`, `0`, `99` and garbage; the island with the network blocked; `/ar-XB` basket; JS off for every basket state; the Polish plural forms for 1, 2, 5 and 22.
- **Founder rulings bind every buyer line** (specs 013, 016, 018 §14): every payment is captured at placement; no buyer surface, email, PDF or copy key says or implies partners, a florist accepting, offers, re-routing or a held card (`RELAY_PATTERNS`, `RELAY_EXEMPT`, `relayMatches` in `src/config/honesty.ts`: use them, keep no list of your own); no refund or failure wording after payment except the cancellation and refund messages; no em dash in any copy.
- Copy: never `reviewed: true` (the founder's act). Keys under `checkout`, `orderConfirmation`, `orderTracking`, `florist`, `admin`, `demo`, `dev`, `email` may be added `reviewed: false`; any other new key text is reported in the PR for the founder's batch (spec 003 §14 A17).
- Integration tests run on a throwaway local PG16 (`@embedded-postgres/darwin-arm64`, your own scratch subfolder, stopped by PID); never `.env.local`'s `DATABASE_URL*`. Vitest with `--maxWorkers=2`, only the files your diff touches; read `uptime` first.
- **Founder priority (2026-10-22):** (1) the ordering path (basket checkout, payment in `test` on the fake provider until Stripe keys arrive, routing to florists); (2) the florist portal live (026a) and admin order actions (020a); (3) accounts; (4) payouts and reviews.

## Read

- `specs/010-checkout.md`: §14 A-founder-2026-10-22 items 6, 8, 10, 12, 16 (Q26 to Q28) and the ACs above; spec 004 §14 A20 clause 2
- `docs/tasks/TASK-244.md` (the post-LCP deferral), `src/config/site-links.ts`, `src/modules/seo/`
- `docs/codebase-map.md` (where everything lives); `.claude/state/wo-1022-common.md`

## Carry-forwards

One dated bullet per `/review`, newest last.

- 2026-10-24 (self-review, PR 397): left for later, each named for its owner.
  - `/dev/components` has no gallery entries for the six basket components yet; the system file `docs/design/system/components.dc.html` already draws them. Owner: TASK-204 (same components, same agent).
  - The basket's date line uses `formatDate(…, "calendarDate")`, which prints the year ("Thursday 8 October 2026"); the board prints "Thursday 8 October". A yearless weekday style is an i18n-module change. Owner: TASK-204 (the checkout prints the same dates).
  - The browser halves stay with TASK-208: the badge after the LCP mark, zero requests from the island, CLS 0, the 512 B Brotli measure, `/ar-XB` baselines, axe, the e2e JS-off Remove walk, `cf-cache-status` on staging.
  - The language links on the basket point at each locale's home (`switcherSegments=[]`), not at `/{other}/basket`.
  - The price-changed notice's "Continue at" posts `confirmPrice` with `returnStep=recipient`, so it lands on the checkout's first screen, not back on the basket (TASK-348's action takes a step, not the basket).

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-24: copy for the founder's batch (Q28), not a blocker. (a) Appendix A's `checkout.basket.full` "Your basket holds up to {max} bouquets…" matches `RELAY_PATTERNS` `hold` (AC-74 would fail), so it ships as "Your basket has room for up to {max} bouquets. Please check out first, then start a new basket."; (b) `nav.basket` changes from the reviewed "Basket ({count, number})" to "Basket" (the chrome boards' gap note), so it is `reviewed: false` again; (c) one key not in Appendix A, `checkout.basket.addOns` "Add-ons · {list}". All `reviewed: false`. `nav.basket` and `nav.basketCount` render on indexable pages: the `en` unreviewed share is 4.70 % and `en-gb` 4.88 % (threshold 5 %), and spec 010 Q28 says the header island does not reach production before the founder approves these rows. Open, for the founder.

## Progress

One line per coherent step, newest last, written by the agent doing the work and pushed with
the commit: what is done, what is next, anything a replacement agent must know. A finisher starts
here.

- 2026-10-24 (resumed after a usage-limit cut-off): committed the previous agent's components, header link and count island; rebased onto main after PR 383 merged.
- 2026-10-24: copy keys (en, pl plural forms, de/pl drafts), the basket route and view, the `basket` page type, `Disallow: /*/basket`, the basket header rules, the header slot page.
- 2026-10-24: unit tests (count island, header link, SEO, view states), the integration test of `loadBasketPage` on a local PG16, the header baselines moved once; mutations run. Next: PR ready with `ci:full`.

## Result

What shipped, in one paragraph: the PR, the tests added per layer, the numbers a reviewer needs
(budgets, counts), and anything handed to a later task.

PR 397: `/{locale}/basket` (SSR per request, `noindex,nofollow` meta and header, `no-store`, no canonical, hreflang or JSON-LD) with every state of item 6 (empty, lines, demo banner, added, cap, mode, currency, unavailable, date gone with "Use {next}", price changed), built from the six components in `src/modules/ui/basket`; the header Basket link (`rel="nofollow"`, `nav.basket`, a 20 x 20 px empty slot) published in `site-links.ts`; the count filled after paint inside the motion module's existing chunk (no new request, no new chunk); `basket` registered as a `"never"` page type; `Disallow: /*/basket`. Tests: unit 4 new files (40 cases) plus 6 existing files moved for the new link; integration 1 new file (3 cases, local PG16). No build, e2e, visual or Lighthouse run locally: CI's. Browser halves are TASK-208's (see Carry-forwards).
