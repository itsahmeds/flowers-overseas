/** Public barrel for `catalog` (products, categories, occasions, pricing, translations). Owned by: spec 005. */

/**
 * The only import path into the catalogue and pricing module (spec 005 §2, §5.2; TASK-060).
 *
 * Pricing lives **inside** this module as `pricing/*`, because `plan/01` §5 assigns "products,
 * categories, occasions, **pricing**, translations" to one module: there is no `pricing` module
 * and no new module boundary. The directory is `catalog` (US spelling — `plan/01` §5,
 * `docs/architecture.md` §3, the `MODULES` manifest of `scripts/check-layout.ts` and spec 001
 * AC-9's lint fixtures all use it); British spelling stays in prose and in the *dataset* path
 * `src/config/catalogue/`, which is config and not a module (spec 005 §5.2's ruling).
 *
 * What this barrel exports today is the money vocabulary plus the **taxonomy read API**
 * (TASK-063): `getProduct`, `listProducts`, `getCategory`, `getOccasion`, `resolveFacets`,
 * `isAuthoredFacetPath`, `countProductsIn`, `countProductsFor`, `hasIndexableProducts` and
 * `topProductsForPrebuild`.
 *
 * TASK-064 adds the **tier and add-on read API**: `listTiers`, `defaultTier` and `listAddons`,
 * with `Tier`, `Addon`, `ProductTierSchema` and `AddonSchema`. The rest of spec 005 §5.2's
 * surface — `resolvePrice`, `priceProjection`, `priceTable`, `fromPrice`, `availability`,
 * `isProductIndexable`, `quote`, `cacheTagsFor` — arrives with the tasks that own each,
 * TASK-065 … TASK-069.
 *
 * TASK-066 adds `pricing/fx.ts` and `pricing/round.ts` and exports **nothing** from here, which is
 * the deliberate half of it: `convert`, `fxRateFor`, `roundToStyle` and `convertForDisplay` are
 * internal. Spec 005 §5.2's caller surface is whole prices and projections — `resolvePrice`,
 * `priceProjection`, `priceTable`, `fromPrice`, `quote` — and a barrel-exported converter would let
 * a caller produce a converted amount with no rate and no `fxAsOf` stamped on it, which §5.4 exists
 * to prevent, or round a price a second time outside the one place that decides the display
 * currency. TASK-067's `priceProjection()` is the exported way a converted price is obtained, and
 * it is the only one.
 *
 * What TASK-064 deliberately does **not** export: `isFlagEnabled`. The flag seam of spec 005 §12
 * is internal (`./flags`, `./static`), because callers ask this module for the add-ons they may
 * offer and never for the state of a flag — which is what lets spec 002's `feature_flag` table
 * take the authority over with no caller change.
 *
 * What may never be exported from here, and is asserted by `tests/unit/catalog-barrel.test.ts`
 * (AC-2):
 *
 *  - **a provider.** `CatalogueProvider` / `PriceProvider` / `FxRateProvider` / `FlagProvider`
 *    and the composition root are internal (`./providers`, `./static`, later `./db`): callers ask the module for a
 *    price, never for a data source, so swapping the static seam for Postgres (TASK-070) touches
 *    no file outside this directory. From TASK-063 the barrel's *import graph* necessarily reaches
 *    the composition root — a read function has to read something — so what the test pins is the
 *    **export list** AC-2 actually names (no provider object, no dataset array, no database
 *    symbol) plus the rule that only `./static/index.ts` may import a `*.data.ts` file.
 *  - **a dataset path.** `src/config/catalogue/*.data.ts` is read by the static provider only.
 *  - **a database symbol.** No `drizzle`, `postgres`, `pg` or `@/lib/db` import exists anywhere in
 *    the module, and `pnpm check:no-db` covers `src/modules/catalog/**` (and `src/config/**`,
 *    which contains the dataset directory).
 *
 * There is also **no client JavaScript** here: no file in the module carries `"use client"` and no
 * client component may import it, so this module adds zero bytes to any client chunk (AC-3 —
 * spec 004 §14 A1's 131 072 B Brotli budget has 1 434 B of headroom).
 */

