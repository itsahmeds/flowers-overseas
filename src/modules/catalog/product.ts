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
import { type CountryIso2, isCountryIso2 } from "@/config/countries";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { corridorSlug } from "@/modules/geo";
import { productPath } from "@/modules/i18n";

import { copyRow } from "./copy";
import {
  isPublishedCountry,
  listingLocales,
  publishedCountries,
} from "./listing";
import {
  getProduct,
  hasActivePrice,
  isProductIndexable,
  listProducts,
  topProductsForPrebuild,
} from "./read";
import { ProductPageIdentitySchema } from "./schemas";
import { hasSlug, slugFor } from "./slugs";
import type { Product } from "./types";

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
