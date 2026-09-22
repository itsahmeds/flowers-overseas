/**
 * The product page's **existence set** and its prebuild list (spec 009 §2 "The URL and its
 * existence rule", §5.2 `catalog/product.ts`, §11, **AC-3** and **AC-4**; T-03, T-04; §12 task 1;
 * TASK-121).
 *
 * Spec 008 gave listings `listingExists()` / `listingPages()`; this is the same pair one level
 * down, for `/{locale}/{countrySlug}/{product}/{productSlug}`, and it exists for the same reason:
 * the route, `generateStaticParams`, the sitemap builder, spec 008's card-link renderer and the
 * e2e crawl must not be able to disagree about whether a URL is a page (AC-4). So **one predicate
 * answers that question** — `productPageExists()` — and every other function here is that
 * predicate enumerated, counted or ordered. None of them adds a term.
 *
 * ## The rule (spec 009 §2), term by term
 *
 * A PDP exists iff **the locale is one we route**, **the destination is published**
 * (`status === 'live'` or its guide is published — spec 008's `isPublishedCountry()`, not a second
 * reading), **the product is `active`**, **an active retail `country_price` row exists for that
 * (product, destination)** — spec 005's `hasActivePrice()` — **and the product has a slug in that
 * locale** (§13 Q1). Everything else is a hard 404 answered by `resolveLocalePath()`: an unknown
 * slug, a product not deliverable to that destination, an unpublished destination, another
 * locale's `product` segment, an uppercase or trailing-slash variant. No redirect (ADR-0006), no
 * soft-404, no substitute page.
 *
 * The slug term is what makes §13 Q1's ruling load-bearing rather than decorative: product slugs
 * are **one authored ASCII slug shared by all four locales** with an optional per-locale override
 * (`copy.ts`'s `inheritsCopyFrom("product", …)`, TASK-105), so `/de/polen/produkt/amber-hour`
 * exists on day one while `/de/blumen/roses` does not. A bouquet name is a proper noun that must
 * not be translated; a category name is a common noun that must be.
 *
 * ## Prebuild is a performance choice, not an existence choice (AC-3)
 *
 * 84 products × 7 published destinations × the routed locales is more URLs than `plan/01` §3's
 * three-minute build budget allows, and `plan/01` §3 already answers it: prebuild the top N per
 * (locale, destination) and generate the rest on demand. `productPrebuildPages()` is that list —
 * the **first `PRODUCT_PREBUILD_COUNT` pages that exist**, in spec 005's deterministic
 * `topProductsForPrebuild()` order (the locale's collation of the product name, tie-broken by
 * SKU; never a popularity claim we have no data for, §8). The PDP is therefore the one route in
 * the Phase 0 site with `dynamicParams = true`, and the 404 guarantee is preserved **inside** the
 * route by `productPageExists()` rather than by the params set — which is why this file, not the
 * params list, is the existence answer.
 *
 * ## Shape of the reads
 *
 * Pure over the providers — same data in, same answer out, no clock, no environment, no cookie,
 * no request — but `async`, because spec 005's read API is (TASK-070 swaps the static provider for
 * Postgres behind it). `pnpm check:no-db` covers this file. The per-call memo is the shape
 * `listing.ts` uses: the same (sku, destination) question is asked once per locale inside one
 * enumeration, the answer cannot change inside one call, and the dataset is 84 products against 7
 * destinations.
 */
import { z } from "zod";

import {
  type CountryIso2,
  countryConfig,
  isCountryIso2,
  isGuidePublished,
} from "@/config/countries";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import {
  type DeliveryWindow,
  CountryOperationsSchema,
  corridorSlug,
  corridorState,
  corridorStates,
  deliveryReasonKeys,
  deliveryWindow,
  pickerStates,
} from "@/modules/geo";
import {
  formatPercentFromBasisPoints,
  localePath,
  productPath,
} from "@/modules/i18n";
import {
  type DeploymentDescriptor,
  type IndexabilityVerdict,
  type PageDescriptor,
  INDEX_FOLLOW,
  NOINDEX_FOLLOW,
  deploymentDescriptor,
  pageIndexability,
} from "@/modules/seo";
import {
  ProductCardViewSchema,
  altFor,
  assetsForProduct,
  isDisplayable,
} from "@/modules/ui";

import { copyRow } from "./copy";
import {
  ListingCrumbSchema,
  isPublishedCountry,
  listingLocales,
  listingView,
  productCardView,
  publishedCountries,
} from "./listing";
import { priceProjection } from "./pricing/project";
import { dateSurcharges, resolveAddonPrice } from "./pricing/resolve";
import {
  getProduct,
  hasActivePrice,
  isProductIndexable,
  listAddons,
  listProducts,
  listTiers,
  topProductsForPrebuild,
} from "./read";
import {
  BasisPointsSchema,
  IntegerMoneySchema,
  IsoDateSchema,
  MessageKeySchema,
  PriceProjectionSchema,
  ProductPageIdentitySchema,
  TierKeySchema,
} from "./schemas";
import { hasSlug, slugFor } from "./slugs";
import type {
  IntegerMoney,
  IsoDate,
  PriceProjection,
  Product,
  Tier,
} from "./types";

/**
 * How many PDPs a build prebuilds per (locale, published destination) — `plan/01` §3's budget,
 * spec 009 §2's default of **24**.
 *
 * It is a *prebuild* count and nothing else: no page exists or stops existing because of it, and
 * raising it costs build minutes rather than URLs. It stays internal to the module for the reason
 * `PRODUCT_COUNT_FLOOR` does (spec 008 AC-2): a caller that could read it would be one line from
 * applying it instead of asking `productPrebuildPages()`.
 */
export const PRODUCT_PREBUILD_COUNT = 24;

/** One PDP, named the way the existence rule thinks about it: locale, destination, SKU. */
export interface ProductPageIdentity {
  readonly locale: LocaleCode;
  readonly countryIso: CountryIso2;
  readonly sku: string;
}

/** One page of the existence set, with everything a params list or a sitemap row needs. */
export interface ProductPageRecord extends ProductPageIdentity {
  /** The destination's slug in this locale, as the URL spells it. */
  readonly countrySlug: string;
  /** The product's slug in this locale — shared ASCII unless the locale authored an override. */
  readonly slug: string;
  /** `/{locale}/{countrySlug}/{product}/{productSlug}`, built only by `productPath()`. */
  readonly path: string;
}

/**
 * A per-call memo over the two reads the predicate makes. Same rationale as `listing.ts`'s: one
 * enumeration asks the same (sku, destination) question once per locale, and the data behind it
 * cannot change inside one call.
 */
interface ProductMemo {
  readonly products: Map<string, Promise<Product | null>>;
  readonly priced: Map<string, Promise<boolean>>;
}

function newMemo(): ProductMemo {
  return { products: new Map(), priced: new Map() };
}

function productIn(memo: ProductMemo, sku: string): Promise<Product | null> {
  const cached = memo.products.get(sku);
  if (cached !== undefined) return cached;
  const pending = getProduct(sku);
  memo.products.set(sku, pending);
  return pending;
}

