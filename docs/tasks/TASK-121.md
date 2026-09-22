# TASK-121 — PDP slug and route plumbing: `slugs.ts` gains `kind: "product"` with §13 Q1's shared-ASCII-slug fallback and optional per-locale override (spec 005 §14 amendment), `productPath()`, `ProductParamsSchema`, `productPageExists()` as the single existence answer, `listProductPages()` + top-24 prebuild per (locale, published country) with `dynamicParams = true`, collision and round-trip tests, per-locale counts to the step summary

Row: `TASKS.md` → TASK-121. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34).

## Binding

- **ACs owned:** spec 009 **AC-3** (prebuild set, `dynamicParams`, union = existence set, per-locale
  counts to the CI step summary) and **AC-4** (`productPageExists()` is the single existence
  answer), plus **AC-1**'s routing half (AC-1 itself is TASK-127's, which serves the status codes).
  Tests **T-03**, **T-04**. §12 task 1 — the root of spec 009's twelve-task chain.
- **The rule it implements, verbatim from §2:** a PDP exists iff the country is published, the
  product is `active`, an active `country_price` row exists for that (product, country), and the
  product has a slug in that locale. Everything else is a hard 404 — no redirect (ADR-0006), no
  soft-404, no substitute page.
- **§13 Q1, founder-resolved 2026-09-16:** one authored ASCII product slug shared by all four
  locales, with an optional per-locale override honoured the moment a translation authors one.
  Recorded as **spec 005 §14 A6** in this PR (spec 009 §5.1's amendment request; AC-29's first
  clause for spec 005).
- **Prebuild is a performance choice, not an existence choice** (§2, `plan/01` §3): top **24** per
  (locale, published destination), the rest generated on demand, the 404 guarantee inside the route.
- **Spec 008 §14 A5 governs the route file:** one route file per URL depth, dispatching through
  `resolveLocalePath()`. The product branch is **appended** to the depth-4 union; no existing branch
  in `routes.ts` or in the depth-3/depth-4 route files was reshaped (PR 88 and PR 93 were live in
  that code).
- **Gates:** `typecheck`, `lint`, `i18n:check`, `check:no-db`, `codebase:map --check`,
  `specs:index`, and the unit/contract/integration suites. Build, e2e, a11y, visual and Lighthouse
  belong to CI (CLAUDE.md definition of done item 2).

## Read

- `specs/009-product-page-date-picker.md` — `## 0. Index`, then §2 (the URL and its existence
  rule), §9 AC-1/AC-3/AC-4, §10 T-03/T-04, §11, §13 Q1, §14 A4/A5
- `src/modules/catalog/routes.ts` — the one resolver; spec 008 §14 A5's one-file-per-depth rule
- `src/modules/catalog/listing.ts` — `listingExists()` / `listingPages()`, the pattern this mirrors
- `src/modules/catalog/copy.ts`, `slugs.ts` — `inheritsCopyFrom("product", …)`, §13 Q1's mechanism
- `docs/codebase-map.md`

## Carry-forwards

