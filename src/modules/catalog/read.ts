/**
 * The taxonomy read API (spec 005 §2 "Taxonomy", §5.2 `read.ts`, §5.4, §6; TASK-063).
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
} from "@/config/catalogue/schemas";
import { type CountryIso2, countryConfig } from "@/config/countries";
import type { LocaleCode } from "@/config/locales";
import { isLocaleIndexable, sortBy } from "@/modules/i18n";

import { catalogProviders, type ProductRecord } from "./providers";
import {
  DestinationIsoSchema,
  FacetSearchParamsSchema,
  FacetSelectionSchema,
  ListProductsQuerySchema,
  LocaleCodeSchema,
  PrebuildCountSchema,
  ProductSkuSchema,
} from "./schemas";
import type {
  Category,
  FacetResolution,
  FacetSelection,
  Occasion,
  Product,
  ProductIndexability,
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
    reviewedCopy: PHASE_0_REVIEWED_COPY,
    localeIndexable: isLocaleIndexable(localeCode),
  } as const;

  return {
    ...terms,
    indexable: Object.values(terms).every((term) => term),
  };
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
    const terms = await productIndexability(
      product.sku,
      localeCode,
      destination,
    );
    if (terms.indexable) return true;
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