function pricedIn(
  memo: ProductMemo,
  sku: string,
  iso2: CountryIso2,
): Promise<boolean> {
  const key = `${sku}|${iso2}`;
  const cached = memo.priced.get(key);
  if (cached !== undefined) return cached;
  const pending = hasActivePrice(sku, iso2);
  memo.priced.set(key, pending);
  return pending;
}

/**
 * **The** existence rule of spec 009 §2, in one place — five terms, each of them data. Every
 * public function in this file is this function enumerated or counted, which is what AC-4 means
 * by "the single existence answer".
 *
 * It takes strings and narrows them itself, rather than asking its callers to: the arguments come
 * off a URL, where "not a locale we route" and "not a country we know" are routine answers rather
 * than programming errors (`listingExists()`'s shape, one page type up).
 */
async function pageExists(
  sku: string,
  iso2: string,
  locale: string,
  memo: ProductMemo,
): Promise<boolean> {
  if (!isLocaleCode(locale)) return false;
  if (!isCountryIso2(iso2) || !isPublishedCountry(iso2)) return false;
  const product = await productIn(memo, sku);
  if (product === null || product.status !== "active") return false;
  if (!(await pricedIn(memo, sku, iso2))) return false;
  return hasSlug("product", sku, locale);
}

/**
 * Does this product page exist? — the one predicate the route, `generateStaticParams`, the sitemap
 * builder, spec 008's card-link renderer and the e2e crawl read (spec 009 §2, **AC-4**).
 *
 * Parsed at the boundary, because a route hands it strings off a URL. An unknown SKU is a miss
 * rather than an exception, for `getCategory()`'s reason: the argument came from a URL segment.
 */
export async function productPageExists(identity: unknown): Promise<boolean> {
  const parsed = ProductPageIdentitySchema.parse(identity);
  return pageExists(parsed.sku, parsed.countryIso, parsed.locale, newMemo());
}

/** One record of the set, with its path built by the one URL builder (spec 009 §2). */
function recordFor(
  sku: string,
  iso2: CountryIso2,
  locale: LocaleCode,
): ProductPageRecord | undefined {
  const slug = slugFor("product", sku, locale);
  if (slug === undefined) return undefined;
  const countrySlug = corridorSlug(iso2, locale);
  return {
    locale,
    countryIso: iso2,
    sku,
    countrySlug,
    slug,
    path: productPath(locale, countrySlug, slug),
  };
}

/**
 * **The existence set**: every PDP that exists, for one locale or for all of them (AC-3, AC-4).
 *
 * The candidates are the catalogue's active products — `listProducts()`'s default — and every one
 * of them passes through `pageExists()` before it becomes a record, so this function cannot come
 * to a different conclusion from `productPageExists()` about the same URL. Ordered by locale, then
 * by the registry's destination order (Poland first), then by ascending SKU: deterministic, so a
 * diff of two builds is a diff of the data.
 */
export async function listProductPages(
  locale?: LocaleCode,
): Promise<readonly ProductPageRecord[]> {
  const locales = locale === undefined ? listingLocales() : [locale];
  const memo = newMemo();
  const pages: ProductPageRecord[] = [];

  const candidates = await listProducts({});
  for (const code of locales) {
    for (const iso2 of publishedCountries()) {
      for (const product of candidates) {
        if (!(await pageExists(product.sku, iso2, code, memo))) continue;
        const record = recordFor(product.sku, iso2, code);
        if (record !== undefined) pages.push(record);
      }
    }
  }

  return pages;
}

/**
 * The pages a build prebuilds: the first `PRODUCT_PREBUILD_COUNT` **existing** pages per (locale,
 * published destination), in spec 005's deterministic `topProductsForPrebuild()` order (AC-3).
 *
 * Read as "the top 24 of the existence set", not "whichever of the top 24 products happen to have
 * a page": a product priced for a destination but missing a slug in one locale would otherwise
 * silently shrink that locale's prebuild by one and push a page that does exist out to the first
 * request. Which of the two is prebuilt changes nothing about **which URLs answer 200** —
 * `dynamicParams = true` and `productPageExists()` inside the route keep that set exactly
 * `listProductPages()` (AC-3's union clause).
 */
export async function productPrebuildPages(
  locale?: LocaleCode,
): Promise<readonly ProductPageRecord[]> {
  const locales = locale === undefined ? listingLocales() : [locale];
  const memo = newMemo();
  const pages: ProductPageRecord[] = [];

  for (const code of locales) {
    for (const iso2 of publishedCountries()) {
      // The whole deliverable list in prebuild order, sliced by existence rather than by count:
      // `topProductsForPrebuild()` filters on price, and the slug and status terms are this
      // module's.
      const deliverable = await listProducts({ countryIso: iso2 });
      if (deliverable.length === 0) continue;
      const ordered = await topProductsForPrebuild(
        iso2,
        code,
        deliverable.length,
      );

      let kept = 0;
      for (const product of ordered) {
        if (kept === PRODUCT_PREBUILD_COUNT) break;
        if (!(await pageExists(product.sku, iso2, code, memo))) continue;
        const record = recordFor(product.sku, iso2, code);
        if (record === undefined) continue;
        pages.push(record);
        kept += 1;
      }
    }
  }

  return pages;
}

/* -------------------------------------------------------------------------- */
/* The step summary (spec 009 §11).                                           */
/* -------------------------------------------------------------------------- */

/** One locale's row of §11's PDP existence summary. */
export interface LocaleProductCounts {
  readonly locale: LocaleCode;
  /** How many PDPs exist in this locale (AC-3's existence set). */
  readonly exists: number;
  /** How many of them a build prebuilds; the rest are generated on first request. */
  readonly prebuilt: number;
  /**
   * How many are indexable — `isProductIndexable()`, never a second reading of its six terms.
   * Named `indexablePages` rather than `indexable` because `tests/unit/catalog-indexability.test.ts`
   * keeps a `.indexable` read out of every file but `read.ts` (spec 005 AC-21, T-19): the one
   * indexability *decision* is that function's, and this is a count of its answers.
   */
  readonly indexablePages: number;
  /**
   * The honest number §11 asks for: how many **products** have no reviewed description in this
   * locale and are therefore non-indexable there, whatever else is true of them.
   */
  readonly withoutDescription: number;
}

/** Whether this locale has a reviewed, non-empty description for a product (spec 005 §6). */
function hasReviewedDescription(sku: string, locale: LocaleCode): boolean {
  const row = copyRow("product", sku, locale);
  return row !== undefined && row.reviewed && row.descriptionMd.trim() !== "";
}

/**
 * §11's per-locale counts, computed from the existence set rather than beside it — so a number in
 * the CI summary and a URL in the build are the same fact.
 */
export async function productExistenceCounts(): Promise<
  readonly LocaleProductCounts[]