// Money types and their schemas (AC-8). `Money` itself and `formatMoney` stay spec 003's: this
// module reuses `MoneySchema` from `@/modules/i18n` and defines no second money type and no
// second formatter.
export type { IsoDate, PricePoint, Surcharge, SurchargeKind } from "./types";
export { surchargeKinds } from "./types";
export {
  BasisPointsSchema,
  IsoDateSchema,
  MessageKeySchema,
  MinorUnitsSchema,
  PricePointSchema,
  SurchargeSchema,
} from "./schemas";

// The taxonomy read API (spec 005 §2 "Taxonomy", §5.4, §6; TASK-063). Counts, never verdicts:
// the six-product threshold of `plan/02` §6 is spec 008's loader's and appears nowhere here.
export type {
  Category,
  FacetResolution,
  FacetSelection,
  Occasion,
  Product,
  ProductIndexability,
} from "./types";
export { FacetSelectionSchema, ListProductsQuerySchema } from "./schemas";
export {
  countProductsFor,
  countProductsIn,
  getCategory,
  getOccasion,
  getProduct,
  hasIndexableProducts,
  isAuthoredFacetPath,
  listProducts,
  resolveFacets,
  topProductsForPrebuild,
} from "./read";

// The tier and add-on read API (spec 005 §2 "Tiers and add-ons", §12, AC-19; TASK-064). `Addon`
// has no `defaultSelected`/`preselected` field and `AddonSchema` is `.strict()`, so a pre-ticked
// extra is unrepresentable rather than forbidden by review (CRD Art. 22, `plan/07` §2.1); every
// add-on carries its **own** `vatRateBp` for the destination (PL chocolates 2 300 vs flowers 800).
export type { Addon, Tier } from "./types";
export {
  AddonSchema,
  FORBIDDEN_ADDON_FIELDS,
  ProductTierSchema,
} from "./schemas";
export { defaultTier, listAddons, listTiers } from "./read";

// The pricing core (spec 005 §2 "Pricing", §5.2 `pricing/*`, §8, AC-8/AC-13/AC-16; TASK-065).
//
// `resolvePrice`, `tierPrices` and `fromPrice` each return a whole `PricePoint` — gross, VAT- and
// delivery-inclusive, with its own decomposition and the date's surcharge rows inside the amount —
// so there is no exported way to obtain a price that omits VAT, delivery or a surcharge (AC-8),
// which is `plan/07` §4's drip-pricing prohibition made unexpressible. None of them accepts a
// buyer country, an IP, a header or a locale: the destination is the only geography (EU 2018/302,
// ADR-0006). `dateSurcharges` hands spec 009 the exact amount and label key per delivery date so
// the figure is on the date chip **before** selection (AC-16), and `vatBreakdown` / `netFromGross`
// produce the per-rate integer split spec 015's `order.vat_breakdown` and spec 018's invoice read
// (AC-13). `addMoney`, `sumMoney` and `assertSameCurrency` are the integer money arithmetic those
// four are built from; conversion, rounding, history, projections and quotes are TASK-066…069's.
// `MAX_SURCHARGE_RANGE_DAYS` stays internal: the cap it names is enforced by
// `SurchargeDateRangeSchema`, which is exported, so a caller parses a range rather than
// remembering a number — and the barrel keeps exporting only schemas, value sets and functions
// (AC-2, `tests/unit/catalog-barrel.test.ts`).
export type {
  DatedSurcharge,
  IntegerMoney,
  TierPrice,
  VatLine,
  VatSplit,
} from "./types";
export {
  FromPriceQuerySchema,
  GrossAtRateSchema,
  IntegerMoneySchema,
  ResolvePriceQuerySchema,
  SurchargeDateRangeSchema,
  TierPricesQuerySchema,
  VatLineSchema,
  VatSplitSchema,
} from "./schemas";
export { addMoney, assertSameCurrency, sumMoney } from "./pricing/money";
export {
  dateSurcharges,
  fromPrice,
  resolvePrice,
  tierPrices,
} from "./pricing/resolve";
export { netFromGross, vatBreakdown } from "./pricing/vat";

