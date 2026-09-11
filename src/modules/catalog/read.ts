/**
 * The taxonomy, tier and add-on read API (spec 005 §2 "Taxonomy" and "Tiers and add-ons",
 * §5.2 `read.ts`, §5.4, §6, §12; TASK-063, TASK-064).
 *
 * Everything spec 008's category, occasion and shop loaders, spec 009's PDP and the sitemap
 * builder need in order to answer *what is in the catalogue* — and nothing about what it costs
 * (that is `pricing/*`, TASK-065 onwards) and nothing about what a page decides. Four rules shape
 * the file, and each is a plan rule rather than a preference:
 *
 *  - **Counts, not verdicts.** `countProductsIn()` / `countProductsFor()` are `plan/02` §6's
 *    six-product rule *as a function*. The threshold itself is spec 008's page loader's (spec 005
 *    §2 and §5.3: "`countProductsIn()` returns the count; the threshold is 008's"), so the number
 *    6 appears nowhere in this module. A category with three products reports 3, and the loader
 *    decides that the page is not created (`plan/02` §7: a failing page is a 404, never a
 *    `noindex`).
 *  - **A facet combination can never be indexable.** `resolveFacets()` returns the literal
 *    `false`, not a `boolean`, and `isAuthoredFacetPath()` returns `false` for every input in
 *    Phase 0 (`plan/02` §7: facets are query parameters, `noindex,follow`, canonical to the
 *    unparameterised page; only an authored path like `/en-gb/poland/flowers/red-roses` may ever
 *    be indexable, and none is authored yet). Both are the same defence: a colour or price facet
 *    URL cannot become indexable by accident.
 *  - **Deterministic order, no relevance model.** Search, ranking and "sorted by bestsellers" are
 *    spec 008's (spec 005 §3), and the Omnibus/DMCC ranking-transparency position of §8 depends on
 *    this module exposing a *default* order rather than a scored one. `listProducts()` is ascending
 *    SKU; `topProductsForPrebuild()` is the locale's collation of the product name.
 *  - **Nothing can be preselected or offered by accident.** Which tier a PDP preselects is the
 *    authored `product_tier.is_default` row (`plan/04` §16's A/B test #2 is "12 vs 18 stems"), and
 *    an add-on has no field that could pre-tick it at all (CRD Art. 22, AC-19). A flagged add-on
 *    is absent unless its flag is on, read through the seam of `flags.ts` and closed by default.
 *  - **The destination is the only geography.** Every signature here takes a destination ISO or
 *    nothing at all — no buyer country, no IP, no header, no visitor (EU 2018/302, ADR-0006,
 *    AC-18, whose whole-module gate is TASK-069's).
 *
 * Reads go through `catalogProviders()`, never a dataset import, so TASK-070's Postgres swap
 * changes no line here. There is no memoisation: the static providers perform no I/O, and a real
 * `catalog` cache is the ISR window plus `cacheTagsFor()` (TASK-069), not a process-local map that
 * would outlive an admin price flip.
 */
import {
  type CategoryData,
  type FacetName,
  type OccasionData,
  facetNames,
  facetValues,
  scopedFlagKey,
} from "@/config/catalogue/schemas";
import { type CountryIso2, countryConfig } from "@/config/countries";
import type { LocaleCode } from "@/config/locales";
import { isLocaleIndexable, sortBy } from "@/modules/i18n";