> {
  const counts: LocaleProductCounts[] = [];
  const products = await listProducts({});

  for (const locale of listingLocales()) {
    const pages = await listProductPages(locale);
    const prebuilt = await productPrebuildPages(locale);

    let indexablePages = 0;
    for (const page of pages) {
      if (await isProductIndexable(page.sku, locale, page.countryIso)) {
        indexablePages += 1;
      }
    }

    counts.push({
      locale,
      exists: pages.length,
      prebuilt: prebuilt.length,
      indexablePages,
      withoutDescription: products.filter(
        (product) => !hasReviewedDescription(product.sku, locale),
      ).length,
    });
  }

  return counts;
}

/** The counts as the Markdown table §11 asks CI to print. No colour, no emoji, one table. */
export function productExistenceSummaryMarkdown(
  counts: readonly LocaleProductCounts[],
): string {
  const header = [
    "### Product page existence set (spec 009 §2, §11; prebuild " +
      String(PRODUCT_PREBUILD_COUNT) +
      " per locale and destination)",
    "",
    "| Locale | PDPs | Prebuilt | Indexable | Products with no reviewed description |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  const rows = counts.map((count) =>
    [
      `| ${count.locale}`,
      String(count.exists),
      String(count.prebuilt),
      String(count.indexablePages),
      `${String(count.withoutDescription)} |`,
    ].join(" | "),
  );
  return [...header, ...rows, ""].join("\n");
}

/**
 * Write the counts where CI reads them: `$GITHUB_STEP_SUMMARY` when the runner set one, stdout
 * otherwise — the shape `listing.ts`'s `writeExistenceSummary()` established (`/review 76` ruling
 * 4, TASK-107), and for the same reason: the counts can only be computed inside the module graph,
 * because every read below them goes through spec 005's provider seam and the `@/` alias, which a
 * bare `node scripts/*.ts` run resolves for neither.
 *
 * Its call site is the PDP route's `generateStaticParams` — the function whose output the numbers
 * describe (AC-3) — which **TASK-127** adds when the page it prebuilds exists to be rendered.
 */
export async function writeProductExistenceSummary(
  env: Readonly<Record<string, string | undefined>> = process.env,
  write: (text: string) => void = (text) => process.stdout.write(text),
): Promise<string> {
  const summary = productExistenceSummaryMarkdown(
    await productExistenceCounts(),
  );
  const stepSummary = env["GITHUB_STEP_SUMMARY"];
  if (stepSummary !== undefined && stepSummary !== "") {
    // A **dynamic** import on the branch that needs it, for `listing.ts`'s reason: this module is
    // on the render path of the shared route files, and `tests/unit/corridor-corpus-index.test.ts`
    // keeps a filesystem import off that graph. Only `generateStaticParams` takes this branch, at
    // build time, in a Node runtime.
    const { appendFileSync } = await import("node:fs");
    appendFileSync(stepSummary, `${summary}\n`, "utf8");
  } else {
    write(`${summary}\n`);
  }
  return summary;
}

/* ========================================================================== */
/* The view model (spec 009 §5.2 `ProductViewSchema`, AC-16, AC-21; TASK-125). */
/* ========================================================================== */

/*
 * `productView()` is the **single** input to the product page, its JSON-LD builders and its
 * sitemap row (§5.2, T-32 — spec 007's `corridorView()` rule and spec 008's `listingView()` rule,
 * one page type down). Everything a consumer prints is derived here once:
 *
 *  - **One price.** `price` is `priceProjection()` for the selected tier on the selected date — VAT
 *    and delivery included, the date's surcharge inside it — and the schema refuses a view whose
 *    `price` disagrees with the tier option or the date total that names the same configuration.
 *    So the number the summary prints, the number the `Offer` will carry (TASK-130) and the number
 *    the island swaps in (TASK-129) are one number, not three that happen to agree.
 *  - **The chip fee is the delta of two projected totals** (§13 design round **Q3**): the
 *    projection with the date minus the projection without it, in the display currency. Never a
 *    converted surcharge: converting 25 zł on its own and adding it to a separately rounded
 *    bouquet price is how a chip says "+£5.00" over a total that moved by £5.01.
 *  - **Add-on rows are in the destination currency** (Q4) at their own VAT rate, until spec 010
 *    adds a projection for them.
 *  - **Stale FX is a state of the view**, not of one field: every projection on the page shares
 *    one clock, so they all convert or all fall back together, and `fx.state` says which.
 *  - **Indexability** is spec 007's `indexability()` over a `product` descriptor whose every term
 *    is stated (§6, AC-16). This module writes no robots directive.
 *
 * Nothing here can express a rating, a review count, a badge, a countdown, a relative day label,
 * a "from" price, a reference price or an add-to-basket control: `ProductViewSchema` is `.strict()`
 * at every level and has no field for any of them (§8, AC-21, AC-22).
 */

/** How many related products the page shows at most (spec 009 §5.3 "Related products: ≤6"). */
export const RELATED_PRODUCTS_MAX = 6;

/** How many thumbnails the gallery carries beside its hero (§5.3 "hero + up to 4 thumbs"). */
export const GALLERY_THUMBS_MAX = 4;

/**
 * The embedded totals table's bounds (§5.2 `DateTotalsSchema`): ≤ 5 tiers × ≤ 21 dates, ≤ 4 096 B
 * serialised UTF-8 — the table the island reads and the page pays for in bytes.
 */
export const DATE_TOTALS_MAX_TIERS = 5;
export const DATE_TOTALS_MAX_DATES = 21;
export const DATE_TOTALS_MAX_BYTES = 4096;

/** The heading's composed key: `{name} — {descriptor}` (`messages/en.json`, `catalog.descriptor`). */
const H1_KEY = "catalog.descriptor.name" as const;

/** The stale-FX sentence spec 005 ships — the only note a fallback price may carry (§14 A3). */
const FX_UNAVAILABLE_KEY = "catalog.availability.fxUnavailable" as const;

/** The leaf crumb's key: the product's authored name as its value (008's `breadcrumb.entity`). */
const PRODUCT_CRUMB_KEY = "breadcrumb.entity" as const;

/**
 * The trust claims the PDP may make, **each one only where its backing exists** (§2 "Trust", §5.3
 * "Trust block", §13 Q7 and design round Q5). A closed set of ids rather than message keys: the
 * sentence is the page's copy (TASK-127), the *decision* to make the claim is this model's.
 *
 *  - `substitution` — like-for-like substitution; every product carries a `substitutionClass`.
 *  - `freshnessGuarantee` — the 7-day freshness guarantee, beside substitution (design round Q5:
 *    "two claims, both true").
 *  - `localFlorist` — "made by our florist in the recipient's town": **gated on an active
 *    partner** (§2), so it appears only in the `live` picker state.
 *
 * No delivery-photograph claim (gated on spec 027) and no withdrawal-right notice (lawyer-gated,
 * §13 Q7) is expressible: neither has an id.
 */
export const trustClaims = [
  "substitution",
  "freshnessGuarantee",
  "localFlorist",
] as const;
export type TrustClaim = (typeof trustClaims)[number];