// Projections and the price identity (spec 005 §5.2 `pricing/project.ts`, §6, §7, AC-9/10/11;
// TASK-067).
//
// `priceProjection(locale, …)` is the one view model a price-bearing page renders **and** spec
// 007's `Offer` builder reads, and `offerProjection()` derives the offer from that same
// projection — so the JSON-LD and the HTML cannot carry different numbers, which is `plan/02`
// §15's manual-action risk closed by construction rather than by a validator (AC-11). The display
// currency is the **locale's** `currencyDefault`: no function exported here accepts a
// display-currency override except `priceTable()`, which chooses no currency at all but
// enumerates every one we may display for spec 008's repaint island (AC-9). `fromPriceProjection`
// is the display-currency half of `fromPrice()` — visible "from" text, never an `Offer` (§6).
//
// `displayCurrencyFor()` stays internal, and that is the point: a caller that could ask this
// module for "the currency of locale X" would be one step from asking it for "the currency in
// cookie Y", and cached HTML would then differ per visitor with no `Vary` (`plan/03` §1).
export type {
  CatalogAvailabilityKey,
  OfferAvailability,
  OfferProjection,
  PriceProjection,
  PriceTable,
} from "./types";
// `catalogAvailabilityKeys` itself stays internal: it is a *record*, and the barrel exports only
// schemas, value sets and functions (AC-2). A caller never picks a reason key — it arrives on the
// projection or the offer already chosen — so exporting the map would only invite one to.
// `MAX_PRICE_TABLE_CURRENCIES` and `MAX_PRICE_TABLE_BYTES` stay internal for
// `MAX_SURCHARGE_RANGE_DAYS`'s reason: the bounds they name are enforced by `PriceTableSchema`,
// which is exported, so a caller parses a table rather than remembering two numbers — and the
// barrel keeps exporting only schemas, value sets and functions (AC-2).
export {
  FromPriceProjectionQuerySchema,
  OfferProjectionSchema,
  PriceProjectionQuerySchema,
  PriceProjectionSchema,
  PriceTableQuerySchema,
  PriceTableSchema,
  currencyFlagKey,
} from "./schemas";
// `FROM_PRICE_LABEL_KEY` stays internal for the same reason: a message key is a string constant,
// and the barrel exports schemas, value sets and functions only (AC-2). Spec 008's card asks its
// translator for `catalog.price.from` the way every other component asks for its own copy.
export {
  fromPriceProjection,
  offerProjection,
  priceProjection,
  priceTable,
} from "./pricing/project";

// Availability, indexability, the Omnibus figure and signed quotes (spec 005 §2 "Availability",
// §5.2 `availability.ts` / `pricing/history.ts` / `pricing/quote.ts`, §6, §8,
// AC-14/AC-17/AC-20/AC-21; TASK-068).
//
// `availability()` answers the third question every money page asks — *can it be sent at all* —
// from data alone, so a country go-live is a data flip and never a code change (AC-20); its
// verdict rides on every `PriceProjection` and decides the `Offer`, so the visible line and the
// structured data are one fact. `isProductIndexable()` is the **single** predicate the robots
// decision and the sitemap-membership query both call, which is what makes "a `noindex` product
// can never appear in a sitemap" structural rather than a convention (AC-21, `plan/02` §10).
// `lowestPriceInLast30Days()` is the Omnibus Art. 6a figure over the superseded rows — no
// "was/now" UI ships in Phase 0 and none may be added without it (AC-14). `quote()` /
// `verifyQuote()` sign the amount a buyer saw and refuse it once it is no longer the price; on
// `expired` the caller re-derives and shows the new figure for explicit re-confirmation (AC-17).
//
// What stays internal here, for the reasons the rest of this barrel states: `staticCutoffEvaluator`
// (a test-grade seam filler, not a caller surface — spec 009 ships the real evaluator),
// `resolveByPriceVersion` and `rateValidUntil` (this module reading its own opaque tokens and its
// own FX policy), `indexabilityVerdict` and `productIndexability` (the term-by-term diagnostic
// behind the one predicate), `hasActivePrice`, and the constants `QUOTE_TTL_MINUTES` and
// `OMNIBUS_WINDOW_DAYS` — the barrel exports schemas, value sets and functions only (AC-2).
export type {
  Availability,
  Quote,
  QuoteLine,
  QuoteVerdict,
  SchemaAvailability,
} from "./types";
export type {
  CapacityProvider,
  CutoffEvaluator,
  DeliveryCutoff,
  FulfilmentCoverage,
} from "./availability";
export type { QuoteLineInput } from "./pricing/quote";
export {
  AvailabilityQuerySchema,
  AvailabilitySchema,
  QuoteLineSchema,
  QuoteSchema,
  TierKeySchema,
} from "./schemas";
export { availability } from "./availability";
export { isProductIndexable } from "./read";
export { lowestPriceInLast30Days } from "./pricing/history";
export { quote, verifyQuote } from "./pricing/quote";