- **From `/review 96` (2026-09-22) — verdict PASS.** Nothing in the code has to change. Four
  items to carry, none of them a code fix:
  1. **The `dynamicParams` escalation is a one-way decision, not a two-way one — say so.** The
     reasoning in `## Escalations` holds only in the flip direction. Flipping the shared depth-4
     file to `dynamicParams = true` **is** behaviour-preserving for the listings: every AC-1 404
     shape in `tests/unit/catalog-routes-depth4.test.ts` is asserted against
     `resolveLocalePath()` returning `{ kind: "notFound" }`, and the app route calls `notFound()`
     for every non-match, so the listing 200 set is the resolver's, not the router's, already —
     and those suites need **no** rewriting, contrary to the escalation's last sentence. The other
     direction is **not** equivalent: leaving `dynamicParams = false` while mounting the PDP makes
     the 1 680 on-demand PDPs router-404s and breaks AC-3's union clause outright. TASK-127 must
     flip it to `true`; the open question is only the 404-cost consequence (arbitrary URLs render
     dynamically instead of being refused by the static router, and 404 responses become
     cacheable under `revalidate`), which is a Cloudflare/caching note for TASK-127, not a choice
     about the 200 set.
  2. **Two of AC-3's five clauses are not met by this PR and must not be read as met.**
     `dynamicParams === true` is not exported anywhere, and `writeProductExistenceSummary()` has
     **no call site**, so no build prints the §11 counts today. The module doc and `## Result`
     both say TASK-127 owns the call site; the PR body's AC-3 bullet ("the per-locale counts go
     to `$GITHUB_STEP_SUMMARY`") reads as done and should be qualified. TASK-127's brief must
     carry both clauses explicitly, on the `writeExistenceSummary()` precedent (the depth-3
     `generateStaticParams` calls it exactly once per build — two tables in one step summary is
     the failure mode to avoid).
  3. **Row hygiene.** `TASKS.md` TASK-121 is still `in_progress` with no PR link in its notes cell
     (cell is 243 chars, within the 400 limit). Set it `in_review` / then `done` with `PR #96`.
  4. **Merge against a rebased head.** The branch's merge base is `6c19880`; `main` is at
     `90389f4`, which already deletes the same `listing.ts` blank line (`7c49028`) and already
     retires the `/en/occasions/mothers-day` 404 assertion that produced e2e red (a). After a
     rebase the disclosed out-of-scope hunk disappears and that e2e failure cannot recur; per the
     orchestrator's own rule (`b6a3377`), merge on a green run against the head being merged.
     `visual` remains PR 95's.

## Escalations

- **2026-09-22 — two red CI jobs that belong to other tasks, reported not fixed.** (a) `visual` is
  red on the whole fleet until **TASK-139** lands the Linux baselines (84 `darwin` against 3
  `linux`); this PR adds no artboard and no screenshot. (b) `e2e` is red on `main` itself for a
  contradiction between two merged PRs: `tests/e2e/country-occasion.spec.ts:41` (PR 89, TASK-110/111)
  asserts `/en/occasions/mothers-day` and `/en/occasions` **404**, with the comment "the occasion hub
  and the occasions index are TASK-112/113's URLs, not this depth's" — and PR 88 (TASK-112) then
  shipped the occasion hub at exactly that URL, so it now 200s. The fix is to drop those two lines
  from PR 89's 404 list; that is TASK-112's owner's call or the orchestrator's, not this task's, and
  this branch adds no URL, no link id and no sitemap row. Two consent/banner e2e cases
  (`banner.spec.ts:669`, `consent-banner.spec.ts:666`) also failed and touch nothing this task
  changes. Owner: orchestrator → TASK-112 and TASK-139.

- **2026-09-22 — one `dynamicParams` export, two page types at depth 4. Flagged, not blocking;
  owner TASK-127.** AC-3 requires `dynamicParams === true` on the PDP route. Spec 008 §14 A5 rules
  one route file per URL depth, and `src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx`
  already exports `dynamicParams = false` for the country category and country occasion, whose
  AC-1/AC-5 make "everything else is a 404" a property of the **router** rather than of a
  `notFound()` call (`tests/unit/catalog-routes-depth4.test.ts`). One module cannot export both
  values. TASK-121 did **not** flip it: that file is another task's landed scope and the flip
  changes the listing pages' 404 mechanism. The plumbing is written so either resolution works —
  `productPageExists()` is called **inside** `resolveLocalePath()` on every request, so the 200 set
  is identical whether the router or the resolver answers the 404 — and `localeProductParams()` is
  a separate params function precisely so the two halves of the depth can be unioned or split
  without touching this module. TASK-127 decides: flip the shared file to `true` and move the
  listing halves' 404 guarantee into the resolver (their suites would need rewriting, which is
  their owner's call), or carry the question to the orchestrator.

## Result