/** The three FX outcomes a page can be in (spec 005 §5.4, §14 A3). */
export const fxStates = ["native", "converted", "fallback"] as const;
export type FxState = (typeof fxStates)[number];

const NonEmpty = z.string().min(1);

/**
 * **`DateTotalsSchema`** — `Record<TierKey, Record<IsoDate, integer>>` (§5.2): the all-in total, in
 * minor units of the display currency, of every tier on every **selectable** date. It is the table
 * the island (TASK-129) reads to swap the summary without a request, so its entries are the same
 * `priceProjection()` amounts the server renders — byte-identical by construction (AC-13).
 *
 * The size refinement is spec 005 §14 A2's style: the bounds are enforced, not trusted.
 */
export const DateTotalsSchema = z
  .record(TierKeySchema, z.record(IsoDateSchema, z.int().nonnegative()))
  .superRefine((totals, ctx) => {
    const tiers = Object.keys(totals);
    if (tiers.length > DATE_TOTALS_MAX_TIERS) {
      ctx.addIssue({
        code: "custom",
        message: `the totals table carries ${String(tiers.length)} tiers; spec 009 §5.2 bounds it at ${String(DATE_TOTALS_MAX_TIERS)}`,
      });
    }
    for (const tier of tiers) {
      const dates = Object.keys(totals[tier] ?? {});
      if (dates.length > DATE_TOTALS_MAX_DATES) {
        ctx.addIssue({
          code: "custom",
          path: [tier],
          message: `tier \`${tier}\` carries ${String(dates.length)} dates; spec 009 §5.2 bounds it at ${String(DATE_TOTALS_MAX_DATES)}`,
        });
      }
    }
    const bytes = new TextEncoder().encode(JSON.stringify(totals)).length;
    if (bytes > DATE_TOTALS_MAX_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: `the totals table serialises to ${String(bytes)} B; spec 009 §5.2 bounds it at ${String(DATE_TOTALS_MAX_BYTES)} B`,
      });
    }
  });
export type DateTotals = z.infer<typeof DateTotalsSchema>;

/**
 * One tier as the selector prints it: its stem-count label key and **its own** all-in price for
 * this destination, projected into the locale's currency with no delivery date (the date's fee is
 * a separate line on the summary, printed on the chip before selection).
 */
export const TierOptionSchema = z
  .object({
    tierKey: TierKeySchema,
    labelKey: MessageKeySchema,
    stems: z.int().positive().nullable(),
    isDefault: z.boolean(),
    price: IntegerMoneySchema,
  })
  .strict();
export type TierOption = z.infer<typeof TierOptionSchema>;

/**
 * One read-only add-on row (§2 "Add-ons", AC-23): its name key, its price **in the destination's
 * currency** (design round Q4) and **its own** VAT rate. No selection state of any kind exists on
 * the shape — there is nothing to tick in Phase 0, and `Addon` has no `defaultSelected` to copy.
 */
export const AddonLineSchema = z
  .object({
    key: NonEmpty,
    nameKey: MessageKeySchema,
    price: IntegerMoneySchema.extend({
      amountMinor: z.int().nonnegative(),
    }).strict(),
    vatRateBp: BasisPointsSchema,
    vatRateText: NonEmpty,
  })
  .strict();
export type AddonLine = z.infer<typeof AddonLineSchema>;

/** One image of the gallery: an approved asset of spec 006's manifest, with this locale's alt. */
const GalleryImageSchema = z
  .object({ assetId: NonEmpty, alt: NonEmpty })
  .strict();

/**
 * The gallery (§5.3): a hero with up to four thumbnails, or the placeholder. The placeholder
 * carries nothing — no `<img>`, no alt text and therefore no honesty label (006 AC-18) — and is
 * the common Phase 0 case (72 of 84 products have no imagery).
 */
export const ProductGallerySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("photos"),
      hero: GalleryImageSchema,
      thumbs: z.array(GalleryImageSchema).max(GALLERY_THUMBS_MAX).readonly(),
    })
    .strict(),
  z.object({ kind: z.literal("placeholder") }).strict(),
]);
export type ProductGallery = z.infer<typeof ProductGallerySchema>;

/**
 * The delivery window as the page carries it: `deliveryWindow()`'s value, with the chip fees of
 * design round Q3 injected. The shape is **closed** here so the view refuses a key the calendar
 * never produces (a countdown, a relative label); the honesty refinements — `unavailable` lists no
 * date, a non-`live` window selects none, a closed date states its reason — are
 * `DeliveryWindowSchema`'s in `modules/geo/delivery/schemas.ts`, and the unit suite parses every
 * view's window with that schema too. The annotation on `deliveryOf()` below is the drift check
 * against `DeliveryWindow`.
 */
const ProductDeliveryDateSchema = z
  .object({
    date: IsoDateSchema,
    selectable: z.boolean(),
    reasonKey: z.enum(deliveryReasonKeys).optional(),
    surcharge: IntegerMoneySchema.optional(),
    occasionKeys: z.array(NonEmpty).readonly(),
  })
  .strict();

const ProductDeliverySchema = z
  .object({
    state: z.enum(pickerStates),
    timeZone: z.string().min(3).optional(),
    cutoffLocal: z.string().min(1).optional(),
    dates: z.array(ProductDeliveryDateSchema).readonly(),
    noticeKey: NonEmpty,
  })
  .strict();

/** Spec 007's delivery-facts block, in the shape `corridorView()` builds it (§5.3, reused). */
const ProductFactsSchema = z
  .object({
    known: z.boolean(),
    operations: CountryOperationsSchema.optional(),
    citiesKey: NonEmpty.optional(),
  })
  .strict();

/** The destination the page is for — the only geography it has (ADR-0006, §8). */
const ProductCountrySchema = z
  .object({
    iso2: z.string().length(2),
    slug: NonEmpty,
    nameKey: NonEmpty,
    /** The corridor guide, where one is published; plain text where it is not. */
    corridorPath: NonEmpty.optional(),
    state: z.enum(corridorStates),
  })
  .strict();

/**
 * **`ProductViewSchema`** — the single view model (§5.2). `.strict()` at every level, so there is
 * **no** `fromPrice`, `oldPrice`, `rating`, `reviewCount`, `badge`, `countdownSeconds`,
 * `relativeDayLabel` or `ctaAddToBasket` field and none can be added by a caller: §8's honesty
 * rules are enforced by the type, not by review (AC-21, AC-22).
 *
 * Its refinements are the price identity (§8 "Price display — the core"): the page quotes one
 * currency, the selected tier and date name one configuration, and `price` **is** that
 * configuration's total — the tier option's when no date is chosen, the totals table's entry when
 * one is.
 */
