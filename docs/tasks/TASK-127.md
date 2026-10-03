# TASK-127 — The PDP route `/{locale}/{country}/{product}/{slug}`: assembly in the artboards' block order, the three picker states through `ActivePartnersProvider` + `pickerState()` with zero template edits between them, no-photo state, stale-FX, the demo summary (CTA replaced by the "ordering is not open yet" sentence), one all-in price with the inclusive formula + VAT and delivery rows + the exclusion sentence, freshness guarantee beside substitution (Q5), absolute cutoff with zone named and no relative day label or countdown anywhere, one `priority` image + preload, breadcrumb, related products, 404 for every non-existent shape

Row: `TASKS.md` → TASK-127. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-127`; keep it current by editing this file, not the row.

## Binding

- **Built with TASK-126 by one agent in one PR** (founder, 2026-10-03, "visible first"). The visible
  outcome: the product cards on the listing pages become links (the `product` id is published in
  `site-links.ts`), and clicking one opens the bouquet's page.
- **Scope, from spec 009 §12 task 7.** Assembly in the artboards' block order (breadcrumb, then the
  destination line, gallery, `<h1>`, description, tier selector, date picker, delivery facts,
  add-on list, price summary, trust, related products), which is the DOM order and the mobile
  order. Desktop re-flows with CSS only. The page covers the three picker states through
  `ActivePartnersProvider` and `pickerState()` with zero template branches, plus no-photo,
  stale-FX, the demo summary, the LCP preload, the breadcrumb and related products. The page
  renders from `productView()` alone (TASK-125's carry-forward: it may not call `priceProjection`,
  `dateSurcharges`, `deliveryWindow` or `productPageIndexability` itself).
- **ACs owned:** AC-1, AC-8, AC-10, AC-21, AC-22, AC-25 (spec 009 §9).
- **Rulings that apply.**
  - **Trust block:** render only what the drawing shows, the substitution claim ("If something
    is unavailable"). The freshness guarantee (TASK-125 E-2) is not drawn and is not rendered
    until the founder rules.
  - **Delivery facts:** spec 007's block, reused unchanged (TASK-126 E-1, option a). Export it
    from `geo` with a narrowed prop, and redraw the sheet's rows to 007's.
  - No purchase affordance. In its place goes the demo sentence (§13 Q6, Q7).
  - Phase 0 is `noindex,follow` everywhere, through spec 007's engine.
- **Copy:** the drawn texts are used verbatim, `reviewed: false`, in `AWAITING_FOUNDER_REVIEW`.
  The founder approves them as one batch (2026-10-03, "approve as we go"). Their approval is
  recorded as `reviewedBy: "founder (chat, <date>)"`, as on 2026-09-18.

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, AC-1, AC-3, AC-16, AC-20, §5.4, §14 A6
  and A7
- `docs/codebase-map.md` — where everything lives
- `src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx` (the product branch),
  `src/modules/catalog/product.ts` (`productView()`, `productPrebuildPages()`),
  `src/config/site-links.ts`

## Carry-forwards

One dated bullet per `/review`, newest last.

- **From `/review 96` (2026-09-22), TASK-121 merged as `8d64899`:** two of spec 009 AC-3's five
  clauses were deliberately left to this task, and **both are yours**:
  1. **Flip the shared depth-4 route to `dynamicParams = true`.** This is a one-way decision.
     Flipping it preserves the listings' behaviour: every AC-1 404 shape in
     `tests/unit/catalog-routes-depth4.test.ts` is asserted against `resolveLocalePath()` returning
     `{ kind: "notFound" }`, so those suites need no rewrite. Leaving it `false` while mounting the
     PDP turns the 1,680 on-demand PDPs into router 404s and breaks AC-3's union clause. The
     consequence to record: arbitrary URLs render dynamically instead of being refused by the static
     router, and 404 responses become cacheable under `revalidate`. That is a Cloudflare and caching
     note, not a change to the 200 set.
  2. **Give `writeProductExistenceSummary()` its call site.** It has none today, so no build prints
     the spec 009 §11 per-locale counts. Follow the `writeExistenceSummary()` precedent: the depth-3
     `generateStaticParams` calls it exactly once per build. The failure mode to avoid is two
     tables in one `$GITHUB_STEP_SUMMARY`. Prove the call happens once by mutation.

- **From `/review 101` round 2 (2026-10-02, TASK-125, HOLE 12 ACCEPTABLE):** run the F1 cast case
  once per optional term (`countryLive` and `unparameterised`). Make the source scan refuse a
  hand-built `pageType: "product"` descriptor passed straight to `seo.pageIndexability()`. Extend
  the robots-text scan (AC-16's grep) to the new route file, make it case-insensitive, and make it
  catch the `{ robots: { index: false } }` object form.

- **From `/review 98` round 4 (2026-10-03, TASK-113 merged as `8767f9de`, HOLE 5 ACCEPTABLE):** pin
  `en-gb`'s corridor link in `tests/unit/catalog-product-view.test.ts` ("links the country to its
  corridor guide only where…") and show it bites with `&& locale !== "en-gb"` at `product.ts:1479`.
  **Done (2026-10-03):** the assertion was added, went red under the mutation (1 failed of the
  case), and the line was restored before the page read `country.corridorPath`.
- **From `/review 135` round 1 and `/break 135` round 1 (2026-10-03), required (one PR for
  TASK-126 + TASK-127):** (1) replace the PR description with TASK-126/127's own, referencing every
  AC the two briefs own; (2) AC-1 trailing slash → 308 to the bare URL, recorded in spec 009 §14 A7
  (orchestrator ruling) with one e2e case; (3) TASK-126 `## Result` declares that the cutoff time is
  printed raw and the city comes from `zoneCity()`, not `formatTimeInZone`; (4) fix the mobile
  `chrome-honesty.spec.ts:87` red on `/dev/components` ("order-by cutoff promise": a cutoff line
  shown only on phones is not lifted by the sweep); (5) close breaker HOLE 1 (PDP robots tag:
  `INDEX_FOLLOW` at `[grandchild]/page.tsx:252` passes every test), HOLE 3 (`TierSelector.tsx`
  42/92/99: each tier's own price, the preselected size and the stem count), HOLE 4 (a chip's
  printed date tied to its value: `labels.ts:33`, `DateChip.tsx:112`, and the summary's
  surcharge-line date `PriceSummary.tsx:128`), HOLE 5 (a closed date can print "included",
  `DateChip.tsx:115`) — each with a test that goes red under the breaker's mutation; (6) rebase on
  main (PR 136 changed `messages/*` and the visual baselines) and CI green on the new head.