import { isFlagEnabled } from "./flags";
import {
  catalogProviders,
  type ProductRecord,
  type ProductTierRecord,
} from "./providers";
import {
  AddonSchema,
  DestinationIsoSchema,
  FacetSearchParamsSchema,
  FacetSelectionSchema,
  ListProductsQuerySchema,
  LocaleCodeSchema,
  PrebuildCountSchema,
  ProductSkuSchema,
  ProductTierSchema,
} from "./schemas";
import type {
  Addon,
  Category,
  FacetResolution,
  FacetSelection,
  Occasion,
  Product,
  ProductIndexability,
  Tier,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Mapping: authored record -> view model.                                    */
/* -------------------------------------------------------------------------- */

/**
 * Field by field, deliberately: a spread would make every future authoring-only field part of the
 * public read model silently, and spec 006 is about to add descriptions and media to the authored
 * side. Nothing is computed and nothing is dropped except by an explicit line here.
 */
function toProduct(record: ProductRecord): Product {
  return {
    sku: record.sku,
    name: record.name,
    slug: record.slug,
    productType: record.productType,
    primaryFlower: record.primaryFlower,
    flowerTypes: record.flowerTypes,
    colourPrimary: record.colourPrimary,
    colours: record.colours,
    style: record.style,
    priceTier: record.priceTier,
    occasions: record.occasions,
    substitutionClass: record.substitutionClass,
    vaseIncluded: record.vaseIncluded,
    stemCount: record.stemCount,
    freshnessDays: record.freshnessDays,
    allergenNote: record.allergenNote,
    partnerOnly: record.partnerOnly,
    status: record.status,
  };
}

function toCategory(record: CategoryData): Category {
  return {
    key: record.key,
    kind: record.kind,
    labelKey: record.labelKey,
    sort: record.sort,
  };
}

function toOccasion(record: OccasionData): Occasion {
  return {
    key: record.key,
    kind: record.kind,
    labelKey: record.labelKey,
    sort: record.sort,
  };
}

/**
 * The six facets of `plan/10` §1.1 as they sit on one product record: the multi-valued ones in
 * full (a product carries many flower types and many colours, one of each primary), the
 * single-valued ones as a one-element list, so a filter is one uniform membership test rather
 * than six special cases.
 */
function facetValuesOf(
  product: Product,
): Readonly<Record<FacetName, readonly string[]>> {
  return {
    productType: [product.productType],
    occasion: product.occasions,
    flowerType: product.flowerTypes,
    colour: product.colours,
    priceTier: [product.priceTier],
    style: [product.style],
  };
}

/** Within a facet the values are OR; across facets they are AND — the usual filter algebra. */
function matchesFacets(product: Product, selection: FacetSelection): boolean {
  const values = facetValuesOf(product);
  return facetNames.every((facet) => {
    const wanted = selection[facet];
    if (wanted === undefined) return true;
    return wanted.some((value) => values[facet].includes(value));
  });
}

/* -------------------------------------------------------------------------- */
/* Availability of a *price row*, which is what "available in a country" means */
/* here — the amount itself is `pricing/resolve.ts`'s (TASK-065).              */
/* -------------------------------------------------------------------------- */

/**
 * The `(sku, destination)` pairs that have an **active retail** `country_price` row.
 *
 * Presence, not amount: this module reads whether a product is priced for a destination, which is
 * one of the six terms of spec 005 §6's indexability predicate and the filter behind the §6
 * counters. Surcharge rows (`surchargeKind !== null`) are not a product's price, and a superseded
 * row (`activeTo !== null`) is history kept for the Omnibus 30-day figure (`plan/07` §2.1), so
 * neither makes a product purchasable.
 */
/**
 * Does this (product, destination) have an active retail price row? — spec 005 §6's third
 * indexability term and `availability()`'s third term, read from one place.
 *
 * Exported for the module and **not** from the barrel: a caller asks for a price
 * (`resolvePrice()`) or for a verdict (`availability()`, `isProductIndexable()`), never for the
 * presence of a row. Sharing it is what keeps "priced" one definition — active, retail, not a
 * surcharge row — rather than two that can drift (`availability.ts` and this file).
 */
export async function hasActivePrice(
  sku: string,
  countryIso: CountryIso2,
): Promise<boolean> {
  const key = ProductSkuSchema.parse(sku);
  const destination = DestinationIsoSchema.parse(countryIso);
  return (await pricedPairs()).has(`${key}|${destination}`);
}

async function pricedPairs(): Promise<ReadonlySet<string>> {
  const rows = await catalogProviders().price.countryPrices();
  const pairs = new Set<string>();
  for (const row of rows) {
    if (row.surchargeKind === null && row.activeTo === null) {
      pairs.add(`${row.sku}|${row.countryIso2}`);
    }
  }
  return pairs;
}

/* -------------------------------------------------------------------------- */
/* Entities.                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One product by SKU, or `null` when the catalogue has no such product.
 *
 * **By SKU, and only by SKU.** A slug lookup belongs with `product_translation`, whose slugs are
 * per locale and unique per locale (spec 002 §5.1); this dataset carries the `en` slug only
 * (spec 005 §7 "the dataset ships `en` only"), so a slug resolver written here would answer for
 * `/en/...` and quietly fail for `/de/...`. Spec 006's importer owns the translations and the
 * per-locale slug resolution that a PDP route needs.
 *
 * A malformed SKU is a parse error rather than a `null`: `plan/10` §4 makes the SKU the natural
 * key, so a caller holding something that is not one has a bug, not a miss (`plan/12` §2).
 */
export async function getProduct(sku: string): Promise<Product | null> {
  const key = ProductSkuSchema.parse(sku);
  const products = await catalogProviders().catalogue.products();
  const found = products.find((product) => product.sku === key);
  return found === undefined ? null : toProduct(found);
}

/**
 * The catalogue, filtered and ordered deterministically.
 *
 * Defaults, all stated so a caller reads the list it expects: `statuses: ["active"]` (a draft or
 * retired product is not listed unless asked for — `plan/02` §7's retired-product handling is
 * spec 008's and needs the row, which is why the parameter exists), every destination, every
 * facet, no paging. The order is **ascending SKU** — the authored order, the natural key's own
 * order, and the "deterministic default sort" §8 requires so that spec 008's ranking disclosure
 * has something true to describe. No `q`, no `sort`, no scoring: search and ranking are spec 008's
 * (spec 005 §3).
 */
export async function listProducts(
  query?: unknown,
): Promise<readonly Product[]> {
  const parsed = ListProductsQuerySchema.parse(query ?? {});
  const statuses = parsed.statuses ?? (["active"] as const);
  const products = (await catalogProviders().catalogue.products()).map(
    toProduct,
  );

  const priced = parsed.countryIso === undefined ? null : await pricedPairs();

  const matched = products
    .filter((product) => statuses.includes(product.status))
    .filter(
      (product) =>
        parsed.facets === undefined ||
        matchesFacets(product, parsed.facets as FacetSelection),
    )
    .filter(
      (product) =>
        priced === null ||
        priced.has(`${product.sku}|${String(parsed.countryIso)}`),
    )
    .sort((left, right) => (left.sku < right.sku ? -1 : 1));

  const offset = parsed.offset ?? 0;
  return parsed.limit === undefined
    ? matched.slice(offset)
    : matched.slice(offset, offset + parsed.limit);
}

/**
 * One category by key, or `null`. A key comes off a URL segment, so an unknown one is a miss the
 * route turns into a 404 (`plan/02` §7), not an exception.
 */
export async function getCategory(key: string): Promise<Category | null> {
  const categories = await catalogProviders().catalogue.categories();
  const found = categories.find((category) => category.key === key);
  return found === undefined ? null : toCategory(found);
}

/** One occasion by key, or `null`, for the same reason `getCategory()` returns `null`. */
export async function getOccasion(key: string): Promise<Occasion | null> {
  const occasions = await catalogProviders().catalogue.occasions();
  const found = occasions.find((occasion) => occasion.key === key);
  return found === undefined ? null : toOccasion(found);
}

/* -------------------------------------------------------------------------- */
/* The six-product-rule counters (plan/02 §6). Counts only — never a verdict.  */
/* -------------------------------------------------------------------------- */

/**
 * How many products a category holds for one destination.
 *
 * The count is over **facet membership**, not over the primary value only: a flower hub
 * `/{loc}/{country}/flowers/roses` lists every product whose flowers include roses, which is what
 * `plan/10` §1.1's "many, one primary" means for a listing page. A product counts when its status
 * is `active` and it has an active retail price for that destination.
 *
 * The threshold is **not** here. `plan/02` §6 makes ≥6 products the condition for an indexable
 * category page and spec 005 §2 assigns the threshold to spec 008's loader; this function's job is
 * to make that judgement a number rather than a habit.
 *
 * An unauthored key throws: a category key is resolved with `getCategory()` first (which returns
 * `null` for a 404), so a key that reaches the counter and does not exist is a bug that must not
 * present itself as "0 products, so 404".
 */
export async function countProductsIn(
  categoryKey: string,
  countryIso: CountryIso2,
): Promise<number> {
  const destination = DestinationIsoSchema.parse(countryIso);
  const category = await getCategory(categoryKey);
  if (category === null) {
    throw new Error(
      `\`${categoryKey}\` is not an authored category (src/config/catalogue/categories.data.ts); resolve a URL segment with getCategory() first`,
    );
  }
  const products = await listProducts({
    facets: { [category.kind]: [category.key] },
    countryIso: destination,
  });
  return products.length;
}

/**
 * How many products are tagged for one occasion in one destination — `plan/02` §6's occasion-page
 * condition ("≥6 products tagged for the occasion available there") as a number. The date rule
 * (`observed`, and *when*) is `occasion_country`'s and spec 009's; 005 owns no calendar (§3).
 */
export async function countProductsFor(
  occasionKey: string,
  countryIso: CountryIso2,
): Promise<number> {
  const destination = DestinationIsoSchema.parse(countryIso);
  const occasion = await getOccasion(occasionKey);
  if (occasion === null) {
    throw new Error(
      `\`${occasionKey}\` is not an authored occasion (src/config/catalogue/occasions.data.ts); resolve a URL segment with getOccasion() first`,
    );
  }
  const products = await listProducts({
    facets: { occasion: [occasion.key] },
    countryIso: destination,
  });
  return products.length;
}

/* -------------------------------------------------------------------------- */
/* Facets (plan/02 §7).                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The query-parameter name of each facet: `plan/10` §1.1's key, kebab-cased, which is the form
 * `plan/02` §7's own example uses (`?colour=red`). One map, so no caller string-builds a facet
 * parameter and the URL vocabulary cannot drift from the taxonomy.
 */
const FACET_PARAMETERS: Readonly<Record<FacetName, string>> = {
  productType: "product-type",
  occasion: "occasion",
  flowerType: "flower-type",
  colour: "colour",
  priceTier: "price-tier",
  style: "style",
};

const PARAMETER_FACETS: ReadonlyMap<string, FacetName> = new Map(
  facetNames.map((facet) => [FACET_PARAMETERS[facet], facet]),
);

/** A Next.js `searchParams` object or a `URLSearchParams`, normalised to one shape. */
function normaliseSearchParams(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  if (!(input instanceof URLSearchParams)) return input;
  const record: Record<string, string[]> = {};
  for (const key of new Set(input.keys())) record[key] = input.getAll(key);
  return record;
}

/**
 * Parse a page's query string into a canonical facet selection, and say plainly that it is not
 * indexable (`plan/02` §7; spec 005 §2 "Facet resolution for URL-driven filtering").
 *
 * Canonical means three things, and each one is what makes two requests for the same filter one
 * value: values are deduplicated, values are ordered by the taxonomy (never by arrival), and a
 * facet nobody filtered on is **absent** rather than present-and-empty. So
 * `?colour=white&colour=red` and `?colour=red,white` and `?colour=red&colour=white&colour=red`
 * are all the same `FacetResolution`, with the same `canonicalQuery` — usable as a cache key,
 * never as a published URL.
 *
 * Unknown parameters and unknown values are **not** errors. A buyer, a crawler or a campaign can
 * put anything in a query string and the page still has to render; a `q`, a `page`, a `sort` or a
 * typo is reported in `ignored` so nothing silently widens the filter, and the page stays
 * `noindex,follow` with its canonical pointing at itself without parameters.
 *
 * `indexable` is the literal `false`. There is no input, and no future data flip, that makes a
 * parameterised facet URL indexable: that path is `isAuthoredFacetPath()`'s, and an authored path
 * is a page, not a query string.
 */
export function resolveFacets(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>,
): FacetResolution {
  const parsed = FacetSearchParamsSchema.parse(
    normaliseSearchParams(searchParams),
  );

  const selected = new Map<FacetName, string[]>();
  const ignored = new Set<string>();

  for (const [name, raw] of Object.entries(parsed)) {
    const facet = PARAMETER_FACETS.get(name);
    const values = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw])
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter((value) => value !== "");

    if (facet === undefined) {
      if (values.length > 0 || raw !== undefined) ignored.add(name);
      continue;
    }
    for (const value of values) {
      if (!facetValues[facet].includes(value)) {
        ignored.add(`${name}=${value}`);
        continue;
      }
      const chosen = selected.get(facet) ?? [];
      if (!chosen.includes(value)) chosen.push(value);
      selected.set(facet, chosen);
    }
  }

  const facets: Partial<Record<FacetName, readonly string[]>> = {};
  const query: string[] = [];
  for (const facet of facetNames) {
    const chosen = selected.get(facet);
    if (chosen === undefined || chosen.length === 0) continue;
    const canonical = facetValues[facet].filter((value) =>
      chosen.includes(value),
    );
    facets[facet] = canonical;
    query.push(`${FACET_PARAMETERS[facet]}=${canonical.join(",")}`);
  }

  return {
    facets: FacetSelectionSchema.parse(facets) as FacetSelection,
    canonicalQuery: query.join("&"),
    ignored: [...ignored].sort(),
    indexable: false,
  };
}