export const ProductViewSchema = z
  .object({
    locale: z.string().min(2),
    path: NonEmpty,
    country: ProductCountrySchema,
    product: z
      .object({
        sku: NonEmpty,
        name: NonEmpty,
        slug: NonEmpty,
        /** The "what the price does not include" sentence names the vase only when it is not. */
        vaseIncluded: z.boolean(),
      })
      .strict(),
    h1: z
      .object({
        key: z.literal(H1_KEY),
        name: NonEmpty,
        /** `catalog.descriptor.form.*` — absent for a product type with no authored form. */
        formKey: MessageKeySchema.optional(),
        flowerKey: MessageKeySchema,
      })
      .strict(),
    /** Spec 006's authored description (60–90 words ending in the substitution sentence). */
    description: z
      .object({ text: NonEmpty, reviewed: z.boolean() })
      .strict()
      .optional(),
    gallery: ProductGallerySchema,
    tiers: z.array(TierOptionSchema).min(1).readonly(),
    selectedTierKey: TierKeySchema,
    /** The chosen delivery date — absent unless the picker is `live` and a date is selectable. */
    selectedDate: IsoDateSchema.optional(),
    price: PriceProjectionSchema,
    fx: z
      .object({
        state: z.enum(fxStates),
        /** The sentence a fallback price carries — absent otherwise. */
        noticeKey: z.literal(FX_UNAVAILABLE_KEY).optional(),
      })
      .strict(),
    addons: z.array(AddonLineSchema).readonly(),
    delivery: ProductDeliverySchema,
    facts: ProductFactsSchema,
    totals: DateTotalsSchema,
    breadcrumb: z.array(ListingCrumbSchema).min(1).readonly(),
    related: z
      .array(ProductCardViewSchema)
      .max(RELATED_PRODUCTS_MAX)
      .readonly(),
    trust: z.array(z.enum(trustClaims)).readonly(),
    indexability: z
      .object({
        indexable: z.boolean(),
        /** As the one engine spells it — imported, never written here (AC-16). */
        directive: z.enum([INDEX_FOLLOW, NOINDEX_FOLLOW]),
      })
      .strict(),
  })
  .strict()
  .superRefine((view, ctx) => {
    const currency = view.price.displayPrice.currency;
    const selected = view.tiers.find(
      (tier) => tier.tierKey === view.selectedTierKey,
    );
    if (selected === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["selectedTierKey"],
        message: `\`${view.selectedTierKey}\` is not one of this product's tiers`,
      });
      return;
    }
    view.tiers.forEach((tier, index) => {
      if (tier.price.currency !== currency) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers", index, "price", "currency"],
          message: `tier \`${tier.tierKey}\` quotes ${tier.price.currency} on a page quoting ${currency}: one page, one currency (spec 009 §8)`,
        });
      }
    });

    // The totals table covers exactly the product's tiers and exactly the selectable dates.
    const tierKeys = view.tiers.map((tier) => tier.tierKey).sort();
    if (
      JSON.stringify(Object.keys(view.totals).sort()) !==
      JSON.stringify(tierKeys)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["totals"],
        message: "the totals table must carry every tier and no other",
      });
    }
    const selectable = view.delivery.dates
      .filter((date) => date.selectable)
      .map((date) => date.date);
    for (const tier of tierKeys) {
      const dates = Object.keys(view.totals[tier] ?? {});
      if (JSON.stringify(dates) !== JSON.stringify(selectable)) {
        ctx.addIssue({
          code: "custom",
          path: ["totals", tier],
          message: `tier \`${tier}\` prices ${dates.join(", ") || "no date"}, but the selectable dates are ${selectable.join(", ") || "none"}`,
        });
      }
    }

    // One price: the configuration the selection names, and nothing else.
    const expected =
      view.selectedDate === undefined
        ? selected.price.amountMinor
        : view.totals[view.selectedTierKey]?.[view.selectedDate];
    if (
      view.selectedDate !== undefined &&
      !selectable.includes(view.selectedDate)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["selectedDate"],
        message: `${view.selectedDate} is not a selectable date`,
      });
    }
    if (
      view.delivery.state === "live" &&
      selectable.length > 0 &&
      view.selectedDate === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["selectedDate"],
        message:
          "a live picker with a selectable date preselects the earliest one (spec 009 §2)",
      });
    }
    if (expected !== view.price.displayPrice.amountMinor) {
      ctx.addIssue({
        code: "custom",
        path: ["price", "displayPrice", "amountMinor"],
        message: `the price is ${String(view.price.displayPrice.amountMinor)} but the selected configuration totals ${String(expected)}: the price shown is the price charged, once (spec 009 §8)`,
      });
    }

    // Stale FX is a state of the page, and the note travels with it.
    const fallback = view.price.fxReasonKey !== undefined;
    if (fallback !== (view.fx.state === "fallback")) {
      ctx.addIssue({
        code: "custom",
        path: ["fx", "state"],
        message: `the projection ${fallback ? "fell back" : "did not fall back"} but the view says \`${view.fx.state}\``,
      });
    }
    if (fallback !== (view.fx.noticeKey !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["fx", "noticeKey"],
        message:
          "a fallback price says which currency it quotes, and only a fallback price does",
      });
    }
  });
export type ProductView = z.infer<typeof ProductViewSchema>;

/* -------------------------------------------------------------------------- */
/* Indexability: one descriptor, spec 007's engine (spec 009 §6, AC-16).       */
/* -------------------------------------------------------------------------- */

/**
 * The terms spec 009 §6 names for a PDP, gathered by the page's owner. **Every one is required.**
 *
 * Spec 007's `PageDescriptor` makes `operational` and `unparameterised` optional, and an omitted
 * optional term *leaves the conjunction* (007 §14 A7). That is right for a page type that has no
 * such gate and exactly wrong for one that does: TASK-114 / PR 93 shipped a listing whose
 * `unparameterised` wiring could be deleted with the whole suite green, because the omission was
 * a legal call that silently announced `index,follow` (the fail-open shape). A PDP has both gates
 * — its destination must be genuinely live, and `?tier=` / `?date=` make a duplicate — so this
 * record states both, and a caller that forgets one does not compile.
 *
 * `localeIndexable` and `indexingEnvironment` are not here because they are not the owner's to
 * gather: `pageIndexability()` reads them itself, so no caller can hand it a wrong one.
 */
export interface ProductIndexabilityTerms {
  /** Spec 009 §2's existence rule (`productPageExists()`). */
  readonly exists: boolean;
  /** `corridorState(iso2, locale) === 'live'` — an active florist, not a registry label. */
  readonly countryLive: boolean;
  /** `isProductIndexable(sku, locale, iso2)` — spec 005 §6's six terms, one predicate. */
  readonly productIndexable: boolean;
  /** The URL carries no `?tier=` / `?date=` / unknown parameter (§5.2, AC-15). */
  readonly unparameterised: boolean;
}

/**
 * The PDP's `PageDescriptor`: §6's terms mapped onto spec 007's, **all of them present**.
 *
 * `productIndexable` is the page's `reviewed` term: spec 005 §6's predicate is where "a reviewed,
 * non-null description in this locale" lives for a product, together with the active price —
 * which is the content-review gate `plan/02` §12 names, answered by the one function spec 005
 * says both the robots decision and the sitemap membership must call.
 */