// Cache tags (spec 005 §5.2 `cache.ts`, §5.4, AC-25; `plan/01` §3; TASK-069).
//
// `cacheTagsFor()` is the **only** builder of `catalog:{country}`, `product:{id}` and
// `country:{iso}`, and `tests/unit/catalog-cache-tags.test.ts` scans `src/` to keep it that way:
// a tag is a name the page that attaches it and the job that purges it must spell identically, so
// a second speller is a page that silently never refreshes. It maps a *mutation* to every tag that
// mutation invalidates rather than an entity to its own name, because the union is exactly what a
// caller gets wrong; `docs/runbooks/pricing.md` writes the same map out for 007/008/012.
//
// Spec 005 calls `invalidate()` nowhere (§5.4): this module produces names, `src/lib/cache.ts`
// stays the seam, and the first purges are spec 012's admin price edit and TASK-071's
// `fx.refresh`. `CATALOG_CACHE_TAG_PREFIXES` stays internal for the reason every other constant
// here does — the barrel exports schemas, value sets and functions, and a caller that read a
// prefix would be one line from building a tag with it (AC-2).
export type { CacheEntity } from "./cache";
export { CacheEntitySchema, cacheTagsFor } from "./cache";

// Slugs and the listing boundary schemas (spec 008 §5.1 amendment 1, §5.2, AC-4; TASK-105).
//
// `slugFor` / `resolveSlug` / `hasSlug` are the two-way map between a catalogue key and the URL
// segment that stands for it in a locale — the resolver neither spec 005 nor spec 006 exposed and
// without which a listing route cannot be built. They are pure, synchronous and total: a key with
// no **authored** slug in a locale answers `undefined`/`false`, which is spec 008 §2's existence
// rule ("and an authored slug") and spec 008 §13 Q10's ruling that the `de`/`pl` pages appear as
// data when the founder authors them (TASK-106), with no edit here.
//
// `ListingParamsSchema` parses a listing route's path segments (a bad one is `notFound()`, never a
// redirect) and `ListingSearchParamsSchema` its query string — the latter cannot fail: every
// parameter is honoured (`page`, `sort`) or neutralised, and the canonical, the 301 and the robots
// directive stay TASK-114's and spec 007's `indexability()`'s.
//
// `slugKinds` and `listingSorts` are exported as value sets for the same reason the barrel exports
// `surchargeKinds`: a caller iterating the closed set cannot invent a fourth namespace or a
// "bestsellers" order that §8 forbids.
// `listingPageTypes` is the third value set, and it lives in this module rather than in spec 003's
// i18n barrel (which exports functions and schemas only): `listingPath()` needs the six names as a
// type, everything that *enumerates* them — this module's `ListingPageTypeSchema`, TASK-114's
// `generateStaticParams`, the sitemap builders — needs one closed array, and one array cannot
// disagree with itself.
export type {
  ListingPageType,
  ListingSearchParams,
  ListingSort,
  SlugKind,
} from "./types";
export { listingPageTypes, listingSorts, slugKinds } from "./types";
// `ProductParamsSchema` is the same door one page type down (spec 009 §2, §5.2; TASK-121): the
// three path segments of `/{locale}/{country}/{product}/{slug}`, `.strict()` so an uppercase
// variant, a slash-bearing segment or a fourth parameter is a parse failure and therefore a 404.
// `ProductPageIdentitySchema` is the same page named by (locale, destination, SKU) — what
// `productPageExists()` answers for.
export type { ListingParams, ProductParams } from "./schemas";
export {
  CatalogueSlugSchema,
  EntityKeySchema,
  ListingPageTypeSchema,
  ListingParamsSchema,
  ListingSearchParamsSchema,
  ListingSortSchema,
  ProductPageIdentitySchema,
  ProductParamsSchema,
  SlugKindSchema,
} from "./schemas";
export { hasSlug, resolveSlug, slugFor } from "./slugs";

