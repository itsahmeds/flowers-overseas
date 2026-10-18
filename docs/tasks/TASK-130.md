# TASK-130 — Schema: `BreadcrumbList` on the PDP equal to the visible trail; the **gated** `Product` + `Offer` builder (emits nothing in Phase 0; on a live-country fixture with a purchase path exactly one `Offer` with `price` = `displayPrice` to the cent, `priceCurrency` = the HTML's, `shippingRate` 0, `deliveryTime.cutoffTime` = the rendered cutoff, `hasMerchantReturnPolicy` = `MerchantReturnNotPermitted`); JSON-LD type scan forbidding the eight types over every PDP; `seo:validate` (schema) fixtures for both states

Row: `TASKS.md` → TASK-130. This brief is the task's long form: the row keeps a link and one
sentence, everything else lives here (spec 001 §14 A15, AC-34). Scaffold it with
`pnpm tasks:brief TASK-130`; keep it current by editing this file, not the row.

## Binding

**Owned: spec 009 AC-18 (T-18, and T-32 as its schema consumer).** Spec 009 §14 has no amendment that rewrites AC-18; two that touch it are quoted below.

- **AC-18, in the spec's words.** "Every PDP emits a `BreadcrumbList` equal to the visible breadcrumb in order and label. **No PDP emits `Product`, `Offer`, `AggregateOffer`, `aggregateRating`, `review`, `Event`, `LocalBusiness` or `FloristShop`** in Phase 0, asserted by a JSON-LD type scan over every rendered PDP in every locale. The gated builder, exercised on a fixture with a live country and a purchase path, produces exactly one `Offer` whose `price` equals the rendered `displayPrice` to the cent, whose `priceCurrency` equals the currency in the HTML, whose `shippingRate` is 0, whose `deliveryTime.cutoffTime` equals the rendered cutoff and whose `hasMerchantReturnPolicy` is `MerchantReturnNotPermitted`; `pnpm seo:validate` (schema) passes on both fixtures."
- **Gate, not emission (§6 "Schema types", §13 Q8).** In Phase 0 the page emits `BreadcrumbList` only. The `Product` + single `Offer` builder is written and tested here but **emits only when the page is indexable and a purchase path exists** (`corridorState(iso2) === "live"`, `pickerState() === "live"`). Fed by spec 005's `offerProjection(view.price)`, so `Offer.price === renderedDisplayPrice` by construction (spec 005 AC-11). `eligibleRegion` is the destination ISO. **No cross-country canonical** (Q8).
- **One input.** The page, the JSON-LD builder and the sitemap row all read `productView()` (T-32: a fake provider changes all three together). The `BreadcrumbList` is built from `view.breadcrumb`, the same list the visible trail renders (TASK-125 carry-forward); the route may not call the price functions itself.
- **Amendments that bind (§14).** A12 invariant: "When the gated `Offer` emits (AC-18), `Offer.price` equals the buy section's price", and equivalents never reach JSON-LD, `<meta>`, a sitemap or `priceTable`. A-founder-2026-10-14c clause 4: nothing about add-ons reaches JSON-LD (Q8 stands). A-founder-2026-10-15a clause 3 and AC-36: `Product.name` and every JSON-LD `name` contain no U+2014, no spaced hyphen, no spaced U+2013 (the breadcrumb's last item is the product name). TASK-228 makes every price follow the chosen size: on the bare page the `Offer` is the default tier's all-in price, and the fixture asserts it against the rendered buy-section string, not a literal.
- **Validator (TASK-093 hand-off).** `scripts/seo/validate-schema.ts` deliberately gave `Product`/`Offer` no required properties ("that row is spec 009's and the builder is TASK-130's"). Add them in `shapeProblems()`, read off the same `plan/02` §9 table as `ALLOWED_TYPES`. A fixture whose `Offer` lacks `price`, `priceCurrency` or `availability` must exit 1 naming the problem. Both states get fixtures in `tests/fixtures/seo/schema/` (`pdp-product-offer.json` exists from TASK-069; the Phase 0 breadcrumb-only state is new). Fixtures are rebuilt from the builders, so also keep one hand-written bad document that no builder would emit (TASK-093's lesson: a validator fed only by its own builders agrees with itself).
- **Tests owned:** T-18 (e2e JSON-LD type scan over every rendered PDP in every locale for the eight forbidden types; contract test on the gated builder with a live fixture asserting price, currency, `shippingRate` 0, `cutoffTime`, return policy; `seo:validate` green on both fixtures) and T-32's schema case.
- **Copy.** None. This is structured data from existing view-model fields; no message key is added. If a field needs a new string (a return-policy label, for instance), stop and escalate. en-gb's unreviewed share is 4.98% of the 5% line, so any new public key waits for the founder's copy batch.
- **Class: keeps the breaker** (SEO gate: structured data; price display).
- **Watch red, then restore (name each in `## Result`):** `Offer.price` moved by one minor unit (validator and identity test both red); `priceCurrency` from the destination instead of the HTML's; `Product` emitted in Phase 0 (type scan red); `aggregateRating` or `review` planted; a breadcrumb item reordered or relabelled against the visible trail; the gate predicate forced true on a not-live country; the type scan's list shortened by one of the eight; `shippingRate` non-zero; a U+2014 in `Product.name`.
- **Gates:** `pnpm gates:cheap` with its block pasted; `pnpm seo:validate`; e2e is CI's.

## Read

- `specs/009-product-page-date-picker.md`: `## 0. Index`, then §6 "Schema types" and "Sitemap membership", §9 AC-18, §10 T-18 and T-32, §13 Q8, §14 A12 (the invariants), A-founder-2026-10-14c clause 4, A-founder-2026-10-15a clause 3 and AC-36.
- `specs/007-corridor-pages.md` AC-15 and AC-16 (the builders' contract and the type scan they extend), `plan/02` §9 (the type table).
- Files: `src/modules/seo/schema/breadcrumbList.ts` and `JsonLd.tsx` (the builders to follow), `src/modules/catalog/pricing/project.ts` (`offerProjection`), `src/modules/catalog/product.ts` (`productView()`, `breadcrumb`, `price`), `scripts/seo/validate-schema.ts`, `tests/unit/seo-validate-schema.test.ts`, `tests/contract/seo-schema-fixtures.test.ts`, `tests/unit/catalog-offer-schema-identity.test.ts`, `tests/e2e/schema.spec.ts`, `tests/fixtures/seo/schema/`.
- `docs/tasks/TASK-093.md` (why the validator could not fail, and the mutation list) and `docs/tasks/TASK-125.md` (the hand-off to this task).

## Carry-forwards

- **From TASK-093 and `/review 93` (2026-09-21):** `shapeProblems()` must give `Product` and `Offer` their required properties; a builder defect would otherwise agree with itself in every gate because fixtures are regenerated from the builders. Keep a hand-written bad `Offer` document in the unit suite.
- **From TASK-125 (2026-09-23):** build the `Offer` from `offerProjection(view.price)` and the `BreadcrumbList` from `view.breadcrumb`; T-32's fake-provider case already asserts `offerProjection(view.price).price` moves with the page. Membership and the robots directive are `view.indexability`, never a second call to `productPageIndexability()` (pinned by `catalog-product-view-source.test.ts`).
- **From TASK-234 (2026-10-18):** `Product`/`Offer` and the PDP `BreadcrumbList` stay with this task; TASK-234 only fixes the locale home's canonical. The PDP emits no JSON-LD today.
- **From TASK-115 (todo today, spec 008 breadcrumb types):** it extends `breadcrumbList` to six listing page types and inherits `shapeProblems()`. If it merges first, rebase on its signature; if not, do not widen `breadcrumbList` for it, and tell whichever of the two lands second to merge the `shapeProblems()` additions by hand.
- **Not concurrent** with TASK-228 to TASK-230, TASK-128 or TASK-129 on `ProductPage.tsx` and the route file; this task mounts one `<JsonLd>` in the product branch and should not edit the layout.
- **From the site test (2026-10-18, QA-1 and QA-2 on `c8d3b334`; screenshots in `.claude/state/qa-2026-10-18/`):**
  - Q18-09 (P2): QA-1 found no `Product`, `Offer` or `BreadcrumbList` JSON-LD on any of the 2,352 products on `c8d3b334`. `Product` and `Offer` are gated and emit nothing in Phase 0 on purpose; the PDP `BreadcrumbList` is this task. Flag it in the ranking plan before TASK-096's indexing flip.

## Escalations

One dated bullet per escalation: the question, who it went to, the answer or `open`.

- 2026-10-18 (implementer, non-blocking; built the fail-closed answer): the brief binds both
  "build the `Offer` from `offerProjection(view.price)`" and A12/AC-31 "`Offer.price` equals the
  buy section's price". On the bare page they agree unless the preselected first date carries a
  surcharge (a peak day such as Women's Day 8 March 2027): `view.price` is then the dated total
  and the buy section prints the tier price. `productOfferNode()` emits **no** `Product`/`Offer`
  in that case (pinned by the contract test). Alternative for a later task: carry the undated
  projection of the selected tier on `ProductView` and build the `Offer` from it. To the
  orchestrator; `open`.

## Progress

- 2026-10-18 10:15Z: builder (`seo/schema/productOffer.ts`), gate and composition
  (`catalog/productSchema.ts`), route mount, validator rules, live and Phase 0 fixtures; contract
  suite green. Pushed `df2e24f2`, draft PR 258.
- 2026-10-18 10:30Z: unit suite (builder refusals, Phase 0 scan, trail equality, scanner bites),
  T-32 schema case, product URL fixture, e2e scan of every PDP; every named mutation watched red.

- 2026-10-18 11:35Z (finisher, `/break 258` round 1 HOLES): rebased on `d1f5fc69`; holes 1-6
  closed with tests, each watched red under its mutation (see `## Result`).

- 2026-10-18 (finisher, `/break 258` round 2 hole): the AC-36 scan rule is now tested branch by
  branch: spaced hyphen and spaced en dash, space before only, after only, and both; unspaced
  "Hand-tied", "Forget-me-not" and "12–18" pass. Red when either dash, either side is dropped, or
  when any hyphen is flagged.

## Result

[PR 258](https://github.com/itsahmeds/flowers-overseas/pull/258). The PDP now serves one JSON-LD
block: `BreadcrumbList` built from `view.breadcrumb` (the array `ListingBreadcrumb` renders, with the
crumb's authored value passed as `{name}` the same way), and a `Product` with exactly one `Offer`
from `offerProjection(view.price)` behind the gate (indexable, `country.state` live,
`delivery.state` live), shut on every Phase 0 PDP. `validate-schema` gives `Product` (`name`,
`offers`) and `Offer` (`price`, `priceCurrency`, `availability`) their required properties, plus
one-Offer cardinality, shipping 0 in the offer's currency, `MerchantReturnNotPermitted` and AC-36's
dash rule on `Product.name`. Tests: contract `pdp-schema.test.ts` (14: live fixture identities
against the rendered buy section and cutoff line, Phase 0 breadcrumb-only, each gate term, the
peak-day fail-closed case, both fixtures regenerated and `seo:validate` green); unit
`catalog-product-schema.test.tsx` (11), `seo-validate-schema.test.ts` (+7, one hand-written bad
document `_cases/bad-offer-shape.json`), `product-url-fixture.test.ts` (2), T-32's served-Offer case;
e2e `schema.spec.ts` (+4 request-level scans over all 2,352 PDPs on `e2e-desktop`, +4 trail
equality pages). Mutations watched red: Offer.price +1 minor unit (identity test, fixture compare,
and `seo:validate` exit 1 on the regenerated fixture); `priceCurrency` from the destination;
gate forced true (Phase 0 scan, trail and fixture cases); country term forced true; `aggregateRating`
planted on Product; `review` planted on the trail; trail reordered; trail relabelled; "Event" removed
from the scan list (scanner-bites case); `shippingRate` 4.90 and U+2014 in `Product.name` (builder
throws, contract suite red; builder checks removed: unit refusal cases red). Local `cutoffTime` is
`HH:MM` as rendered, with no offset (see the PR's "Found vs suggested"). No message key added.

**Breaker round 1 holes, closed** (each case red under the named mutation, restored after):
(1) exact "Offer requires a non-empty price (plan/02 §9), and has undefined" messages, one property
missing at a time: red with `price` dropped from `REQUIRED_PROPERTIES.Offer`; (2) `AggregateRating`
and `Review` planted as types: red when either is dropped from the scan list; (3) a `Product` inside
a two-node `@graph` and an `Offer` inside an array: red when `walk()` stops descending arrays; (4)
selected tier in another currency at the same amount: red with the currency guard dropped; (5)
gate forced open on Germany (`offerProjection()` null): red with the null guard dropped;
`priceValidUntil` "2026-12-31" carried: red when always omitted; (6) the shared scan now refuses a
dashed `name` on every served PDP (AC-36): red with the dash rule dropped. Not runnable locally,
as the breaker said: removing the route's `<JsonLd>` mount is caught only by the e2e scan (one
BreadcrumbList per PDP).