export function productDescriptor(
  locale: string,
  terms: ProductIndexabilityTerms,
): PageDescriptor {
  return {
    pageType: "product",
    locale,
    exists: terms.exists,
    reviewed: terms.productIndexable,
    operational: terms.countryLive,
    unparameterised: terms.unparameterised,
  };
}

/**
 * The verdict for one PDP: gather §6's terms, then ask spec 007. No branch here — the directive,
 * the sitemap membership and the rendered meta are that engine's one answer (AC-16).
 */
export function productPageIndexability(
  locale: string,
  terms: ProductIndexabilityTerms,
  deployment: DeploymentDescriptor,
): IndexabilityVerdict {
  return pageIndexability(productDescriptor(locale, terms), deployment);
}

/* -------------------------------------------------------------------------- */
/* Money: the tier ladder, the price grid, the totals and the chip fees.       */
/* -------------------------------------------------------------------------- */

/** What the money functions are asked. `now` is the page's one clock (spec 005 §14 A3). */
export interface ProductPriceQuery {
  readonly productId: string;
  readonly countryIso: CountryIso2;
  readonly now: Date;
}

/**
 * **`tierOptions()`** — every tier of the product in its authored order, each with **its own**
 * all-in price in the locale's currency (§2 "Tier selector", AC-21's model half). One
 * `priceProjection()` per tier; no step is derived from a percentage and no price from another
 * tier's.
 */
export async function tierOptions(
  locale: LocaleCode,
  query: ProductPriceQuery,
): Promise<readonly TierOption[]> {
  const tiers = await listTiers(query.productId);
  return Promise.all(
    tiers.map(async (tier) =>
      tierOptionOf(tier, await tierProjection(locale, query, tier.tierKey)),
    ),
  );
}

function tierOptionOf(tier: Tier, projection: PriceProjection): TierOption {
  return TierOptionSchema.parse({
    tierKey: tier.tierKey,
    labelKey: tier.labelKey,
    stems: tier.stems,
    isDefault: tier.isDefault,
    price: projection.displayPrice,
  });
}

function tierProjection(
  locale: LocaleCode,
  query: ProductPriceQuery,
  tierKey: string,
  deliveryDate?: IsoDate,
): Promise<PriceProjection> {
  return priceProjection(locale, {
    productId: query.productId,
    tierKey,
    countryIso: query.countryIso,
    now: query.now,
    ...(deliveryDate === undefined ? {} : { deliveryDate }),
  });
}

/**
 * Every tier projected on every date of a window: the one table the totals, the chip fees and
 * the selected price are all read from.
 *
 * `dateSurcharges()` says **which** dates carry a fee — spec 005's answer to "what applies on this
 * day", asked once for the whole window — and `priceProjection()` says **what the total is**. The
 * two must agree, and this is where they are made to: a date with no surcharge row whose
 * projection differs from the undated one, or a surcharged date whose total *fell*, is a pricing
 * defect and throws rather than printing a chip that contradicts the summary.
 */
interface PriceGrid {
  /** The undated projection of each tier: the tier option's price. */
  readonly base: ReadonlyMap<string, PriceProjection>;
  /** `total[tier][date]`, in minor units of the display currency. */
  readonly total: ReadonlyMap<string, ReadonlyMap<IsoDate, number>>;
  /** The dates `dateSurcharges()` puts a fee on. */
  readonly surcharged: ReadonlySet<IsoDate>;
}

async function priceGrid(
  locale: LocaleCode,
  query: ProductPriceQuery,
  tiers: readonly Tier[],
  dates: readonly IsoDate[],
): Promise<PriceGrid> {
  const base = new Map<string, PriceProjection>();
  const total = new Map<string, Map<IsoDate, number>>();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const surcharged = new Set<IsoDate>(
    first === undefined || last === undefined
      ? []
      : (await dateSurcharges(query.countryIso, { from: first, to: last })).map(
          (surcharge) => surcharge.date,
        ),
  );

  for (const tier of tiers) {
    const undated = await tierProjection(locale, query, tier.tierKey);
    base.set(tier.tierKey, undated);
    const row = new Map<IsoDate, number>();
    for (const date of dates) {
      const dated = await tierProjection(locale, query, tier.tierKey, date);
      if (dated.displayPrice.currency !== undated.displayPrice.currency) {
        throw new Error(
          `\`${query.productId}\` ${tier.tierKey} on ${date} projects to ${dated.displayPrice.currency} while its undated price is ${undated.displayPrice.currency}: one clock, one currency (spec 005 §14 A3)`,
        );
      }
      const amount = dated.displayPrice.amountMinor;
      const without = undated.displayPrice.amountMinor;
      if (!surcharged.has(date) && amount !== without) {
        throw new Error(
          `\`${query.productId}\` ${tier.tierKey} on ${date} totals ${String(amount)} against ${String(without)} undated, yet \`dateSurcharges()\` puts no fee on that day — the chip would say "included" over a total that moved`,
        );
      }
      if (amount < without) {
        throw new Error(
          `\`${query.productId}\` ${tier.tierKey} on ${date} totals ${String(amount)}, less than its undated ${String(without)}: a surcharge cannot lower a price`,
        );
      }
      row.set(date, amount);
    }
    total.set(tier.tierKey, row);
  }
  return { base, total, surcharged };
}

/**
 * **`dateTotals()`** — the all-in total of every tier on every **selectable** date of a window
 * (§5.2 `DateTotalsSchema`). Selectable only: the island swaps the summary for a chosen date, and
 * a date that cannot be chosen has no total to swap in. A window with no selectable date (every
 * `unavailable` and `preview` picker) yields an empty row per tier.
 */
export async function dateTotals(
  locale: LocaleCode,
  query: ProductPriceQuery & { readonly window: DeliveryWindow },
): Promise<DateTotals> {
  const tiers = await listTiers(query.productId);
  const grid = await priceGrid(
    locale,
    query,
    tiers,
    query.window.dates.map((date) => date.date),
  );
  return totalsOf(grid, query.window);
}

function totalsOf(grid: PriceGrid, window: DeliveryWindow): DateTotals {
  const totals: Record<string, Record<string, number>> = {};
  for (const [tierKey, row] of grid.total) {
    const entries: Record<string, number> = {};
    for (const date of window.dates) {
      if (!date.selectable) continue;
      const amount = row.get(date.date);
      if (amount === undefined) {
        throw new Error(
          `${date.date} is selectable but was never priced for \`${tierKey}\``,
        );
      }
      entries[date.date] = amount;
    }
    totals[tierKey] = entries;
  }
  return DateTotalsSchema.parse(totals);
}

/**
 * The chip fee of every surcharged date for one tier: **the projected total with the date minus
 * the projected total without it** (design round Q3), in the display currency. A date whose fee
 * rounds to nothing carries none — the total did not move, so "included" is the true word.
 */