// The listing parameter policy (spec 008 §2 "Sort, filters, pagination", §6, AC-9, AC-10, AC-15;
// TASK-114).
//
// `listingRequest(path, searchParams)` is the **one** answer to "what does this query string do":
// the `?page=1` redirect to the listing's bare path, the page number `listingView()` takes, the order, the
// `· Page N` title, the canonical's single permitted parameter, and the `parameterised` flag that
// becomes spec 007's `unparameterised` indexability term. It is pure and total — a query string is
// whatever a crawler typed, so there is no input it can refuse — and it is the only place a route
// may learn any of those six things, which is what stops the six page types answering one URL
// three ways.
export type { ListingRequest } from "./params";
export { listingRequest } from "./params";

// The listing view model, the existence set and the six page descriptors (spec 008 §2, §5.2, §6,
// §11, AC-3, AC-14; TASK-107).
//
// `listingView()` is the **single** input to the page, the JSON-LD builders and the sitemap row
// (§5.2, spec 007's `corridorView()` precedent), and `listingExists()` / `listingPages()` are the
// one answer `generateStaticParams`, the sitemap builders, the link renderers and the e2e crawl
// share — which is what makes "a page that fails the existence rule has no URL" structural rather
// than a convention. `PRODUCT_COUNT_FLOOR` is the one named constant of §13 Q7 (6, applied to
// existence); the shop root's "≥1 deliverable product" is a non-empty list and not a second
// number.
//
// `listingDescriptor()` / `listingIndexability()` gather spec 008 §6's terms and hand them to
// spec 007's `pageIndexability()`: no `noindex` branch is written in this module (AC-14).
//
// What stays internal, for the reasons the rest of this barrel states: the copy corpus
// (`./copy` — callers ask for a view, never for a row), the per-call count memo, and the
// existence rules of each page type (one predicate, `listingExists`, reads them all).
export type {
  HubCardView,
  ListingCrumb,
  ListingHeading,
  ListingIdentity,
  ListingIndexabilityTerms,
  ListingLinks,
  ListingOccasionDate,
  ListingOccasionEntry,
  ListingPageRecord,
  ListingView,
  ListingViewOptions,
  LocaleExistenceCounts,
} from "./listing";
// `PRODUCT_COUNT_FLOOR` and `LISTING_PAGE_SIZE` stay internal for the reason every other constant
// in this barrel does (AC-2): the barrel exports schemas, value sets and functions only. A caller
// that could read the floor would be one line from applying it itself, and the whole point of §13
// Q7's "one named constant read by one predicate" is that `listingExists()` is that predicate.
export {
  HubCardViewSchema,
  ListingCrumbSchema,
  ListingHeadingSchema,
  ListingIdentitySchema,
  ListingLinksSchema,
  ListingOccasionDateSchema,
  ListingOccasionEntrySchema,
  ListingViewSchema,
  categoryTileView,
  existenceCounts,
  existenceSummaryMarkdown,
  hubCardView,
  isPublishedCountry,
  // The per-locale paths of one listing page — spec 007's `corridorAlternatePaths()` precedent,
  // so a hreflang cluster is one call over the pages that genuinely exist (AC-16; TASK-109).
  listingAlternatePaths,
  listingDescriptor,
  listingExists,
  listingIndexability,
  listingLocales,
  listingPages,
  listingView,
  productCardView,
  publishedCountries,
  writeExistenceSummary,
} from "./listing";

