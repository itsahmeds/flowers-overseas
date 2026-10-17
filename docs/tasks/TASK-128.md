# TASK-128 — Form and parameter policy: the GET form for tier and date (JS-off reload to the parameterised URL), `ProductSearchParamsSchema` with strict `?tier=` / `?date=` parsing and 200 fallback on anything invalid, `noindex,follow` + canonical to the bare URL on every parameterised URL, none in any sitemap or `<a href>`, `robots.txt` parameter shapes per spec 007 §14 A5; no `Vary`, no `Set-Cookie`, body byte-identical across the three cookies, ISR 3600 (300 when live) + §5.4 tags incl. `cutoff:{iso2}`, the shared-cache header on parameterised responses

Row: `TASKS.md` → TASK-128. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-128`; keep it current by editing this file, not the row.

## Binding

- **Scope, from spec 009 §12 task 8.** `ProductSearchParamsSchema`, `?tier=` / `?date=`, the
  canonical and `noindex` on parameterised URLs, the `robots.txt` parameter shapes, the
  shared-cache header and the JS-disabled path. Branch `task/TASK-128-pdp-form-params`.
- **AC-15:** "`?tier=` / `?date=` are parsed strictly: a valid value re-renders the selection; an
  unknown parameter, an unknown tier, a malformed date, an out-of-window date or an unselectable
  date falls back to the default rendering with a 200 and no error; every parameterised URL is
  `noindex,follow` with a canonical to the bare URL, appears in no sitemap and is never an
  `<a href>` anywhere on the site." Test T-15 (e2e + integration).
- **AC-24:** "PDP responses carry no `Vary` and no `Set-Cookie` and are byte-identical with and
  without `fo_locale`, `fo_currency` and `fo_consent`; the bare URL is ISR with `revalidate` 3600
  (300 when live) and the tags of §5.4; `src/lib/cache.ts` is the only invalidation path;
  parameterised responses carry the shared-cache header of 008 §5.4." Test T-24 (e2e). §5.4's
  tags: `product:{sku}`, `catalog:{iso2}`, `catalog:{iso2}:{locale}`, `sitemap`, plus
  `cutoff:{iso2}` when live. E-1 and E-2 below must be answered before this AC can be built as
  worded.
- **The JS-off half of AC-13 is built here** (§12 task 8). The island and the byte-for-byte
  JS-on parity are TASK-129's. With JavaScript disabled, submitting the page's one
  `<form method="get">` reloads to the parameterised URL, and the server re-renders the selection.
  See E-3 for the Phase 0 states that draw no submit button.
- **§5.2 schema rules.** The schema is `{ tier?: TierKey, date?: IsoDate }` and **strict**. An
  unknown parameter is dropped and only makes the URL parameterised (`indexable: false`). Any
  parameter at all, an unknown one included, means `parameterised: true` (`ProductViewOptions`,
  `product.ts:1303`). The route passes the parsed value to `productView()` as `selection`, and
  `productView()` re-validates it against the data. Never a 404, never an error page, never a
  redirect. No new `noindex` branch and no robots literal outside `modules/seo` (AC-16's scan).
- **`robots.txt` (spec 009 §6 (b), spec 007 §14 A5):** the shapes are added "without blocking
  them, so their `noindex` can be seen": **not** disallowed. Assert that no `DISALLOWED_PATHS`
  entry matches a `?tier=` or `?date=` PDP URL; `/*?*sort=` stays the only blocked parameter.
- **§14 A6:** every product per (locale, published country) is prebuilt, and the layout's
  `dynamicParams = false` is the existence gate. Keep both. **§14 A7:** a trailing slash answers
  308 to the bare URL. A parameterised URL with a trailing slash keeps that behaviour.
- **The trap (TASK-146 brief, TASK-114).** In Phase 0 every PDP is `noindex,follow`, so a test
  that only checks a parameterised URL for `noindex` passes for the wrong reason. Run the case
  under an indexing deployment with a live fixture, and compare the bare and parameterised
  verdicts to each other. Delete the `parameterised` pass-through and watch the case go red
  (DoD §4).
- **Copy:** any new English string goes in unreviewed (`reviewed: false`,
  `AWAITING_FOUNDER_REVIEW`) and is listed in the PR for the founder's batch. No agent marks copy
  reviewed. The only drawn string, "Use this date" (`delivery.submit`), already ships.
- **Gates:** paste the `pnpm gates:cheap` block. CI must be green on the head with `ci:full`.
  This PR is **not review-only**: it touches SEO gates, caching and headers, so `/break` runs.
  Taking the build slot once is justified: route rendering mode and `Cache-Control` show only in
  a production build. Say so in `## Result`.

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, §5.2 (the schema bullets), §5.4, §6
  (canonical, (b)), §9 AC-15/AC-24, §10 T-15/T-24, §14 A6 and A7
- `docs/codebase-map.md` — where everything lives
- `src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx` — the product branch,
  `productViewFor()` (L193–214), `generateMetadata` (L216+)
- `src/modules/catalog/product.ts` — `ProductViewOptions` (L1302–1324), selection fallback
  (L1367–1404); `src/modules/catalog/params.ts` — `listingRequest()`, the listing precedent
- `src/lib/listing-cache-headers.ts` and `tests/unit/listing-cache-headers.test.ts`;
  `tests/e2e/listing-params.spec.ts` (L259–268, the `Vary` reading)
- `src/lib/cache.ts` (tag builders, `urlsForTag`), `src/modules/seo/robots.ts` (`DISALLOWED_PATHS`)

## Carry-forwards

- **From TASK-125 (2026-09-23), `docs/tasks/TASK-125.md:35–37`:** `parameterised` is required in
  `productView()` options. TASK-127 passes `false`; "TASK-128 supplies the real value". The page
  must not call `priceProjection`, `dateSurcharges`, `deliveryWindow` or
  `productPageIndexability` itself (`tests/unit/catalog-product-view-source.test.ts`).
- **From TASK-126 (2026-10-03), `docs/tasks/TASK-126.md:170–172`:** "Use this date" is drawn
  inside the picker, "but the form is TASK-128's". It renders only in `live` with a selectable
  date (`DeliveryDatePicker.tsx:18–19`, `:136`). The radios already carry `name="tier"` and
  `name="date"` (`TierSelector.tsx:14,30`, `DateChip.tsx:59`).
- **From TASK-127 (2026-10-03), `page.tsx:103–104`, `:197–198`:** the product branch "reads no
  search parameter and stays ISR"; `?tier=` / `?date=` "and their form are TASK-128's".
- **From TASK-114 (2026-09-21), `src/lib/listing-cache-headers.ts:44–50`:** a per-request render
  in Next 16 answers `private, no-cache, no-store` whatever `revalidate` says. "Whichever task
  makes a depth-4 [route] honour" parameters "adds its depth here". The unit test currently
  asserts both depth-4 shapes stay **unmatched**.
- **Precedent, `tests/e2e/listing-params.spec.ts:259–268`:** "no `Vary`" has been asserted as no
  `Vary: Cookie`, because Next's own `Vary` names the RSC headers and `Accept-Encoding`. Follow it
  unless the orchestrator rules otherwise.

## Escalations

- **E-1 (2026-10-03, brief → orchestrator): bare-URL ISR versus a route that reads
  `searchParams`. `open`.** AC-24 and T-24 want the bare URL to be ISR, asserted from the build
  output. Reading `searchParams` makes the whole shared depth-4 route render per request: product
  pages, country categories and country occasions alike. That drops A6's 2 352 prerendered pages
  and changes the bare URL's `Cache-Control` (carry-forward 4). Options: (a) 008 §5.4's
  resolution for the whole PDP: a per-request render, the shared-cache header on the PDP path
  shape, and AC-24's ISR clause amended (spec 009 §14 A8). (b) Keep the bare URL ISR and send
  parameterised requests to another route through `src/proxy.ts`. The proxy is closed to routing
  (spec 001 §11), so this needs an amendment. (c) Another shape the orchestrator names.
- **E-2 (2026-10-03, brief → orchestrator): "300 when live" and `cutoff:{iso2}`. `open`.** A
  segment `revalidate` export cannot vary per page on a shared route (spec 007 §14 A8). Without
  `cacheComponents`, Phase 0 attaches no tag to a cache entry (`src/lib/cache.ts`, the
  `homeCacheTag` note). Say how T-24's "live fixture uses `revalidate` 300 and the `cutoff:{iso2}`
  tag" is asserted. One option: a pure per-state cache policy plus the `urlsForTag` registry, with
  the route-level 300 left to the task that makes PL live.
- **E-3 (2026-10-03, brief → orchestrator → founder): no submit button in `unavailable` and
  `preview`. `open`.** Every Phase 0 PDP is in one of those two states, so with JS off a buyer
  cannot submit a tier change, and AC-13/AC-15's "choosing a tier … and submitting" has no
  control. Either add a submit in every state with ≥2 tiers (new copy for the founder, plus an
  artboard note), or rule the Phase 0 tier change JS-only (TASK-129).
- **E-4 (2026-10-03, brief → orchestrator): overlap with TASK-146. `open`.** Both tasks edit the
  depth-4 route, `listing-cache-headers.ts` and its unit test, and both make depth 4 read
  `searchParams`. Under `CLAUDE.md` "Working on this machine", they go to one agent or run in a
  fixed order. E-1's answer decides both.

## Progress

_Not started._

## Result

_Pending._