function chipFees(
  grid: PriceGrid,
  tierKey: string,
): Readonly<Record<IsoDate, IntegerMoney>> {
  const undated = grid.base.get(tierKey);
  const row = grid.total.get(tierKey);
  if (undated === undefined || row === undefined) {
    throw new Error(`\`${tierKey}\` was never priced`);
  }
  const fees: Record<IsoDate, IntegerMoney> = {};
  for (const date of grid.surcharged) {
    const amount = row.get(date);
    if (amount === undefined) continue;
    const fee = amount - undated.displayPrice.amountMinor;
    if (fee <= 0) continue;
    fees[date] = { amountMinor: fee, currency: undated.displayPrice.currency };
  }
  return fees;
}

/** Which of the three FX outcomes a projection is in (spec 005 §5.4). */
function fxStateOf(projection: PriceProjection): FxState {
  if (projection.fxReasonKey !== undefined) return "fallback";
  return projection.ratePpm === undefined ? "native" : "converted";
}

/* -------------------------------------------------------------------------- */
/* The non-money blocks.                                                      */
/* -------------------------------------------------------------------------- */

/** The add-on rows (AC-23): `listAddons()`'s offerable set, each priced in the destination. */
async function addonLines(
  locale: LocaleCode,
  iso2: CountryIso2,
): Promise<readonly AddonLine[]> {
  const lines: AddonLine[] = [];
  for (const addon of await listAddons(iso2)) {
    const price = await resolveAddonPrice({
      addonKey: addon.key,
      countryIso: iso2,
    });
    lines.push(
      AddonLineSchema.parse({
        key: addon.key,
        nameKey: addon.nameKey,
        price: { amountMinor: price.amountMinor, currency: price.currency },
        vatRateBp: addon.vatRateBp,
        vatRateText: formatPercentFromBasisPoints(addon.vatRateBp, locale),
      }),
    );
  }
  return lines;
}

/**
 * The gallery: every approved asset of the product with alt text **in this locale**, hero first
 * (spec 006 §2.5's manifest order), or the placeholder. An asset with no alt here is skipped
 * rather than shown with borrowed alt (006 AC-18) — the rule `productCardView()` applies.
 */
function galleryFor(sku: string, locale: LocaleCode): ProductGallery {
  const images: { assetId: string; alt: string }[] = [];
  for (const asset of assetsForProduct(sku)) {
    const alt = altFor(asset.id, locale);
    if (alt === undefined || !isDisplayable(asset.id, locale)) continue;
    images.push({ assetId: asset.id, alt });
  }
  const [hero, ...rest] = images;
  if (hero === undefined) return { kind: "placeholder" };
  return {
    kind: "photos",
    hero,
    thumbs: rest.slice(0, GALLERY_THUMBS_MAX),
  };
}

/**
 * The heading's descriptor keys (`catalog.descriptor.form.*` / `.flower.*`): the product name is a
 * proper noun and is not translated; the descriptor is a common noun and is (`plan/10` §2.2).
 * `hamper` and `voucher` are in the closed taxonomy with no product and no authored form key, so
 * a product of either type would carry no descriptor rather than an invented one.
 */
const FORM_KEYS: Readonly<Partial<Record<Product["productType"], string>>> = {
  bouquet: "catalog.descriptor.form.bouquet",
  arrangement: "catalog.descriptor.form.arrangement",
  plant: "catalog.descriptor.form.plant",
  funeral: "catalog.descriptor.form.funeral",
  gift_set: "catalog.descriptor.form.giftSet",
};

/**
 * The trail (§5.3, the artboard's six levels): the trail of the page one level up — the country
 * category of the product's primary flower where that page exists, the country shop root where it
 * does not — with its leaf turned into a link, and the product as the new leaf.
 *
 * Built from the parent's own `listingView()` rather than restated, so the PDP's crumbs cannot
 * disagree with the crumbs the parent page prints about itself (spec 004 AC-14: a crumb links only
 * where a page exists). A primary flower whose category is below the product-count floor has no
 * page, so its crumb is dropped rather than linked at a 404 (the artboard's rule).
 */
async function breadcrumbFor(
  locale: LocaleCode,
  countrySlug: string,
  product: Product,
  name: string,
  path: string,
  now: Date,
): Promise<ProductView["breadcrumb"]> {
  const from = now.toISOString().slice(0, 10);
  const categorySlug = slugFor("category", product.primaryFlower, locale);
  const parent =
    (categorySlug === undefined
      ? undefined
      : await listingView(
          {
            locale,
            pageType: "countryCategory",
            country: countrySlug,
            entity: categorySlug,
          },
          { from },
        )) ??
    (await listingView(
      { locale, pageType: "countryShopRoot", country: countrySlug },
      { from },
    ));
  if (parent === undefined) {
    throw new Error(
      `\`${product.sku}\` has a page at ${path} but its country shop root does not exist: the existence rules disagree`,
    );
  }
  return [
    ...parent.breadcrumb.map((crumb) => ({ ...crumb, current: false })),
    {
      labelKey: PRODUCT_CRUMB_KEY,
      labelValue: name,
      href: path,
      current: true,
    },
  ];
}

/**
 * The related row (§5.3, §8 "Ranking transparency"): spec 005's deterministic founder-set order
 * for this destination and locale, this product excluded, **pages that exist only**, at most six.
 * Nothing about the visitor enters it.
 */
async function relatedFor(
  sku: string,
  iso2: CountryIso2,
  locale: LocaleCode,
  productLinks: boolean,
): Promise<ProductView["related"]> {
  const memo = newMemo();
  const deliverable = await listProducts({ countryIso: iso2 });
  const ordered = await topProductsForPrebuild(
    iso2,
    locale,
    deliverable.length,
  );
  const picked: Product[] = [];
  for (const candidate of ordered) {
    if (picked.length === RELATED_PRODUCTS_MAX) break;
    if (candidate.sku === sku) continue;
    if (!(await pageExists(candidate.sku, iso2, locale, memo))) continue;
    picked.push(candidate);
  }
  return Promise.all(
    picked.map((candidate) =>
      productCardView(candidate, locale, iso2, { productLinks }),
    ),
  );
}

/** The closed shape `ProductDeliverySchema` admits, from the calendar's own value. */
function deliveryOf(window: DeliveryWindow): ProductView["delivery"] {
  return {
    state: window.state,
    ...(window.timeZone === undefined ? {} : { timeZone: window.timeZone }),
    ...(window.cutoffLocal === undefined
      ? {}
      : { cutoffLocal: window.cutoffLocal }),
    dates: window.dates.map((date) => ({
      date: date.date,
      selectable: date.selectable,
      ...(date.reasonKey === undefined ? {} : { reasonKey: date.reasonKey }),
      ...(date.surcharge === undefined
        ? {}
        : {
            surcharge: {
              amountMinor: Number(date.surcharge.amountMinor),
              currency: date.surcharge.currency,
            },
          }),
      occasionKeys: [...date.occasionKeys],
    })),
    noticeKey: window.noticeKey,
  };
}

/* -------------------------------------------------------------------------- */
/* The view.                                                                  */
/* -------------------------------------------------------------------------- */