- **Accepted (`/review 135` round 1):** HOLE 2 ACCEPTABLE (PDP canonical; owned by TASK-132,
  AC-17); HOLE 6 ACCEPTABLE (page layout order; owned by TASK-133, AC-28); HOLE 7 ACCEPTABLE
  (country shop-root card links; TASK-131's crawl must cover the shop roots).
- **From `/review 135` round 2 and `/break 135` round 2 (2026-10-03), required:** HOLE 8, a
  one-tier product's price and label (`TierSelector.tsx:67/69`) — `tests/unit/product-page.test.tsx`
  "prints a one-tier product's own price and its own label, in `en` and `pl` (HOLE 8)", red under
  a wrong price at :69, `en` formatting at :69 and a wrong label at :67. HOLE 9, the A19 controls
  must read through the sweep's own read — `tests/e2e/chrome-honesty.spec.ts` `sweptText()` is the
  one hide/read/restore function for the sweep and the planted-promise case, and "on
  /dev/components the lift takes a marked cutoff line and leaves an unmarked one beside it"; with
  the read returning `""` both controls went red on both projects (local production build).
  **Ruled out of this PR:** a promise nested inside a marked node is lifted with it — carried to
  TASK-133: check every `[data-fo-cutoff]` node's text is exactly its catalogue line; and
  "Arrives tomorrow" matches no pattern in `tests/support/listing-honesty.ts:65` — a nit for the
  next task that touches that file.

## Progress

- **2026-10-03 — the two carry-forwards (finisher run).** `/review 96`'s second: the depth-4
  `generateStaticParams` now calls `writeProductExistenceSummary()` behind a once-per-process
  guard; `tests/unit/product-route.test.tsx` calls it twice on a fresh module with
  `GITHUB_STEP_SUMMARY` stubbed and finds one table. Dropping the guard (two tables) and dropping
  the call (none) were both seen red. `/review 101` HOLE 12: the F1 cast case runs once per
  optional term (`countryLive`, `unparameterised`; each term's fail-open mutant in
  `productDescriptor()` turns its own case red); a source scan refuses a hand-built
  `pageType: "product"` descriptor reaching `pageIndexability()`, aliased imports included
  (planted in the route and in `product.ts`, both red); the robots scan takes the PDP route file,
  matches any casing and the `{ robots: { index: … } }` object form, and has its own control
  (planted object form and `"NoIndex"`, both red).
- **2026-10-03 — E-1 fixed by A6 (finisher run).** `productPrebuildPages()` is the existence set,
  so the route's `generateStaticParams` emits all 84 products per (locale, published country):
  2 352 product pages in production's four locales, 3 528 in a local build with the two
  pseudo-locales. The step summary prints one table, "Prebuilt" equal to "PDPs" (588 per
  locale). AC-3/T-03: `tests/unit/product-route.test.tsx` holds the real `generateStaticParams`
  equal to `productPageExists()` over every triple, and `tests/unit/catalog-product-routes.test.ts`
  per (locale, country) pair; trimming the set back to 24 per pair turned 5 cases red. A new e2e
  case in `tests/e2e/product-page.spec.ts`: `glass-morning` (en, de) and `mantelpiece` 200, an
  unknown product slug (en, de) 404s with `<html lang="en">` and no `__next_error__`; with the
  layout at `dynamicParams = true` in a scratch build it went red on the `lang` line (`Received:
  undefined`). The layout was restored and the mutated build deleted.

- **2026-10-03 — `/review 135` round 1 fix round (finisher).** AC-1 / T-01 under §14 A7: one e2e
  case in `tests/e2e/product-page.spec.ts`, "the trailing-slash form answers 308 to the bare
  product URL" (`en` and `de`), exact 308 and `Location` equal to the bare path; the six other
  shapes keep their 404-with-no-`Location` case. HOLE 1: `tests/unit/product-route.test.tsx`
  "emits exactly `noindex,follow` for preview, unavailable and live PDPs on the indexable
  deployment" calls the route's `generateMetadata` with `APP_ENV=production` on the canonical
  host; with `page.tsx:252` set to `"index,follow"` it went red (`Received: "index,follow"`), and
  green once restored.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- **E-1 (2026-10-03, implementer → orchestrator): a PDP outside the 24 prebuilt answers 404, so
  420 of 588 card links per locale are dead. Answered (orchestrator, 2026-10-03): spec 009 §14
  A6, option B — prebuild every product page; option A broke spec 003 AC-8.** CI on `a1fca3e1` (`country-category`
  "every link … exists", `shop-reachability` AC-21) and a local `pnpm build` + `next start` agree:
  `/en/poland/product/amber-hour` (prebuilt) 200, `/en/poland/product/glass-morning` and
  `/de/polen/produkt/glass-morning` 404, server log `NoFallbackError`. The depth-4 page sets
  `dynamicParams = true`, but `src/app/[locale]/layout.tsx` sets `dynamicParams = false` (spec 003's
  routing-layer locale gate, TASK-035), and Next applies a layout's `false` to the whole subtree.
  **Probe, reverted:** with the layout at `true`, the same build answers 200 for both on-demand PDPs
  and still 404 for `/en/poland/product/no-such`, `/fr/poland/product/amber-hour` and `/xx`. Options:
  **(a)** flip the layout to `true`, with the unknown-locale 404 held by the resolver and
  `notFound()` it already reaches. That is spec 003's surface (its AC-8 and
  `app-shell.test.tsx`'s pin) and needs a spec 003 §14 amendment. **(b)** Prebuild the whole PDP
  existence set (588 per locale; spec 009 AC-3's "top 24" becomes "all" in Phase 0, a spec 009
  amendment, at a build-time cost to measure). **(c)** Link a card only where its PDP is prebuilt.
  That breaks AC-20 ("every 008 product card becomes an `<a>`"). Recommendation: (a), because the
  probe shows the 404 set unchanged. It is not built here, because the fence excludes
  `[locale]/layout.tsx`.

## Result

**In review — built in [PR #135](https://github.com/itsahmeds/flowers-overseas/pull/135)
with TASK-126; E-1 fixed by spec 009 §14 A6.** The depth-4 route has the product branch and mounts
`ProductPage` with spec 008's breadcrumb and spec 007's facts block (TASK-126 E-1 (a); its
"Prices" row is left out on the PDP, TASK-126 E-4, accepted). `site-links.ts` publishes `product`,
so the listing cards link to it. The page reads `productView()` only.
- **AC-1:** `tests/unit/product-route.test.tsx` (the 404 shapes through the route function) and
  the e2e 200/404 matrix.
- **AC-3 as A6 words it:** `generateStaticParams` emits every product per (locale, published
  country), 2 352 in production's four locales. The route's `dynamicParams = true` is inert under
  the layout's `false`, and the layout is unchanged. Unit: the route's params equal
  `productPageExists()` (trim to 24 → 5 red). E2E: a formerly on-demand PDP 200s and a product
  404 keeps `<html lang="en">` (layout `true` in a scratch build → red). **Local build, in the
  build slot, once, with two builds** (the fix needs a production build to show, and the layout
  mutation needs a second one): with the fix, `pnpm build` took 130 s (load average 2.51 at
  start, 18.92 at end; 6 locales with pseudo-locales on), 3 528 product routes in
  `prerender-manifest.json` (588 per locale), `.next/server/app` 1.2 GB; then `next start`: the
  six E-1 cases (`country-category` "every link … exists", `shop-reachability` `/en` and
  `/en-gb`, on both projects) plus the rest of `product-page`, `country-category` and
  `shop-reachability`: 82 passed, 4 skipped (the case-insensitive-host skips). The scratch build
  took 106 s (load 18.17 at end). CI is the gate of record.
- **AC-3's summary half (carry-forward 2):** the product table prints once per build, seen once in
  a real `pnpm build`, and proved once by two mutations.
- **AC-8, AC-10, AC-21, AC-22, AC-25:** `tests/unit/product-page.test.tsx`, plus their e2e halves.
- **AC-1 trailing slash (§14 A7):** e2e, 308 with `Location` = the bare path (`en`, `de`).
- **AC-16, the PDP robots tag (`/break 135` HOLE 1):** unit, the route's own `generateMetadata`
  is `noindex,follow` in `preview`, `unavailable` and `live`, on the indexable deployment; the
  `INDEX_FOLLOW` mutant at `page.tsx:252` went red. Unit `product-route` is 6.
- **Accepted, not built here:** HOLE 2 (the canonical, `page.tsx:253`) → TASK-132 (AC-17).
- **`/review 101` HOLE 12:** done, see `## Progress`. **`/review 98` HOLE 5:** pinned and seen to
  bite.
