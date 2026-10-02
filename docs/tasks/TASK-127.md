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

- `specs/NNN-*.md` — read `## 0. Index` first, then only the sections the ACs name
- `docs/codebase-map.md` — where everything lives
- (the two or three files the deliverable actually touches)

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

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

_None recorded._

## Result

**Partial — built in [PR #135](https://github.com/itsahmeds/flowers-overseas/pull/135) with
TASK-126 (draft).** The depth-4 route gains the product branch (`dynamicParams = true`, the first
carry-forward) and mounts `ProductPage` with spec 008's breadcrumb and spec 007's facts block as
slots. `site-links.ts` publishes `product`, so the listing cards link to it. The page reads
`productView()` only, with `parameterised: false`: the bare URL, and TASK-128 owns the form.
Evidence:
- AC-1: `tests/unit/product-route.test.tsx` (4 cases; the 404 shapes, through the route function
  itself) and the e2e 200/404 matrix.
- AC-8, AC-10, AC-21, AC-22, AC-25: `tests/unit/product-page.test.tsx`, plus their e2e halves.
- `/review 98`'s HOLE 5 pin is in and was seen to bite.

**Remaining:**
- the second carry-forward (`writeProductExistenceSummary()`'s call site in the depth-3
  `generateStaticParams`, proved once by mutation);
- `/review 101` HOLE 12 (the robots-literal scan extended to this route file);
- the production-build e2e/a11y/visual run.

`en` stays over the 5 % gate until the founder attests TASK-126 E-3's three keys.