**PR:** [#96](https://github.com/itsahmeds/flowers-overseas/pull/96) (draft → ready). **Branch:** `task/TASK-121-product-slug-route-plumbing`, rebased on
`origin/main` at `6c19880` (after PR 88's hubs landed in `routes.ts`; both conflicts resolved
**additively** — the product branch is appended to the depth-4 union and no existing branch moved).

**What shipped.** `src/modules/catalog/product.ts` (new, 380 lines) holds the existence rule once:
`productPageExists()` is the single predicate, and `listProductPages()`, `productPrebuildPages()`
and `productExistenceCounts()` are that predicate enumerated, sliced and counted — none of them
adds a term. `src/modules/catalog/schemas.ts` gains `ProductParamsSchema` (the three path segments,
`.strict()`) and `ProductPageIdentitySchema` (the (locale, destination, SKU) triple the predicate
answers for). `src/modules/catalog/routes.ts` gains the `kind: "product"` member of
`LocalePathResolution`, the depth-4 branch that resolves it, and `localeProductParams()` for the
prebuild. `productPath()` and `slugKinds`' `"product"` member already existed from TASK-105; §13
Q1's shared-ASCII-slug-with-override mechanism is `copy.ts`'s `inheritsCopyFrom("product", …)`, and
this PR **records it as spec 005 §14 A6** — the amendment spec 009 §5.1 requests.

**The numbers a reviewer needs.** 84 products × 7 published destinations × 4 locales = **2 352**
pages exist (588 per locale), **672** are prebuilt (24 per locale and destination, 168 per locale),
**1 680** are served on demand — the union is the existence set exactly (AC-3). **0** are indexable
in any locale, which is ADR-0007's honest zero and what §11's table prints; `de` and `pl` each have
84 products with no reviewed description. The counts go to `$GITHUB_STEP_SUMMARY` through
`writeProductExistenceSummary()`; its call site is TASK-127's `generateStaticParams`, the function
whose output the numbers describe.

**Tests.** Unit **+2 files, +38 cases**: `tests/unit/catalog-product-routes.test.ts` (35) and
`tests/unit/catalog-product-country.test.ts` (3, its own module graph because a registry mock must
precede `countries.ts`'s first import). Predicate and set are checked against each other over the
**whole** 2 352-triple space, not a sample; every URL of the set round-trips through
`resolveLocalePath()`; 11 enumerated 404 shapes; the collision matrix against country slugs, path
segments and the category/occasion namespaces; `slugFor`/`resolveSlug` round-trip for 84 products ×
4 locales. `tests/unit/catalog-barrel.test.ts` gains the six new exports. Full local run: unit +
contract + integration **4 678 tests green** (197 files, 3 skipped). `typecheck`, `lint`,
`i18n:check`, `check:no-db`, `codebase:map --check` and `specs:index` all green. No build slot
taken: this task adds no page, no byte budget and no timing-sensitive number.

**CI (run 35702190659, head `ef0301a`).** **20 of 22 jobs green**: `lint`, `typecheck`,
`test-unit`, `test-integration`, `test-contract`, `build`, `container`, `db-check`,
`env-build-failure`, `commitlint`, `seo-validate`, `i18n-check`, `catalogue-check`,
`corridor-check`, `seed-check`, `dev-os-check`, `audit`, `preview`, `a11y`, `lighthouse`. The two
reds are the escalations above and belong to other tasks: `visual` (TASK-139's Linux baselines) and
`e2e` — **1 031 passed, 2 failed**, one of them `main`'s PR 88 / PR 89 contradiction over
`/en/occasions/mothers-day` and one a known consent-cookie flake that named a different fixture
string on each of the two runs.

**Definition of done item 4 — every AC-bearing assertion was mutated and watched go red.** Nine
mutations, each reverted after: (1) `PRODUCT_PREBUILD_COUNT` 24 → 23 → 6 failures; (2) the slug term
`hasSlug(…)` → `true` → 1; (3) the published-destination term dropped → 2; (4) the active-price term
dropped → 2; (5) the `status === "active"` term dropped → 1; (6) the route's `productPageExists()`
guard dropped → 5; (7) `ProductParamsSchema.strict()` → `.passthrough()` → 1; (8) the prebuild order
reversed → 3; (9) `productPath()` replaced by a hand-built template literal → 2. No assertion
survives the removal of its subject.

**Handed on.** TASK-127 mounts the page and decides the `dynamicParams` question above; TASK-125's
`productView()`, TASK-130's sitemap child and TASK-131's card-link renderer all read
`productPageExists()` / `listProductPages()` rather than re-deriving the rule — that is what AC-4
buys them.