// The corridor page's shop entry (spec 007 §2 "Internal links", spec 008 §2 "Links", AC-20;
// TASK-113). `src/modules/geo` cannot read the catalogue — the dependency runs catalog → geo — so
// the corridor's `liveSlots` are supplied by its route, and this is the one function that answers
// "may the site link into this destination's shop, and is there a shop root there to link at".
export { corridorShopEntry } from "./shop-entry";

// The shared per-depth route resolver (spec 008 §14 **A5**, spec 007 §14 **A8**; TASK-109).
//
// Next.js allows one dynamic slug name per (depth, position) across `app/`, so spec 007's corridor
// and spec 008's country shop root cannot each own a route file: they share one file per URL
// depth, and `resolveLocalePath()` is the single resolver those files call. It invents no
// existence rule — it reads `corridorPageExists()` and `listingExists()` — and returns the params
// of the page a path names, never a rendered view, so the single-source rule of §5.2 stays with
// `listingView()`. `localeSegmentParams()` / `localeChildParams()` are the union of both
// existence sets, which is what each file's `generateStaticParams` emits under
// `dynamicParams = false`.
export type {
  LocaleChildParams,
  LocaleGrandchildParams,
  LocalePathResolution,
  LocaleSegmentParams,
} from "./routes";
export {
  localeChildParams,
  localeGrandchildParams,
  localeProductParams,
  localeSegmentParams,
  resolveLocalePath,
} from "./routes";

// The product page's existence set and its prebuild list (spec 009 §2, §5.2, §11, **AC-3**,
// **AC-4**; TASK-121). `productPageExists()` is the single answer to "is this URL a page", on the
// same footing as `listingExists()` one level up: the route, `generateStaticParams`, the sitemap
// builder, spec 008's card-link renderer and the e2e crawl all read it, so they cannot disagree.
// `PRODUCT_PREBUILD_COUNT` stays internal for `PRODUCT_COUNT_FLOOR`'s reason (AC-2) — a caller
// that could read it would be one line from applying it instead of asking for the list.
export type {
  LocaleProductCounts,
  ProductPageIdentity,
  ProductPageRecord,
} from "./product";
export {
  listProductPages,
  productExistenceCounts,
  productExistenceSummaryMarkdown,
  productPageExists,
  productPrebuildPages,
  writeProductExistenceSummary,
} from "./product";

// The country shop root's page component and its breadcrumb (spec 008 §5.3, AC-1/AC-8/AC-24;
// TASK-109). The page component lives in the module that owns its view model — spec 007's
// `CorridorPage` precedent — so `app/` holds one resolve and one mount, and every decision about
// which block renders is made beside the rule that decides it. Both are Server Components; no file
// in this module carries `"use client"`.
export {
  CountryShopRootPage,
  type CountryShopRootPageProps,
} from "./ui/CountryShopRootPage.tsx";
// The two destination-less hubs (spec 008 §2 rows 10 and 13, AC-7/AC-11; TASK-112). They are two
// components and not one with a flag: the block order, the date table and the picker differ, and
// §5.3 gives each its own state list and its own artboard. What they share — the card, the grid,
// the breadcrumb, the view model and the no-money sentence — they share by composition.
export {
  CategoryHubPage,
  type CategoryHubPageProps,
} from "./ui/CategoryHubPage.tsx";
export {
  OccasionHubPage,
  type OccasionHubPageProps,
} from "./ui/OccasionHubPage.tsx";
export {
  ListingBreadcrumb,
  type ListingBreadcrumbProps,
} from "./ui/ListingBreadcrumb.tsx";
// The country category's page component (spec 008 §2 row 7, §5.3 row 2, **AC-5**; TASK-110), on
// the same footing as the shop root's: the page lives in the module that owns its view model, so
// `app/` holds one resolve and one mount. A Server Component; no file in this module carries
// `"use client"`.
export {
  CountryCategoryPage,
  type CountryCategoryPageProps,
} from "./ui/CountryCategoryPage.tsx";

// The country occasion's page component (spec 008 §2 row 8, §5.3 row 2, §12 task 7 — the country
// half of AC-11; TASK-111). Same rule, same footing.
export {
  CountryOccasionPage,
  type CountryOccasionPageProps,
} from "./ui/CountryOccasionPage.tsx";
