/**
 * The listing view model and the existence set (spec 008 §2, §5.2 `catalog/listing.ts`, §6, §11,
 * **AC-3** and **AC-14**, T-03 / T-14 / T-31; §12 task 3; TASK-107).
 *
 * Three things live here and nothing else does.
 *
 * **1. The existence set.** Spec 008 §2's six rules, as data: `listingExists()` answers for one
 * page and `listingPages()` enumerates every page that exists, so `generateStaticParams`
 * (TASK-109…112), the sitemap builders (TASK-116), the link renderers and the e2e crawl get the
 * *same* answer about the same URL. The rule is **structural, not a runtime branch** (§2): a page
 * that fails it has no URL at all and 404s, rather than rendering a thin `noindex` page for a
 * crawler to find. `PRODUCT_COUNT_FLOOR` is the one named constant §13 Q7 rules on (6, applied to
 * *existence*); the shop root's "≥1 product deliverable there" is a non-empty list rather than a
 * second threshold, because a second number is a second thing to get wrong.
 *
 * Spec 008 §14 **A1** is the one clause a reader trips on: an **evergreen** occasion (birthday,
 * sympathy, wedding …) has no `occasion_country` row by design, so its hub exists when the
 * occasion has ≥1 product in ≥1 published country. A **seasonal** occasion keeps the row-based
 * rule ("observed in ≥1 published country"). Both clauses are read by the hub's rule below, which
 * is why the fourteen evergreen hubs exist without a synthetic observance row being fabricated.
 *
 * **2. The view model.** `listingView()` is the **single** input to the page, the JSON-LD builders
 * and the sitemap row (§5.2, spec 007's `corridorView()` precedent): structured data is incapable
 * of describing something the page does not render, because there is only one projection and
 * T-31 pins that no second one appears. It carries no user-facing literal — headings are message
 * keys with values, crumbs are message keys (spec 007's `CorridorCrumb` shape), and the only
 * strings in it are **authored copy** (the founder's names and hub intros), which is content and
 * not chrome (`plan/02` §12).
 *
 * **3. The six `PageDescriptor` registrations.** `listingDescriptor()` gathers the terms of spec
 * 008 §6 and hands them to spec 007's `pageIndexability()`. **No `noindex` branch is written
 * here** (AC-14): the directive, the sitemap membership and the rendered meta all come from that
 * one engine, and the six page types are registered in `PAGE_TYPE_POLICY` rather than branched on
 * at a call site.
 *
 * ## Money, order and honesty
 *
 * - Every price comes from `priceProjection()` / `fromPriceProjection()`: the card shows the
 *   **default tier's** all-in `displayPrice` (a payable configuration, so "price shown = price
 *   charged" holds without a qualifier), and the one "from" price in the model is the category
 *   tile's (§2, §8).
 * - A **destination-less hub carries no money at all** (§2, §8, 005 §13 Q10). That is enforced by
 *   the type: hub items are `HubCardView`, which is `ProductCardView` without `price` and
 *   `priceLabelKey`, so a projection cannot hand a renderer a price the page may not show.
 * - The **default order** is spec 005's deterministic `topProductsForPrebuild()` ordering — the
 *   locale's collation of the product name, tie-broken by SKU — which spec 008 §14 (design round,
 *   Q1) keeps as the shipped order "until the curation index is authored by the founder in task 2
 *   alongside the slugs" (TASK-106). It is labelled for what it is and never called a
 *   bestseller list (§8, §13 Q3).
 * - Nothing here can express a rating, a badge, a delivery-timing claim or an add-to-basket:
 *   `ProductCardViewSchema` has no field for one (TASK-108), and this module adds none.
 *
 * ## Shape of the reads
 *
 * Spec 008 §5.2 calls `listingExists()` "pure and synchronous over the providers". It is pure —
 * same data in, same answer out, no clock, no environment, no I/O — but spec 005's read API is
 * `async` (`countProductsIn`, `listProducts`, `priceProjection` all return promises, because
 * TASK-070 swaps the static provider for Postgres behind them), so every function here is `async`
 * too. Making it synchronous would mean re-reading the dataset outside the provider seam, which
 * is the one thing spec 005 §5.2 forbids. `pnpm check:no-db` covers this file.
 */
import { appendFileSync } from "node:fs";

import { z } from "zod";

import {
  type CountryIso2,
  COUNTRY_CODES,
  countryConfig,
  isCountryIso2,
  isGuidePublished,
} from "@/config/countries";
import { type LocaleCode, LOCALES, isLocaleCode } from "@/config/locales";
import {
  type CorridorState,
  committedOccasionCalendar,
  corridorIso2ForSlug,
  corridorSlug,
  corridorState,
  upcomingOccasions,
} from "@/modules/geo";
import {
  type ListingTarget,
  listingPath,
  localePath,
  productPath,
  sortBy,
} from "@/modules/i18n";
import {
  type DeploymentDescriptor,
  type IndexabilityVerdict,
  type PageDescriptor,
  deploymentDescriptor,
  pageIndexability,
} from "@/modules/seo";
import {
  type CategoryTileView,
  type ChipLinkView,
  type ProductCardView,
  CategoryTileViewSchema,
  ChipLinkViewSchema,
  ProductCardViewSchema,
  altFor,
  assetsForProduct,
  isDisplayable,
} from "@/modules/ui";

import { copyRow, copyRows } from "./copy";
import { fromPriceProjection, priceProjection } from "./pricing/project";
import {
  countProductsFor,
  countProductsIn,
  defaultTier,
  getCategory,
  getOccasion,
  listProducts,
  topProductsForPrebuild,
} from "./read";
import {
  IsoDateSchema,
  ListingParamsSchema,
  ListingPageTypeSchema,
} from "./schemas";
import { slugFor } from "./slugs";
import type {
  Category,
  IsoDate,
  ListingPageType,
  ListingSort,
  Occasion,
  Product,
} from "./types";

/* -------------------------------------------------------------------------- */
/* The two numbers (spec 008 §2, §13 Q7; §5.4 "page size 12").                */
/* -------------------------------------------------------------------------- */

/**
 * The product-count floor of `plan/02` §4.1, applied to **existence** (spec 008 §13 Q7, resolved).
 *
 * One named constant, read by one predicate, so raising it is a data flip and a category with
 * five products has no URL to be thin at. The shop root's floor is not a second constant: §2 asks
 * it for "≥1 product deliverable there", which is a non-empty list.
 */
export const PRODUCT_COUNT_FLOOR = 6;

/** Products per page (§2 "Pagination", §5.4 — 12 keeps the image budget inside spec 006's). */
export const LISTING_PAGE_SIZE = 12;

/** The card's photo box (§2 "The product card contract": the named `grid` slot at 4∶5). */
const CARD_MEDIA_SLOT = "grid" as const;

/** The one wording beside an all-in price (005 §7; `ProductCardViewSchema` admits no other). */
const PRICE_LABEL_KEY = "catalog.price.inclusive" as const;

/* -------------------------------------------------------------------------- */
/* The view model (spec 008 §5.2 `ListingViewSchema`).                        */
/* -------------------------------------------------------------------------- */

/**
 * A hub's product card: a `ProductCardView` with the money removed.
 *
 * §2 and §8 forbid any money on a destination-less hub ("a cross-country minimum converted at
 * today's rate is a price no configuration matches"), and TASK-108 made `price` and
 * `priceLabelKey` required on `ProductCardView` because every *country-scoped* card must carry
 * one. Omitting them here is how "hubs show no money" becomes a fact about the type rather than a
 * rule a renderer is asked to remember. Recorded as an escalation in `docs/tasks/TASK-107.md`:
 * reversing it costs this one schema.
 */