export interface ProductViewOptions {
  /**
   * **Required.** Whether this request's URL carries `?tier=`, `?date=` or any other parameter
   * (§5.2 `ProductSearchParamsSchema`, AC-15). A parameterised URL is `noindex,follow` with a
   * canonical to the bare URL. It is required rather than optional for the reason
   * `ProductIndexabilityTerms` gives: an omitted term leaves spec 007's conjunction, so a route
   * that forgot to pass it would announce `index,follow` on a duplicate (TASK-114 / PR 93).
   */
  readonly parameterised: boolean;
  /**
   * The visitor's choice, **already parsed** by `ProductSearchParamsSchema` (TASK-128). Validated
   * again against the data and never trusted: an unknown tier falls back to the default tier, and
   * a date that is not selectable falls back to the earliest selectable one — never a 404, never
   * an error (§5.2).
   */
  readonly selection?: { readonly tierKey?: string; readonly date?: string };
  /** The page's one clock — the grid, the cutoff and every FX conversion read it. */
  readonly now?: Date;
  /** Spec 009's `product` link id: related cards are tiles until it is published (008 §13 Q8). */
  readonly productLinks?: boolean;
  readonly deployment?: DeploymentDescriptor;
}

/**
 * **The** product view model (§5.2): the single input to the PDP, its JSON-LD builders and its
 * sitemap row (T-32).
 *
 * `undefined` means "no such page" — `productPageExists()` says no — and the route turns that into
 * `notFound()`, never a redirect and never a substitute page (AC-1).
 */
export async function productView(
  identity: unknown,
  options: ProductViewOptions,
): Promise<ProductView | undefined> {
  const parsed = ProductPageIdentitySchema.safeParse(identity);
  if (!parsed.success) return undefined;
  const { locale: code, countryIso, sku } = parsed.data;
  const memo = newMemo();
  if (!(await pageExists(sku, countryIso, code, memo))) return undefined;
  // `pageExists()` narrowed both; TypeScript needs to hear it once more.
  if (!isLocaleCode(code) || !isCountryIso2(countryIso)) return undefined;
  const locale: LocaleCode = code;
  const iso2: CountryIso2 = countryIso;

  const product = await productIn(memo, sku);
  const record = recordFor(sku, iso2, locale);
  if (product === null || record === undefined) return undefined;

  const now = options.now ?? new Date();
  const query: ProductPriceQuery = { productId: sku, countryIso: iso2, now };
  const copy = copyRow("product", sku, locale);
  const name = copy?.name ?? product.name;

  // The grid is the calendar's; the money is ours. The calendar is asked once for its dates, the
  // grid is priced, and the calendar is asked again with the fees injected — the same pure call
  // with one more input, which is how `deliveryWindow()` takes money (its header).
  const tiers = await listTiers(sku);
  const bare = deliveryWindow({ countryIso: iso2, from: now });
  const grid = await priceGrid(
    locale,
    query,
    tiers,
    bare.dates.map((date) => date.date),
  );

  const requestedTier = options.selection?.tierKey;
  const defaultTierKey = tiers.find((tier) => tier.isDefault)?.tierKey;
  const selectedTierKey =
    requestedTier !== undefined &&
    tiers.some((tier) => tier.tierKey === requestedTier)
      ? requestedTier
      : defaultTierKey;
  if (selectedTierKey === undefined) {
    throw new Error(`\`${sku}\` has no default tier (spec 005 §13 Q6)`);
  }

  const window = deliveryWindow({
    countryIso: iso2,
    from: now,
    surcharges: chipFees(grid, selectedTierKey),
  });
  if (
    JSON.stringify(window.dates.map((date) => date.date)) !==
    JSON.stringify(bare.dates.map((date) => date.date))
  ) {
    throw new Error(
      "the delivery grid moved between two reads of one clock: the fees were priced against different dates",
    );
  }

  const selectable = window.dates
    .filter((date) => date.selectable)
    .map((date) => date.date);
  const requestedDate = options.selection?.date;
  const selectedDate =
    requestedDate !== undefined && selectable.includes(requestedDate)
      ? requestedDate
      : selectable[0];

  const price = await tierProjection(
    locale,
    query,
    selectedTierKey,
    selectedDate,
  );
  const fxState = fxStateOf(price);

  const state = corridorState(iso2, locale);
  const operations = countryConfig(iso2).operations;
  const factsKnown = state === "live" && operations !== undefined;
  const citiesKey = countryConfig(iso2).citiesKey;

  const verdict = productPageIndexability(
    locale,
    {
      exists: true,
      countryLive: state === "live",
      productIndexable: await isProductIndexable(sku, locale, iso2),
      unparameterised: !options.parameterised,
    },
    options.deployment ?? deploymentDescriptor(process.env),
  );

  const view: ProductView = {
    locale,
    path: record.path,
    country: {
      iso2,
      slug: record.countrySlug,
      nameKey: countryConfig(iso2).nameKey,
      ...(isGuidePublished(iso2)
        ? {
            corridorPath: localePath(
              locale,
              "destinations",
              record.countrySlug,
            ),
          }
        : {}),
      state,
    },
    product: {
      sku,
      name,
      slug: record.slug,
      vaseIncluded: product.vaseIncluded,
    },
    h1: {
      key: H1_KEY,
      name,
      ...(FORM_KEYS[product.productType] === undefined
        ? {}
        : { formKey: FORM_KEYS[product.productType] }),
      flowerKey: `catalog.descriptor.flower.${product.primaryFlower}`,
    },
    ...(copy === undefined || copy.descriptionMd.trim() === ""
      ? {}
      : { description: { text: copy.descriptionMd, reviewed: copy.reviewed } }),
    gallery: galleryFor(sku, locale),
    tiers: tiers.map((tier) => {
      const undated = grid.base.get(tier.tierKey);
      if (undated === undefined)
        throw new Error(`\`${tier.tierKey}\` unpriced`);
      return tierOptionOf(tier, undated);
    }),
    selectedTierKey,
    ...(selectedDate === undefined ? {} : { selectedDate }),
    price,
    fx: {
      state: fxState,
      ...(fxState === "fallback" ? { noticeKey: FX_UNAVAILABLE_KEY } : {}),
    },
    addons: await addonLines(locale, iso2),
    delivery: deliveryOf(window),
    facts: {
      known: factsKnown,
      ...(factsKnown ? { operations } : {}),
      ...(factsKnown && citiesKey !== undefined ? { citiesKey } : {}),
    },
    totals: totalsOf(grid, window),
    breadcrumb: await breadcrumbFor(
      locale,
      record.countrySlug,
      product,
      name,
      record.path,
      now,
    ),
    related: await relatedFor(sku, iso2, locale, options.productLinks ?? false),
    trust: [
      "substitution",
      "freshnessGuarantee",
      ...(window.state === "live" ? (["localFlorist"] as const) : []),
    ],
    indexability: {
      indexable: verdict.indexable,
      directive: verdict.directive,
    },
  };

  return ProductViewSchema.parse(view);
}