/**
 * Is this path an **authored** facet page — the kind `plan/02` §7 allows to be indexable
 * (`/en-gb/poland/flowers/red-roses`) rather than a `noindex` query-parameter combination?
 *
 * `false` for everything, in Phase 0, by design (spec 005 §2, §6). No such path is authored yet:
 * authoring one is spec 008's route plus a category row, and until that exists a function that
 * ever answered `true` would be the single mechanism by which a colour or price facet URL could
 * slip into the sitemap. Total over any string, so a caller cannot get a different answer by
 * passing an odd path.
 */
export function isAuthoredFacetPath(path: string): boolean {
  if (typeof path !== "string") {
    throw new TypeError("isAuthoredFacetPath expects a path string");
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Indexability (spec 005 §6, plan/02 §10).                                   */
/* -------------------------------------------------------------------------- */

/**
 * Whether a reviewed, non-null description exists for a product in a locale — spec 005 §6's
 * fourth and fifth terms.
 *
 * **`false` for every product and every locale in Phase 0, and that is the intended answer.** The
 * dataset ships no description, no `product_translation` row and no review status at all (spec 005
 * §2 "Deliberately absent", AC-6: "zero descriptions … zero `de`/`pl` translations"), and spec 005
 * §3 is explicit that "a product with a null description is non-indexable and 005 makes that
 * queryable rather than filling it". So nothing is indexable until spec 006's importer lands the
 * copy behind `CatalogueProvider` — at which point this reads the translation rows and the whole
 * predicate flips as **data**, with no code branch per product and none per country.
 *
 * It is a constant rather than a `TODO` because the alternative — treating the missing term as
 * satisfied — would let a country flip produce indexable pages with no copy, which is exactly the
 * thin-content failure `plan/02` §6 and spec 005 §6 exist to prevent.
 */
const PHASE_0_REVIEWED_COPY = false;

/**
 * The conjunction of spec 005 §6's six terms, as a pure function of the six booleans.
 *
 * Separated from the reading of the terms so that "indexable only when **all six** hold" is
 * checkable over the whole 2^6 truth table rather than over the handful of combinations the
 * Phase 0 dataset can produce (AC-21, T-19). It is `every`, deliberately: a weighted or
 * short-circuiting reading of these terms is how a product with no description would end up in a
 * sitemap.
 */
export function indexabilityVerdict(
  terms: Omit<ProductIndexability, "indexable">,
): boolean {
  return Object.values(terms).every((term) => term);
}

/**
 * Spec 005 §6's indexability predicate, term by term, for one product in one (locale,
 * destination).
 *
 * Exported for the module and its tests, **not** from the barrel: `isProductIndexable()` — the
 * single predicate spec 008/009 and the sitemap builder call, and the one AC-21 measures whole —
 * is TASK-068's, and it is meant to be this record's conjunction rather than a second reading of
 * the same six inputs. Reporting the terms instead of a bare boolean is what makes "why is this
 * page not indexed" answerable without a debugger.
 */
export async function productIndexability(
  sku: string,
  locale: LocaleCode,
  countryIso: CountryIso2,
): Promise<ProductIndexability> {
  const destination = DestinationIsoSchema.parse(countryIso);
  const localeCode = LocaleCodeSchema.parse(locale);
  const product = await getProduct(sku);
  if (product === null) {
    throw new Error(`\`${sku}\` is not a product in the catalogue`);
  }

  const priced = await pricedPairs();
  const terms = {
    countryLive: countryConfig(destination).status === "live",
    productActive: product.status === "active",
    activePrice: priced.has(`${product.sku}|${destination}`),
    descriptionPresent: PHASE_0_REVIEWED_COPY,
    translationReviewed: PHASE_0_REVIEWED_COPY,
    localeIndexable: isLocaleIndexable(localeCode),
  } as const;

  return { ...terms, indexable: indexabilityVerdict(terms) };
}

/**
 * **The** indexability predicate: is this product indexable in this locale for this destination?
 * (spec 005 §6, AC-21; `plan/02` §10, ADR-0007)
 *
 * One function, called by both the robots decision and the sitemap-membership query, is what
 * makes "a `noindex` product can never appear in a sitemap" a structural property instead of a
 * convention two consumers are asked to honour: there is no second reading of the six terms
 * anywhere in `src/`, `productIndexability()` has exactly one call site (this one), and
 * `hasIndexableProducts()` — the membership question a sitemap builder asks per (destination,
 * locale) — is written in terms of this predicate. A single-call-site test pins all three
 * (T-19).
 *
 * Every term is data, so a country go-live, a product retirement, a landed description, a
 * completed translation review and a locale launch each flip the answer with **no code change**
 * (`CLAUDE.md`). Spec 007's sitemap and robots builders call this and compute nothing of their
 * own.
 */
export async function isProductIndexable(
  sku: string,
  locale: LocaleCode,
  countryIso: CountryIso2,
): Promise<boolean> {
  return (await productIndexability(sku, locale, countryIso)).indexable;
}

/**
 * Does this (destination, locale) have **any** indexable product — the question the sitemap
 * builder, the robots decision and a corridor's "should this shop exist as an indexable page"
 * check all reduce to (`plan/02` §10, spec 005 §2).
 *
 * `false` everywhere in Phase 0, because no product has reviewed copy yet (see
 * `PHASE_0_REVIEWED_COPY`). That is the honest answer and the safe one: a `noindex` product can
 * never appear in a sitemap because the membership query and this predicate read the same terms.
 */
export async function hasIndexableProducts(
  countryIso: CountryIso2,
  locale: LocaleCode,
): Promise<boolean> {
  const destination = DestinationIsoSchema.parse(countryIso);
  const localeCode = LocaleCodeSchema.parse(locale);

  if (!isLocaleIndexable(localeCode)) return false;
  if (countryConfig(destination).status !== "live") return false;

  const candidates = await listProducts({ countryIso: destination });
  for (const product of candidates) {
    if (await isProductIndexable(product.sku, localeCode, destination)) {
      return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Prebuild ordering (plan/01 §3, spec 005 §5.4).                             */
/* -------------------------------------------------------------------------- */

/**
 * The first `n` products a locale's `generateStaticParams` should prebuild for a destination
 * (`plan/01` §3: "the live country corridors and the top 50 products per live locale", so builds
 * stay under three minutes as the catalogue grows).
 *
 * **Deterministic, and deliberately not a ranking.** There is no popularity signal in Phase 0 —
 * no orders exist — and spec 005 §3 keeps relevance and search in spec 008, so inventing a score
 * here would be a ranking nobody could disclose under the Omnibus/DMCC transparency rules (§8).
 * The order is the locale's own collation of the product name (spec 003's `sortBy`, the only
 * collator in the repository), tie-broken by SKU: stable across processes and machines, honest
 * about what it is, and replaceable behind this signature the day real demand data exists.
 *
 * The destination filters — a product is prebuilt where it is priced — but its `status` does not:
 * a `demo` country's shop pages exist and are `noindex,follow` (`plan/02` §7, ADR-0007), so they
 * are still worth prebuilding. Which destinations to iterate is the caller's decision.
 */
export async function topProductsForPrebuild(
  countryIso: CountryIso2,
  locale: LocaleCode,
  n: number,
): Promise<readonly Product[]> {
  const destination = DestinationIsoSchema.parse(countryIso);
  const localeCode = LocaleCodeSchema.parse(locale);
  const count = PrebuildCountSchema.parse(n);

  const available = await listProducts({ countryIso: destination });
  const ordered = sortBy(
    [...available].sort((left, right) => (left.sku < right.sku ? -1 : 1)),
    localeCode,
    (product) => product.name,
  );
  return ordered.slice(0, count);
}

/* -------------------------------------------------------------------------- */
/* Tiers (spec 005 §2 "Tiers and add-ons", §13 Q4/Q6; TASK-064).               */
/* -------------------------------------------------------------------------- */

function toTier(record: ProductTierRecord): Tier {
  return ProductTierSchema.parse({
    tierKey: record.tierKey,
    labelKey: record.labelKey,
    stems: record.stems,
    sort: record.sort,
    isDefault: record.isDefault,
  });
}

/**
 * The size steps of one product, in `sort` order (`plan/10` §2.2).
 *
 * The product's SKU is the argument, so the read model carries none: a caller holding a tier
 * already knows which product it asked about, and repeating the key would let a list of tiers be
 * assembled across products, which is not a thing the PDP or the price table has.
 *
 * **An unknown SKU throws, and so does a product with no tiers.** A SKU is resolved with
 * `getProduct()` first (which returns `null` for a 404), so one that reaches here and does not
 * exist is a bug; and a priced product with no tier is the `no-tier` fault `pnpm catalogue:check`
 * refuses in the dataset (AC-5), so answering `[]` would turn a data hole into an empty PDP
 * rather than a loud failure. There is no money here: the stepped amounts are authored
 * `country_price` rows read by `resolvePrice()` (TASK-065), never a percentage at render.
 */
export async function listTiers(sku: string): Promise<readonly Tier[]> {
  const key = ProductSkuSchema.parse(sku);
  const product = await getProduct(key);
  if (product === null) {
    throw new Error(`\`${key}\` is not a product in the catalogue`);
  }
  const tiers = (await catalogProviders().catalogue.tiers()).filter(
    (tier) => tier.sku === key,
  );
  if (tiers.length === 0) {
    throw new Error(
      `\`${key}\` has no \`product_tier\` row: a product with no tier has no price (spec 005 AC-5, \`pnpm catalogue:check\` mode \`no-tier\`)`,
    );
  }
  return [...tiers]
    .sort((left, right) => left.sort - right.sort)
    .map((tier) => toTier(tier));
}

/**
 * The tier a product page preselects — `product_tier.is_default` (spec 002 §14 A1 (b), spec 005
 * §13 Q6).
 *
 * **Data, not code.** `plan/04` §16's A/B test #2 is "12 vs 18 stems", so the preselection has to
 * be an authored row: a middle tier chosen in this function could not be varied per product and
 * could not be tested at all. What the dataset authors today *is* the middle tier
 * (`ProductTierGroupSchema` refuses anything else), and changing that for one product is one
 * `isDefault` flip.
 *
 * **Zero or two defaults throw, never a silent pick.** That mirrors `resolvePrice()`'s rule for
 * two active price rows (spec 005 §5.2): spec 002 §14 A1 (b)'s one-per-product partial unique
 * index makes it impossible in Postgres and `ProductTierGroupSchema` makes it impossible in the
 * dataset, so an occurrence here is a migration or a seed defect and must be visible as one.
 */
export async function defaultTier(sku: string): Promise<Tier> {
  const tiers = await listTiers(sku);
  const defaults = tiers.filter((tier) => tier.isDefault);
  if (defaults.length !== 1 || defaults[0] === undefined) {
    throw new Error(
      `\`${sku}\` has ${String(defaults.length)} default tiers; exactly one is required (spec 002 §14 A1 (b), spec 005 §13 Q6) — a preselected tier is data, never a pick made here`,
    );
  }
  return defaults[0];
}

/* -------------------------------------------------------------------------- */
/* Add-ons (spec 005 §2 "Tiers and add-ons", §8, AC-19; TASK-064).             */
/* -------------------------------------------------------------------------- */

/**
 * The add-ons that may be offered with an order to one destination, in listing order.
 *
 * Four properties of this function are the compliance content of spec 005 §8, and each of them is
 * structural rather than reviewed for:
 *
 *  1. **Nothing can arrive pre-ticked.** The `Addon` read model has no `defaultSelected` and no
 *     `preselected` field, `AddonSchema` is `.strict()`, and `pnpm catalogue:check`'s
 *     `addon-preselection` mode fails if one is ever declared or authored. CRD Art. 22 is
 *     discharged by absence (`plan/07` §2.1, AC-19).
 *  2. **Every add-on carries its own VAT rate**, read from the one active `addon_country_price`
 *     row for this destination (spec 002 §14 A1 (a), spec 005 §13 Q3): in Poland chocolates are
 *     23% while flowers are 8% (`plan/06` §4 item 4). The *amount* is not here — an add-on price
 *     is a `PricePoint` from `pricing/*` (TASK-065) or it is nothing, so a partial price cannot be
 *     rendered (AC-8).
 *  3. **A flagged add-on is absent unless its flag is on.** `wine` is gated on
 *     `addon.wine.{country}` (`plan/10` §1.1, `plan/07` §6: disabled where the florist is not
 *     licensed), read through the flag seam and therefore closed by default. Licensing a country
 *     is a flag flip, not a code change.
 *  4. **A zero-priced add-on is still an add-on.** `card` is priced 0 and is returned like any
 *     other, so the summary, the invoice and the confirmation email show the same set of lines
 *     (spec 005 §2).
 *
 * Two active rows for one (add-on, destination) **throws**: the same "never a silent pick" rule
 * `resolvePrice()` applies, guaranteed impossible by spec 002 §14 A1 (a)'s partial unique index
 * and by `catalogue:check`. No active row means the add-on is simply not offered there, which is
 * a data-driven absence rather than a fault — the mirror of `listProducts()` omitting a product
 * that a destination has no price for.
 *
 * The destination is the only geography: no buyer country, no IP, no locale (EU 2018/302,
 * ADR-0006, AC-18).
 */
export async function listAddons(
  countryIso: CountryIso2,
): Promise<readonly Addon[]> {
  const destination = DestinationIsoSchema.parse(countryIso);
  const providers = catalogProviders();
  const [addons, prices] = await Promise.all([
    providers.catalogue.addons(),
    providers.price.addonCountryPrices(),
  ]);

  const offerable: Addon[] = [];
  for (const addon of [...addons].sort(
    (left, right) => left.sort - right.sort,
  )) {
    const rows = prices.filter(
      (row) =>
        row.addonKey === addon.key &&
        row.countryIso2 === destination &&
        row.activeTo === null,
    );
    if (rows.length > 1) {
      throw new Error(
        `\`${addon.key}\` has ${String(rows.length)} active \`addon_country_price\` rows for \`${destination}\`; exactly one is required (spec 002 §14 A1 (a)) — an ambiguous price is never picked silently`,
      );
    }
    const row = rows[0];
    if (row === undefined) continue;

    const flagKey =
      addon.flagPrefix === null
        ? null
        : scopedFlagKey(addon.flagPrefix, destination);
    if (flagKey !== null && !(await isFlagEnabled(flagKey))) continue;

    offerable.push(
      AddonSchema.parse({
        key: addon.key,
        kind: addon.kind,
        nameKey: addon.nameKey,
        descriptionKey: addon.descriptionKey,
        allergenNoteRequired: addon.allergenNoteRequired,
        partnerOnly: addon.partnerOnly,
        flagKey,
        vatRateBp: row.vatRateBp,
        sort: addon.sort,
      }),
    );
  }
  return offerable;
}