export const HubCardViewSchema = ProductCardViewSchema.omit({
  price: true,
  priceLabelKey: true,
});
export type HubCardView = z.infer<typeof HubCardViewSchema>;

/** One crumb, in spec 007's `CorridorCrumb` shape: a message key, never a literal (§7). */
export const ListingCrumbSchema = z
  .object({
    labelKey: z.string().min(1),
    /** Authored copy substituted into the label (a category name), where the label takes one. */
    labelValue: z.string().min(1).optional(),
    href: z.string().min(1).optional(),
    current: z.boolean(),
  })
  .strict();
export type ListingCrumb = z.infer<typeof ListingCrumbSchema>;

/**
 * The page's `<h1>`, as a message key and the values it takes.
 *
 * `countryNameKey` is a message key (`countries.ts`'s `nameKey`) and `entityName` is **authored
 * copy** (the founder's category or occasion name in this locale). The page resolves both through
 * `t()`; this module composes no sentence, which is what keeps the literal ban of `CLAUDE.md`
 * true on the six busiest templates in the site.
 */
export const ListingHeadingSchema = z
  .object({
    key: z.string().min(1),
    countryNameKey: z.string().min(1).optional(),
    entityName: z.string().min(1).optional(),
  })
  .strict();
export type ListingHeading = z.infer<typeof ListingHeadingSchema>;

/** The destination a country-scoped listing is for. */
export const ListingCountrySchema = z
  .object({
    iso2: z.string().length(2),
    slug: z.string().min(1),
    nameKey: z.string().min(1),
    /** The corridor guide, where one is published — plain text where it is not (§13 Q1). */
    corridorPath: z.string().min(1).optional(),
    state: z.string().min(1),
  })
  .strict();

/** The catalogue entity a listing is about, absent on a shop root and on the occasions index. */
export const ListingEntitySchema = z
  .object({
    kind: z.enum(["category", "occasion"]),
    key: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    /** The authored intro; a hub has one by its existence rule, a country page may not. */
    intro: z.string().min(1).optional(),
    reviewed: z.boolean(),
  })
  .strict();

/** One occasion's date in one destination. `null` is the honest blank of §14 Q6, never a guess. */
export const ListingOccasionDateSchema = z
  .object({
    iso2: z.string().length(2),
    nameKey: z.string().min(1),
    date: z.string().min(1).nullable(),
  })
  .strict();
export type ListingOccasionDate = z.infer<typeof ListingOccasionDateSchema>;

/** One entry of the occasions index: a hub, its group and its next date (§14 Q4: in Poland). */
export const ListingOccasionEntrySchema = z
  .object({
    key: z.string().min(1),
    name: z.string().min(1),
    href: z.string().min(1),
    kind: z.enum(["evergreen", "seasonal"]),
    nextDate: z.string().min(1).nullable(),
  })
  .strict();
export type ListingOccasionEntry = z.infer<typeof ListingOccasionEntrySchema>;

/**
 * One destination in a hub's picker (§2 "Links", §5.3).
 *
 * The visible label is the country's **`nameKey`** — a message the page resolves, exactly as the
 * breadcrumb and the `h1` carry one — and never `corridorSlug()`, which is a *URL* spelling and
 * would print "rumaenien" where a reader expects Rumänien (`/review 76`). The destination is
 * named by its ISO code rather than by a catalogue key, because that is what it is.
 */
export const ListingDestinationLinkSchema = z
  .object({
    iso2: z.string().length(2),
    nameKey: z.string().min(1),
    href: z.string().min(1),
  })
  .strict();
export type ListingDestinationLink = z.infer<
  typeof ListingDestinationLinkSchema
>;

/**
 * The links §2 "Links" requires the page to render, all of them to pages that **exist**: a link
 * to a non-200 URL is the thing spec 004 AC-14 and spec 007 AC-17 forbid, so an absent field is
 * an absent link and never a placeholder.
 */
export const ListingLinksSchema = z
  .object({
    self: z.string().min(1),
    shopRoot: z.string().min(1).optional(),
    corridor: z.string().min(1).optional(),
    occasionsIndex: z.string().min(1).optional(),
    /** Sibling categories or occasions, as the chip row renders them. */
    chips: z.array(ChipLinkViewSchema).readonly(),
    /** A hub's destination picker: the country pages of this entity that exist. */
    destinations: z.array(ListingDestinationLinkSchema).readonly(),
  })
  .strict();
export type ListingLinks = z.infer<typeof ListingLinksSchema>;

/**
 * **The** listing view model (§5.2). One shape for six page types, because one template renders
 * all six and a second shape would be a second thing for the JSON-LD and the sitemap to disagree
 * with.
 */
export const ListingViewSchema = z
  .object({
    pageType: ListingPageTypeSchema,
    locale: z.string().min(2),
    path: z.string().min(1),
    country: ListingCountrySchema.optional(),
    entity: ListingEntitySchema.optional(),
    h1: ListingHeadingSchema,
    intro: z.string().min(1).optional(),
    breadcrumb: z.array(ListingCrumbSchema).readonly(),
    /** Country-scoped cards carry a price; hub cards carry none (§2, §8). */
    items: z.array(ProductCardViewSchema).readonly(),
    hubItems: z.array(HubCardViewSchema).readonly(),
    tiles: z.array(CategoryTileViewSchema).readonly(),
    occasionDates: z.array(ListingOccasionDateSchema).readonly().optional(),
    occasions: z.array(ListingOccasionEntrySchema).readonly().optional(),
    /**
     * How many products the listing has in total — §5.2 names it `total`, and `fo/no-float-money`
     * refuses a `number` under that name (it reads as money). `resultCount` is the same number
     * with a name that says it counts rather than adds up.
     */
    resultCount: z.int().nonnegative(),
    page: z.int().min(1),
    pageCount: z.int().nonnegative(),
    sort: z.enum(["default", "price-asc", "price-desc"]),
    links: ListingLinksSchema,
    indexable: z.boolean(),
    directive: z.string().min(1),
  })
  .strict()
  // Spec 008 §14 **A3**: the two arrays are the two kinds of listing, and a view is one of them.
  // A page with both would be one that shows money and claims not to, so the schema refuses it
  // rather than leaving TASK-112 and TASK-115 to remember which array to read.
  .refine((view) => view.items.length === 0 || view.hubItems.length === 0, {
    message:
      "a listing carries priced `items` (country-scoped) or priceless `hubItems` (a hub), never both (spec 008 §14 A3)",
    path: ["hubItems"],
  });
export type ListingView = z.infer<typeof ListingViewSchema>;

/* -------------------------------------------------------------------------- */
/* Identity: one page, named by keys rather than by slugs.                    */
/* -------------------------------------------------------------------------- */

/**
 * One listing page, named the way the existence rules think about it: page type, locale, the
 * destination's ISO code and the catalogue key. `ListingParams` (TASK-105) is the same page named
 * the way a *URL* spells it; `listingView()` takes those and resolves them to this.
 */
export interface ListingIdentity {
  readonly pageType: ListingPageType;
  readonly locale: LocaleCode;
  readonly countryIso?: CountryIso2;
  readonly entityKey?: string;
}

/** One page of the existence set, with everything `generateStaticParams` and a sitemap row need. */
export interface ListingPageRecord extends ListingIdentity {
  readonly countrySlug?: string;
  readonly slug?: string;
  readonly path: string;
}

export const ListingIdentitySchema = z
  .object({
    pageType: ListingPageTypeSchema,
    locale: z.string().min(2),
    countryIso: z.string().length(2).optional(),
    entityKey: z.string().min(2).optional(),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* The data the rules read.                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A **published** destination (§2's table): the registry says `live`, or the founder has
 * published its guide. `status: 'disabled'` and an unpublished demo country contribute nothing —
 * no shop root, no category, no occasion, and no product towards any hub's existence.
 */
export function isPublishedCountry(iso2: string): boolean {
  if (!isCountryIso2(iso2)) return false;
  return countryConfig(iso2).status === "live" || isGuidePublished(iso2);
}

/** Every published destination, in registry order (Poland first). */
export function publishedCountries(): readonly CountryIso2[] {
  return COUNTRY_CODES.filter(
    (iso2): iso2 is CountryIso2 =>
      isCountryIso2(iso2) && isPublishedCountry(iso2),
  );
}

/**
 * The locales a listing URL may be built in: the launch locales of §2's table, plus the
 * pseudo-locales *exactly where the deployment routes them at all*, because spec 008 AC-26 asks
 * for `/ar-XB` baselines of the shop root and a page with no URL cannot be photographed. A
 * pseudo-locale is never indexable (`isLocaleIndexable()` is false) and the production env schema
 * refuses the flag that routes it, so this widens the *test* surface and nothing else.
 */
export function listingLocales(): readonly LocaleCode[] {
  return LOCALES.filter((locale) => locale.isLaunch || locale.isPseudo)
    .map((locale) => locale.code)
    .filter((code): code is LocaleCode => isLocaleCode(code));
}

/** Whether a destination keeps a seasonal occasion at all (`occasion_country.observed`). */
function isObservedIn(occasionKey: string, iso2: CountryIso2): boolean {
  return committedOccasionCalendar.some(
    (row) =>
      row.occasionKey === occasionKey &&
      row.countryIso2 === iso2 &&
      row.observed,
  );
}

/**
 * A per-call memo over the counting reads. `listingPages()` asks the same
 * (category, destination) question once per locale; the answer cannot change inside one call, and
 * the dataset is 84 products against 23 categories and 7 destinations.
 */
interface CountMemo {
  readonly inCategory: Map<string, Promise<number>>;
  readonly forOccasion: Map<string, Promise<number>>;
}

function newMemo(): CountMemo {
  return { inCategory: new Map(), forOccasion: new Map() };
}

function countIn(
  memo: CountMemo,
  categoryKey: string,
  iso2: CountryIso2,
): Promise<number> {
  const key = `${categoryKey}:${iso2}`;
  const cached = memo.inCategory.get(key);
  if (cached !== undefined) return cached;
  const pending = countProductsIn(categoryKey, iso2);
  memo.inCategory.set(key, pending);
  return pending;
}

function countFor(
  memo: CountMemo,
  occasionKey: string,
  iso2: CountryIso2,
): Promise<number> {
  const key = `${occasionKey}:${iso2}`;
  const cached = memo.forOccasion.get(key);
  if (cached !== undefined) return cached;
  const pending = countProductsFor(occasionKey, iso2);
  memo.forOccasion.set(key, pending);
  return pending;
}

/* -------------------------------------------------------------------------- */
/* The existence rules (spec 008 §2, §14 A1).                                 */
/* -------------------------------------------------------------------------- */

/** §2 row 6: published destination, ≥1 deliverable product, and a locale we route. */
async function shopRootExists(
  iso2: CountryIso2,
  locale: LocaleCode,
): Promise<boolean> {
  if (!isPublishedCountry(iso2)) return false;
  if (!listingLocales().includes(locale)) return false;
  const products = await listProducts({ countryIso: iso2 });
  return products.length > 0;
}

/** §2 row 7: the shop root, the floor, and an authored slug in this locale. */
async function countryCategoryExists(
  categoryKey: string,
  iso2: CountryIso2,
  locale: LocaleCode,
  memo: CountMemo,
): Promise<boolean> {
  if (!(await shopRootExists(iso2, locale))) return false;
  if (!hasAuthoredSlug("category", categoryKey, locale)) return false;
  if ((await getCategory(categoryKey)) === null) return false;
  return (await countIn(memo, categoryKey, iso2)) >= PRODUCT_COUNT_FLOOR;
}

/** §2 row 8: the shop root, `observed` for that (occasion, country), the floor, and a slug. */
async function countryOccasionExists(
  occasionKey: string,
  iso2: CountryIso2,
  locale: LocaleCode,
  memo: CountMemo,
): Promise<boolean> {
  if (!(await shopRootExists(iso2, locale))) return false;
  if (!hasAuthoredSlug("occasion", occasionKey, locale)) return false;
  if ((await getOccasion(occasionKey)) === null) return false;
  if (!isObservedIn(occasionKey, iso2)) return false;
  return (await countFor(memo, occasionKey, iso2)) >= PRODUCT_COUNT_FLOOR;
}

/** Whether a locale has an authored slug for an entity — spec 008 §2's "and an authored slug". */
function hasAuthoredSlug(
  kind: "category" | "occasion",
  key: string,
  locale: LocaleCode,
): boolean {
  return slugFor(kind, key, locale) !== undefined;
}

/** The authored intro of §2's hub rules, or `undefined` when this locale has authored none. */
function authoredIntro(
  kind: "category" | "occasion",
  key: string,
  locale: LocaleCode,
): string | undefined {
  const row = copyRow(kind, key, locale);
  if (row === undefined) return undefined;
  const intro = row.descriptionMd.trim();
  return intro.length === 0 ? undefined : intro;
}

/** §2 row 10: ≥1 product in ≥1 published country, an authored slug and an authored intro. */
async function categoryHubExists(
  categoryKey: string,
  locale: LocaleCode,
  memo: CountMemo,
): Promise<boolean> {
  if (!hasAuthoredSlug("category", categoryKey, locale)) return false;
  if (authoredIntro("category", categoryKey, locale) === undefined)
    return false;
  if ((await getCategory(categoryKey)) === null) return false;
  return hasProductInAnyPublishedCountry(categoryKey, "category", memo);
}

/**
 * §2 row 13 **with §14 A1**: a seasonal occasion's hub exists when it is observed in ≥1 published
 * country; an **evergreen** occasion has no `occasion_country` row by design, so its hub exists
 * when it has ≥1 product in ≥1 published country. Both clauses are read here, which is the
 * clause's whole purpose — without it the fourteen evergreen hubs would never exist.
 */
async function occasionHubExists(
  occasionKey: string,
  locale: LocaleCode,
  memo: CountMemo,
): Promise<boolean> {
  if (!hasAuthoredSlug("occasion", occasionKey, locale)) return false;
  if (authoredIntro("occasion", occasionKey, locale) === undefined)
    return false;
  const occasion = await getOccasion(occasionKey);
  if (occasion === null) return false;
  if (occasion.kind === "seasonal") {
    return publishedCountries().some((iso2) => isObservedIn(occasionKey, iso2));
  }
  return hasProductInAnyPublishedCountry(occasionKey, "occasion", memo);
}

/** "≥1 product in ≥1 published country", the shared half of both hub rules (§2, §14 A1). */
async function hasProductInAnyPublishedCountry(
  key: string,
  kind: "category" | "occasion",
  memo: CountMemo,
): Promise<boolean> {
  for (const iso2 of publishedCountries()) {
    const count =
      kind === "category"
        ? await countIn(memo, key, iso2)
        : await countFor(memo, key, iso2);
    if (count > 0) return true;
  }
  return false;
}

/** §2 row 14: the occasions index exists once ≥1 occasion hub exists in that locale. */
async function occasionsIndexExists(
  locale: LocaleCode,
  memo: CountMemo,
): Promise<boolean> {
  for (const row of copyRows("occasion", locale)) {
    if (await occasionHubExists(row.key, locale, memo)) return true;
  }
  return false;
}

/**
 * Does this page exist? The one predicate `generateStaticParams`, the sitemap builder, the link
 * renderers and the 404 matrix read (§5.2). Parsed at the boundary, because a route hands it
 * strings.
 */
export async function listingExists(identity: unknown): Promise<boolean> {
  const parsed = ListingIdentitySchema.parse(identity);
  if (!isLocaleCode(parsed.locale)) return false;
  const locale = parsed.locale;
  const iso2 =
    parsed.countryIso !== undefined && isCountryIso2(parsed.countryIso)
      ? parsed.countryIso
      : undefined;
  const key = parsed.entityKey;
  const memo = newMemo();

  switch (parsed.pageType) {
    case "countryShopRoot":
      return iso2 === undefined ? false : shopRootExists(iso2, locale);
    case "countryCategory":
      return iso2 === undefined || key === undefined
        ? false
        : countryCategoryExists(key, iso2, locale, memo);
    case "countryOccasion":
      return iso2 === undefined || key === undefined
        ? false
        : countryOccasionExists(key, iso2, locale, memo);
    case "categoryHub":
      return key === undefined ? false : categoryHubExists(key, locale, memo);
    case "occasionHub":
      return key === undefined ? false : occasionHubExists(key, locale, memo);
    case "occasionsIndex":
      return listingLocales().includes(locale)
        ? occasionsIndexExists(locale, memo)
        : false;
  }
}

/** The path of one page of the existence set, built only by `listingPath()` (§2). */
function pathOf(
  locale: LocaleCode,
  pageType: ListingPageType,
  countrySlug?: string,
  slug?: string,
): string {
  const target = ((): ListingTarget => {
    switch (pageType) {
      case "countryShopRoot":
        return { pageType, country: countrySlug ?? "" };
      case "countryCategory":
      case "countryOccasion":
        return { pageType, country: countrySlug ?? "", slug: slug ?? "" };
      case "categoryHub":
      case "occasionHub":
        return { pageType, slug: slug ?? "" };
      case "occasionsIndex":
        return { pageType };
    }
  })();
  return listingPath(locale, target);
}

/**
 * **The existence set**: every listing URL that exists, for one locale or for all of them
 * (AC-3). `generateStaticParams` emits exactly this and sets `dynamicParams = false`, so every
 * other slug, segment, casing variant and below-floor category is a hard 404 by construction.
 */
export async function listingPages(
  locale?: LocaleCode,
): Promise<readonly ListingPageRecord[]> {
  const locales = locale === undefined ? listingLocales() : [locale];
  const memo = newMemo();
  const pages: ListingPageRecord[] = [];

  for (const code of locales) {
    const categories = copyRows("category", code);
    const occasions = copyRows("occasion", code);

    for (const iso2 of publishedCountries()) {
      if (!(await shopRootExists(iso2, code))) continue;
      const country = corridorSlug(iso2, code);
      pages.push({
        pageType: "countryShopRoot",
        locale: code,
        countryIso: iso2,
        countrySlug: country,
        path: pathOf(code, "countryShopRoot", country),
      });

      for (const row of categories) {
        if (!(await countryCategoryExists(row.key, iso2, code, memo))) continue;
        const slug = slugFor("category", row.key, code);
        if (slug === undefined) continue;
        pages.push({
          pageType: "countryCategory",
          locale: code,
          countryIso: iso2,
          entityKey: row.key,
          countrySlug: country,
          slug,
          path: pathOf(code, "countryCategory", country, slug),
        });
      }

      for (const row of occasions) {
        if (!(await countryOccasionExists(row.key, iso2, code, memo))) continue;
        const slug = slugFor("occasion", row.key, code);
        if (slug === undefined) continue;
        pages.push({
          pageType: "countryOccasion",
          locale: code,
          countryIso: iso2,
          entityKey: row.key,
          countrySlug: country,
          slug,
          path: pathOf(code, "countryOccasion", country, slug),
        });
      }
    }

    for (const row of categories) {
      if (!(await categoryHubExists(row.key, code, memo))) continue;
      const slug = slugFor("category", row.key, code);
      if (slug === undefined) continue;
      pages.push({
        pageType: "categoryHub",
        locale: code,
        entityKey: row.key,
        slug,
        path: pathOf(code, "categoryHub", undefined, slug),
      });
    }

    for (const row of occasions) {
      if (!(await occasionHubExists(row.key, code, memo))) continue;
      const slug = slugFor("occasion", row.key, code);
      if (slug === undefined) continue;
      pages.push({
        pageType: "occasionHub",
        locale: code,
        entityKey: row.key,
        slug,
        path: pathOf(code, "occasionHub", undefined, slug),
      });
    }

    if (
      listingLocales().includes(code) &&
      (await occasionsIndexExists(code, memo))
    ) {
      pages.push({
        pageType: "occasionsIndex",
        locale: code,
        path: pathOf(code, "occasionsIndex"),
      });
    }
  }

  return pages;
}

/* -------------------------------------------------------------------------- */
/* Indexability: six descriptors, one engine (spec 008 §6, AC-14).            */
/* -------------------------------------------------------------------------- */

/** The terms spec 008 §6 names, gathered by the page's owner and answered by spec 007. */
export interface ListingIndexabilityTerms {
  readonly exists: boolean;
  /** The authored copy this page renders is signed off (`plan/02` §12). */
  readonly reviewed: boolean;
  /** `corridorState(iso2) === 'live'` — the three country-scoped types only. */
  readonly operational?: boolean;
}

/**
 * The `PageDescriptor` for one listing page. **This is the whole of spec 008's indexability
 * code**: it gathers §6's terms and hands them to spec 007's engine, which owns the directive,
 * the sitemap membership and the rendered meta. There is no `noindex` literal in this module
 * (AC-14).
 */
export function listingDescriptor(
  identity: ListingIdentity,
  terms: ListingIndexabilityTerms,
): PageDescriptor {
  return {
    pageType: identity.pageType,
    locale: identity.locale,
    exists: terms.exists,
    reviewed: terms.reviewed,
    ...(terms.operational === undefined
      ? {}
      : { operational: terms.operational }),
  };
}

/** Whether this page type carries §6's operational gate. Hubs and the index do not. */
function isCountryScoped(pageType: ListingPageType): boolean {
  return (
    pageType === "countryShopRoot" ||
    pageType === "countryCategory" ||
    pageType === "countryOccasion"
  );
}

/**
 * The verdict for one listing page: gather §6's terms, then ask spec 007. In Phase 0 every one of
 * the six answers `noindex,follow`, because no destination is operational and
 * `isIndexingEnvironment()` is false — an answer produced by data, not by a branch (AC-13).
 */
export function listingIndexability(
  identity: ListingIdentity,
  terms: ListingIndexabilityTerms,
  deployment: DeploymentDescriptor,
): IndexabilityVerdict {
  return pageIndexability(listingDescriptor(identity, terms), deployment);
}

/* -------------------------------------------------------------------------- */
/* Projections: the card, the tile, the chip.                                 */
/* -------------------------------------------------------------------------- */

/** What a card needs about the photograph it will show (spec 006 §2.5's manifest, never a guess). */
function photoFor(
  sku: string,
  locale: LocaleCode,
): {
  photo: ProductCardView["photo"];
  provenance: ProductCardView["provenance"];
} {
  const assets = assetsForProduct(sku);
  const provenance = ((): ProductCardView["provenance"] => {
    const source = assets[0]?.source;
    return source === "photo" || source === "partner" ? source : "ai";
  })();
  for (const asset of assets) {
    const alt = altFor(asset.id, locale);
    if (alt === undefined || !isDisplayable(asset.id, locale)) continue;
    return {
      photo: { kind: "asset", assetId: asset.id, alt, slot: CARD_MEDIA_SLOT },
      provenance,
    };
  }
  // No approved asset with alt text in this locale: spec 006 AC-18's placeholder, never an
  // `<img>` with borrowed alt text and never a broken image.
  return { photo: { kind: "placeholder", slot: CARD_MEDIA_SLOT }, provenance };
}

/**
 * One product card for a country-scoped listing (§2 "The product card contract"): the photo or
 * the placeholder, the name in this locale, and **one** all-in price — the default tier's
 * `priceProjection().displayPrice`, a payable configuration, with the `catalog.price.inclusive`
 * wording beside it.
 *
 * `href` is present only when spec 009's `product` link id is published (§13 Q8, AC-12). It is
 * not in `site-links.ts` yet, so the caller passes `productLinks: false` — its default — and
 * every card renders as a tile with no `<a>`. The flip is then a data change with no markup
 * change, because nothing else in the shape moves.
 */
export async function productCardView(
  product: Product,
  locale: LocaleCode,
  iso2: CountryIso2,
  options: { readonly productLinks?: boolean } = {},
): Promise<ProductCardView> {
  const tier = await defaultTier(product.sku);
  const projection = await priceProjection(locale, {
    productId: product.sku,
    tierKey: tier.tierKey,
    countryIso: iso2,
  });
  const { photo, provenance } = photoFor(product.sku, locale);
  const slug = slugFor("product", product.sku, locale);
  const href =
    options.productLinks === true && slug !== undefined
      ? productPath(locale, corridorSlug(iso2, locale), slug)
      : undefined;

  return ProductCardViewSchema.parse({
    productId: product.sku,
    name: copyRow("product", product.sku, locale)?.name ?? product.name,
    ...(href === undefined ? {} : { href }),
    photo,
    price: projection.displayPrice,
    priceLabelKey: PRICE_LABEL_KEY,
    provenance,
  });
}

/** The same card with the money removed — a destination-less hub shows none (§2, §8). */
export async function hubCardView(
  product: Product,
  locale: LocaleCode,
): Promise<HubCardView> {
  const { photo, provenance } = photoFor(product.sku, locale);
  return HubCardViewSchema.parse({
    productId: product.sku,
    name: copyRow("product", product.sku, locale)?.name ?? product.name,
    photo,
    provenance,
  });
}

/**
 * One category tile on a country shop root (§2): the count of products in it for this
 * destination, and the **one** "from" price the spec allows — the lowest payable price inside the
 * tile, which is labelled as a floor by the component.
 *
 * **The money is one projection's, never two halves of two** (`/review 76`). The amount and the
 * currency both come from `fromPriceProjection()` for the **minimum product measured in the
 * display currency**: every candidate is projected with one shared `now`, and the cheapest
 * projection's `displayPrice` is carried whole. Spec 008 §8 is what fixes the rule — the tile's
 * figure is "the lowest payable … price inside that tile", and what a buyer compares is what the
 * cards *print*, which is the display-currency amount. Taking the minimum in the destination's
 * currency and labelling it with the locale's was the round-1 defect: with FX available, `/en`
 * over Poland stamped a PLN amount `EUR`. (The two orderings coincide whenever one rate converts
 * the whole tile, which is every case the providers can produce; the display-currency rule is the
 * one that stays true if they ever stop coinciding.)
 *
 * `undefined` is "no tile", not an error: a category with **no product** for this destination has
 * no shop-root tile and no page to link to, and a locale with **no authored slug** for it
 * (`de`/`pl` until TASK-106) has no URL to build. Both are inputs the signature accepts, so
 * neither throws.
 */
export async function categoryTileView(
  category: Category,
  locale: LocaleCode,
  iso2: CountryIso2,
  options: { readonly now?: Date } = {},
): Promise<CategoryTileView | undefined> {
  const slug = slugFor("category", category.key, locale);
  if (slug === undefined) return undefined;

  const products = await listProducts({
    facets: { [category.kind]: [category.key] },
    countryIso: iso2,
  });
  if (products.length === 0) return undefined;

  // One clock for every candidate: two `new Date()`s could straddle a rate's validity bound and
  // hand one product a converted amount and the next the destination's own (§14 A3).
  const asOf = options.now ?? new Date();
  const projections = await Promise.all(
    products.map((product) =>
      fromPriceProjection(locale, {
        productId: product.sku,
        countryIso: iso2,
        now: asOf,
      }),
    ),
  );
  const lowest = projections.reduce((cheapest, projection) =>
    projection.displayPrice.amountMinor < cheapest.displayPrice.amountMinor
      ? projection
      : cheapest,
  );

  return CategoryTileViewSchema.parse({
    key: category.key,
    name: copyRow("category", category.key, locale)?.name ?? category.key,
    href: pathOf(locale, "countryCategory", corridorSlug(iso2, locale), slug),
    count: products.length,
    fromPrice: lowest.displayPrice,
  });
}

/* -------------------------------------------------------------------------- */
/* Ordering (spec 008 §2 "Sort", §14 design round Q1).                        */
/* -------------------------------------------------------------------------- */

/**
 * The default order: spec 005's deterministic `topProductsForPrebuild()` — the locale's collation
 * of the product name, tie-broken by SKU. Spec 008 §2 calls it "a founder-set `sortIndex`, tie-
 * broken by SKU" and §14's design round rules that until that index is authored (TASK-106) "the
 * default sort keeps the plain label over the shipped `collator` order". So this is the interim
 * rule, it is stable across processes and machines, and it is never called a bestseller list.
 */
async function inDefaultOrder(
  products: readonly Product[],
  locale: LocaleCode,
  iso2: CountryIso2 | undefined,
): Promise<readonly Product[]> {
  if (iso2 === undefined) {
    return sortBy(
      [...products].sort((left, right) => (left.sku < right.sku ? -1 : 1)),
      locale,
      (product) =>
        copyRow("product", product.sku, locale)?.name ?? product.name,
    );
  }
  const order = await topProductsForPrebuild(iso2, locale, products.length);
  const rank = new Map(order.map((product, index) => [product.sku, index]));
  return [...products].sort(
    (left, right) =>
      (rank.get(left.sku) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(right.sku) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Price ascending or descending, over the same all-in amount the card prints. */
function byPrice(
  cards: readonly ProductCardView[],
  sort: ListingSort,
): readonly ProductCardView[] {
  if (sort === "default") return cards;
  const direction = sort === "price-asc" ? 1 : -1;
  return [...cards].sort(
    (left, right) =>
      direction *
      (Number(left.price.amountMinor) - Number(right.price.amountMinor)),
  );
}

/* -------------------------------------------------------------------------- */
/* The view (spec 008 §5.2 — the single input to page, JSON-LD and sitemap).   */
/* -------------------------------------------------------------------------- */

export interface ListingViewOptions {
  /** The page number of `?page=N`, already parsed by `ListingSearchParamsSchema` (TASK-114). */
  readonly page?: number;
  readonly sort?: ListingSort;
  /** The first day of the date window, `YYYY-MM-DD`. A test passes a fixed one (007's rule). */
  readonly from?: string;
  /** Spec 009's `product` link id. `false` until it is published: a tile, not a link (§13 Q8). */
  readonly productLinks?: boolean;
  readonly deployment?: DeploymentDescriptor;
}

/** The message keys the six headings use. Named here; authored in `messages/*.json` by the routes. */
const H1_KEYS: Readonly<Record<ListingPageType, string>> = {
  countryShopRoot: "shop.h1.countryShopRoot",
  countryCategory: "shop.h1.countryCategory",
  countryOccasion: "shop.h1.countryOccasion",
  categoryHub: "categoryHub.h1",
  occasionHub: "occasionHub.h1",
  occasionsIndex: "occasionsIndex.h1",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The next date of an occasion in a destination, or `null` — §14 Q6's honest blank. */
function nextDateIn(
  occasionKey: string,
  iso2: CountryIso2,
  from: IsoDate,
): string | null {
  const found = upcomingOccasions(iso2, from).find(
    (occasion) => occasion.occasionKey === occasionKey,
  );
  return found?.date ?? null;
}

function crumb(
  labelKey: string,
  href: string | undefined,
  current: boolean,
  labelValue?: string,
): ListingCrumb {
  return {
    labelKey,
    ...(labelValue === undefined ? {} : { labelValue }),
    ...(href === undefined ? {} : { href }),
    current,
  };
}

/**
 * **The** listing view model (§5.2): the single input to the page, the JSON-LD builders and the
 * sitemap row.
 *
 * `undefined` means "no such page" — the URL does not exist, or the requested `?page=N` is past
 * the last one — and the route turns that into `notFound()`, never a redirect and never an empty
 * grid standing in for a 404 (AC-1, AC-10).
 */
export async function listingView(
  params: unknown,
  options: ListingViewOptions = {},
): Promise<ListingView | undefined> {
  const parsed = ListingParamsSchema.safeParse(params);
  if (!parsed.success) return undefined;
  const { locale: localeCode, pageType, country, entity } = parsed.data;
  if (!isLocaleCode(localeCode)) return undefined;
  const locale = localeCode;

  const iso2 =
    country === undefined ? undefined : corridorIso2ForSlug(locale, country);
  if (country !== undefined && iso2 === undefined) return undefined;

  const kind: "category" | "occasion" | undefined =
    pageType === "countryCategory" || pageType === "categoryHub"
      ? "category"
      : pageType === "countryOccasion" || pageType === "occasionHub"
        ? "occasion"
        : undefined;

  const entityKey =
    entity === undefined || kind === undefined
      ? undefined
      : resolveEntityKey(locale, kind, entity);
  if (entity !== undefined && entityKey === undefined) return undefined;

  const identity: ListingIdentity = {
    pageType,
    locale,
    ...(iso2 === undefined ? {} : { countryIso: iso2 }),
    ...(entityKey === undefined ? {} : { entityKey }),
  };
  if (!(await listingExists(identity))) return undefined;

  // The date window is a boundary value like any other: parsed, not asserted (`/review 76`).
  const fromParse = IsoDateSchema.safeParse(options.from ?? todayIso());
  if (!fromParse.success) return undefined;
  const from: IsoDate = fromParse.data;
  const page = options.page ?? 1;
  const hub = iso2 === undefined;
  /**
   * A destination-less hub shows **no money at all** (§2, §8), so there is nothing on it to sort
   * by price: the request is normalised to the default order rather than reported as a price sort
   * the items cannot be in. The hub's order is `inDefaultOrder()`'s locale collation, applied to
   * the whole set below.
   */
  const sort: ListingSort = hub ? "default" : (options.sort ?? "default");
  const products = await productsFor(pageType, entityKey, kind, iso2);
  const ordered = await inDefaultOrder(products, locale, iso2);
  const total = ordered.length;
  const pageCount = Math.ceil(total / LISTING_PAGE_SIZE);
  if (page > 1 && page > pageCount) return undefined;
  const pageOf = <T>(all: readonly T[]): readonly T[] =>
    all.slice((page - 1) * LISTING_PAGE_SIZE, page * LISTING_PAGE_SIZE);

  /*
   * **Sort the whole set, then paginate** (§2 "Sort", §5.4; `/review 76`). Page 1 of
   * `?sort=price-asc` is the twelve cheapest products of the listing and page 2 continues from
   * the thirteenth — not the default page re-ordered inside itself, which is what slicing first
   * produced and what a reader comparing two pages would catch before a test did.
   *
   * The default order needs no price to order by, so it pages first and projects twelve cards; a
   * price sort has to project the whole set to order it, which is the cost of the honest answer.
   */
  let items: readonly ProductCardView[] = [];
  let hubItems: readonly HubCardView[] = [];
  if (iso2 === undefined) {
    hubItems = await Promise.all(
      pageOf(ordered).map((product) => hubCardView(product, locale)),
    );
  } else {
    const productLinks = options.productLinks ?? false;
    const cards = async (
      list: readonly Product[],
    ): Promise<readonly ProductCardView[]> =>
      Promise.all(
        list.map((product) =>
          productCardView(product, locale, iso2, { productLinks }),
        ),
      );
    items =
      sort === "default"
        ? await cards(pageOf(ordered))
        : pageOf(byPrice(await cards(ordered), sort));
  }

  const entityRow =
    entityKey === undefined || kind === undefined
      ? undefined
      : copyRow(kind, entityKey, locale);
  const entitySlug =
    entityKey === undefined || kind === undefined
      ? undefined
      : slugFor(kind, entityKey, locale);
  const countrySlug =
    iso2 === undefined ? undefined : corridorSlug(iso2, locale);
  const path = pathOf(locale, pageType, countrySlug, entitySlug);

  const tiles =
    pageType === "countryShopRoot" && iso2 !== undefined
      ? await tilesFor(locale, iso2)
      : [];

  const reviewed = entityRow?.reviewed ?? true;
  const state: CorridorState | undefined =
    iso2 === undefined ? undefined : corridorState(iso2, locale);
  const verdict = listingIndexability(
    identity,
    {
      exists: true,
      reviewed,
      ...(isCountryScoped(pageType) ? { operational: state === "live" } : {}),
    },
    options.deployment ?? deploymentDescriptor(process.env),
  );

  const view: ListingView = {
    pageType,
    locale,
    path,
    ...(iso2 === undefined || countrySlug === undefined
      ? {}
      : {
          country: {
            iso2,
            slug: countrySlug,
            nameKey: countryConfig(iso2).nameKey,
            ...(isGuidePublished(iso2)
              ? {
                  corridorPath: localePath(locale, "destinations", countrySlug),
                }
              : {}),
            state: state ?? "guide",
          },
        }),
    ...(entityKey === undefined ||
    kind === undefined ||
    entitySlug === undefined ||
    entityRow === undefined
      ? {}
      : {
          entity: {
            kind,
            key: entityKey,
            slug: entitySlug,
            name: entityRow.name,
            ...(authoredIntro(kind, entityKey, locale) === undefined
              ? {}
              : { intro: authoredIntro(kind, entityKey, locale) }),
            reviewed: entityRow.reviewed,
          },
        }),
    h1: {
      key: H1_KEYS[pageType],
      ...(iso2 === undefined
        ? {}
        : { countryNameKey: countryConfig(iso2).nameKey }),
      ...(entityRow === undefined ? {} : { entityName: entityRow.name }),
    },
    ...(hub && entityKey !== undefined && kind !== undefined
      ? { intro: authoredIntro(kind, entityKey, locale) }
      : {}),
    breadcrumb: await breadcrumbFor(
      locale,
      pageType,
      countrySlug,
      iso2,
      entityRow?.name,
      path,
    ),
    items,
    hubItems,
    tiles,
    ...(pageType === "occasionHub" && entityKey !== undefined
      ? {
          occasionDates: publishedCountries().map((country2) => ({
            iso2: country2,
            nameKey: countryConfig(country2).nameKey,
            date: isObservedIn(entityKey, country2)
              ? nextDateIn(entityKey, country2, from)
              : null,
          })),
        }
      : {}),
    ...(pageType === "countryOccasion" &&
    entityKey !== undefined &&
    iso2 !== undefined
      ? {
          occasionDates: [
            {
              iso2,
              nameKey: countryConfig(iso2).nameKey,
              date: nextDateIn(entityKey, iso2, from),
            },
          ],
        }
      : {}),
    ...(pageType === "occasionsIndex"
      ? { occasions: await occasionEntries(locale, from) }
      : {}),
    resultCount: total,
    page,
    pageCount,
    sort,
    links: await linksFor(locale, pageType, iso2, entityKey, kind, path),
    indexable: verdict.indexable,
    directive: verdict.directive,
  };

  return ListingViewSchema.parse(view);
}

/** A slug back to its catalogue key, for the four entity-scoped page types. */
function resolveEntityKey(
  locale: LocaleCode,
  kind: "category" | "occasion",
  slug: string,
): string | undefined {
  for (const row of copyRows(kind, locale)) {
    if (slugFor(kind, row.key, locale) === slug) return row.key;
  }
  return undefined;
}

/** Which products a page lists (§2, §5.3). A hub lists the entity's products across destinations. */
async function productsFor(
  pageType: ListingPageType,
  entityKey: string | undefined,
  kind: "category" | "occasion" | undefined,
  iso2: CountryIso2 | undefined,
): Promise<readonly Product[]> {
  if (pageType === "occasionsIndex") return [];
  if (pageType === "countryShopRoot" && iso2 !== undefined) {
    return listProducts({ countryIso: iso2 });
  }
  if (entityKey === undefined || kind === undefined) return [];

  const facets = await facetsFor(kind, entityKey);
  if (facets === undefined) return [];
  if (iso2 !== undefined) return listProducts({ facets, countryIso: iso2 });

  const seen = new Map<string, Product>();
  for (const country of publishedCountries()) {
    for (const product of await listProducts({ facets, countryIso: country })) {
      seen.set(product.sku, product);
    }
  }
  return [...seen.values()];
}

/** The facet selection an entity stands for: a category's own facet, or the occasion facet. */
async function facetsFor(
  kind: "category" | "occasion",
  key: string,
): Promise<Record<string, readonly string[]> | undefined> {
  if (kind === "occasion") {
    const occasion: Occasion | null = await getOccasion(key);
    return occasion === null ? undefined : { occasion: [occasion.key] };
  }
  const category: Category | null = await getCategory(key);
  return category === null ? undefined : { [category.kind]: [category.key] };
}

/** The category tiles of a country shop root: every category that has a page here (§2, §5.3). */
async function tilesFor(
  locale: LocaleCode,
  iso2: CountryIso2,
): Promise<readonly CategoryTileView[]> {
  const memo = newMemo();
  const tiles: CategoryTileView[] = [];
  for (const row of copyRows("category", locale)) {
    if (!(await countryCategoryExists(row.key, iso2, locale, memo))) continue;
    const category = await getCategory(row.key);
    if (category === null) continue;
    const tile = await categoryTileView(category, locale, iso2);
    // `undefined` is "no tile" (no product here, or no authored slug in this locale). The
    // existence rule above already excludes both, so this is the type agreeing with it.
    if (tile === undefined) continue;
    tiles.push(tile);
  }
  return sortBy(tiles, locale, (tile) => tile.name);
}

/** The occasions index's entries, grouped by the component and dated in Poland (§14 Q4). */
async function occasionEntries(
  locale: LocaleCode,
  from: string,
): Promise<readonly ListingOccasionEntry[]> {
  const memo = newMemo();
  const entries: ListingOccasionEntry[] = [];
  for (const row of copyRows("occasion", locale)) {
    if (!(await occasionHubExists(row.key, locale, memo))) continue;
    const occasion = await getOccasion(row.key);
    const slug = slugFor("occasion", row.key, locale);
    if (occasion === null || slug === undefined) continue;
    const dateCountry = publishedCountries().find(
      (iso2) => countryConfig(iso2).status === "live",
    );
    entries.push({
      key: row.key,
      name: row.name,
      href: pathOf(locale, "occasionHub", undefined, slug),
      kind: occasion.kind,
      nextDate:
        dateCountry === undefined
          ? null
          : nextDateIn(row.key, dateCountry, from),
    });
  }
  return sortBy(entries, locale, (entry) => entry.name);
}

/** The visible breadcrumb, mirrored one-for-one by the `BreadcrumbList` TASK-115 builds. */
async function breadcrumbFor(
  locale: LocaleCode,
  pageType: ListingPageType,
  countrySlug: string | undefined,
  iso2: CountryIso2 | undefined,
  entityName: string | undefined,
  path: string,
): Promise<readonly ListingCrumb[]> {
  const crumbs: ListingCrumb[] = [
    crumb("common.homeLink", localePath(locale, "home"), false),
  ];

  if (iso2 !== undefined && countrySlug !== undefined) {
    // The country crumb links to the corridor guide where one is published and is plain text
    // where it is not (§13 Q1, §14 design round Q7: `guidePublished` is the data flip).
    crumbs.push(
      crumb(
        countryConfig(iso2).nameKey,
        isGuidePublished(iso2)
          ? localePath(locale, "destinations", countrySlug)
          : undefined,
        false,
      ),
    );
    if (pageType !== "countryShopRoot") {
      crumbs.push(
        crumb(
          "breadcrumb.shopRoot",
          pathOf(locale, "countryShopRoot", countrySlug),
          false,
        ),
      );
    }
  }

  if (pageType === "occasionHub" || pageType === "countryOccasion") {
    const index = await listingExists({ pageType: "occasionsIndex", locale });
    crumbs.push(
      crumb(
        "breadcrumb.occasions",
        index ? pathOf(locale, "occasionsIndex") : undefined,
        false,
      ),
    );
  }

  crumbs.push(
    crumb(
      entityName === undefined ? H1_KEYS[pageType] : "breadcrumb.entity",
      path,
      true,
      entityName,
    ),
  );
  return crumbs;
}

/** Every link §2 asks the page to render, and only to pages that exist. */
async function linksFor(
  locale: LocaleCode,
  pageType: ListingPageType,
  iso2: CountryIso2 | undefined,
  entityKey: string | undefined,
  kind: "category" | "occasion" | undefined,
  self: string,
): Promise<ListingLinks> {
  const memo = newMemo();
  const chips: ChipLinkView[] = [];
  const destinations: ListingDestinationLink[] = [];

  if (iso2 !== undefined && kind !== undefined) {
    // Sibling categories or occasions of this destination — links to real pages, which is what
    // `plan/02` §7 means by "facets worth ranking get a real authored path".
    for (const row of copyRows(kind, locale)) {
      const exists =
        kind === "category"
          ? await countryCategoryExists(row.key, iso2, locale, memo)
          : await countryOccasionExists(row.key, iso2, locale, memo);
      if (!exists) continue;
      const slug = slugFor(kind, row.key, locale);
      if (slug === undefined) continue;
      chips.push(
        ChipLinkViewSchema.parse({
          key: row.key,
          name: copyRow(kind, row.key, locale)?.name ?? row.key,
          href: pathOf(
            locale,
            kind === "category" ? "countryCategory" : "countryOccasion",
            corridorSlug(iso2, locale),
            slug,
          ),
          ...(row.key === entityKey ? { current: true } : {}),
        }),
      );
    }
  }

  if (iso2 === undefined && entityKey !== undefined && kind !== undefined) {
    // The hub's destination picker: every country page of this entity that exists, in the
    // locale's collation (§2, §5.3).
    for (const country of publishedCountries()) {
      const exists =
        kind === "category"
          ? await countryCategoryExists(entityKey, country, locale, memo)
          : await countryOccasionExists(entityKey, country, locale, memo);
      if (!exists) continue;
      const slug = slugFor(kind, entityKey, locale);
      if (slug === undefined) continue;
      destinations.push(
        ListingDestinationLinkSchema.parse({
          iso2: country,
          nameKey: countryConfig(country).nameKey,
          href: pathOf(
            locale,
            kind === "category" ? "countryCategory" : "countryOccasion",
            corridorSlug(country, locale),
            slug,
          ),
        }),
      );
    }
  }

  const occasionsIndex = (await listingExists({
    pageType: "occasionsIndex",
    locale,
  }))
    ? pathOf(locale, "occasionsIndex")
    : undefined;

  return ListingLinksSchema.parse({
    self,
    ...(iso2 === undefined || pageType === "countryShopRoot"
      ? {}
      : {
          shopRoot: pathOf(
            locale,
            "countryShopRoot",
            corridorSlug(iso2, locale),
          ),
        }),
    ...(iso2 !== undefined && isGuidePublished(iso2)
      ? {
          corridor: localePath(
            locale,
            "destinations",
            corridorSlug(iso2, locale),
          ),
        }
      : {}),
    ...(occasionsIndex === undefined ? {} : { occasionsIndex }),
    chips: sortBy(chips, locale, (chip) => chip.name),
    // Registry order (Poland first): the visible label is a *message*, and collating the country
    // names is the renderer's job because only it can resolve them (TASK-112).
    destinations,
  });
}

/* -------------------------------------------------------------------------- */
/* The CI step summary (spec 008 §11, AC-3).                                  */
/* -------------------------------------------------------------------------- */

/** How many pages of each type exist in one locale, and how many categories fell below the floor. */
export interface LocaleExistenceCounts {
  readonly locale: LocaleCode;
  readonly countryShopRoot: number;
  readonly countryCategory: number;
  readonly countryOccasion: number;
  readonly categoryHub: number;
  readonly occasionHub: number;
  readonly occasionsIndex: number;
  /** Every listing URL this locale has — named `urlCount` because `fo/no-float-money` reads a
   * `total` as money (`plan/12` §2). */
  readonly urlCount: number;
  /** (category, destination) pairs with ≥1 product but fewer than the floor — §11's honest number. */
  readonly belowFloor: number;
}

/**
 * The per-locale existence counts of §11 — "how many listing URLs exist, and does that exceed the
 * countries and categories that pass the floor?" as one function and one number.
 */
export async function existenceCounts(): Promise<
  readonly LocaleExistenceCounts[]
> {
  const memo = newMemo();
  const counts: LocaleExistenceCounts[] = [];

  for (const locale of listingLocales()) {
    const pages = await listingPages(locale);
    const of = (pageType: ListingPageType): number =>
      pages.filter((page) => page.pageType === pageType).length;

    let belowFloor = 0;
    for (const iso2 of publishedCountries()) {
      for (const row of copyRows("category", locale)) {
        if (!hasAuthoredSlug("category", row.key, locale)) continue;
        if ((await getCategory(row.key)) === null) continue;
        const count = await countIn(memo, row.key, iso2);
        if (count > 0 && count < PRODUCT_COUNT_FLOOR) belowFloor += 1;
      }
    }

    counts.push({
      locale,
      countryShopRoot: of("countryShopRoot"),
      countryCategory: of("countryCategory"),
      countryOccasion: of("countryOccasion"),
      categoryHub: of("categoryHub"),
      occasionHub: of("occasionHub"),
      occasionsIndex: of("occasionsIndex"),
      urlCount: pages.length,
      belowFloor,
    });
  }

  return counts;
}

/**
 * Write the counts where CI reads them: `$GITHUB_STEP_SUMMARY` when the runner set one, stdout
 * otherwise (the shape `scripts/corridor-check.ts` and `seed/check.ts` use).
 *
 * It lives in the module rather than in a `scripts/` entry point because the module is the only
 * place the counts can be computed: every read below it goes through spec 005's provider seam and
 * the `@/` alias, and this module's graph reaches `@/modules/ui` — React components and
 * `next/font` — so `node scripts/*.ts`, which resolves neither, cannot import it at all
 * (`ERR_MODULE_NOT_FOUND: @/config`, verified in `/review 76`'s fix round).
 *
 * **It therefore has no call site yet, deliberately** (`/review 76` ruling 4). The call site is
 * `generateStaticParams` — the same function whose output the numbers describe (AC-3) — which
 * **TASK-109** adds for the country shop root and TASK-110…112 for the other five types; AC-3's
 * "printed to the CI step summary" is satisfied there, in the build that produces the URLs, and
 * not by a second enumeration in a script that would be a second answer to the same question. The
 * function, its Markdown and its `GITHUB_STEP_SUMMARY` branch are tested here today.
 */
export async function writeExistenceSummary(
  env: Readonly<Record<string, string | undefined>> = process.env,
  write: (text: string) => void = (text) => process.stdout.write(text),
): Promise<string> {
  const summary = existenceSummaryMarkdown(await existenceCounts());
  const stepSummary = env["GITHUB_STEP_SUMMARY"];
  if (stepSummary !== undefined && stepSummary !== "") {
    appendFileSync(stepSummary, `${summary}\n`, "utf8");
  } else {
    write(`${summary}\n`);
  }
  return summary;
}

/** The counts as the Markdown table §11 asks CI to print. No colour, no emoji, one table. */
export function existenceSummaryMarkdown(
  counts: readonly LocaleExistenceCounts[],
): string {
  const header = [
    "### Listing existence set (spec 008 §2, §11; floor " +
      String(PRODUCT_COUNT_FLOOR) +
      ")",
    "",
    "| Locale | Shop roots | Country categories | Country occasions | Category hubs | Occasion hubs | Occasions index | Total | Below floor |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  const rows = counts.map((count) =>
    [
      `| ${count.locale}`,
      String(count.countryShopRoot),
      String(count.countryCategory),
      String(count.countryOccasion),
      String(count.categoryHub),
      String(count.occasionHub),
      String(count.occasionsIndex),
      String(count.urlCount),
      `${String(count.belowFloor)} |`,
    ].join(" | "),
  );
  return [...header, ...rows, ""].join("\n");
}
