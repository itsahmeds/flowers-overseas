/**
 * The remembered country's prices document, as data (spec 004 §14 A-founder-2026-10-24a item 3
 * "With a remembered country", AC-80, T-86; TASK-391).
 *
 * `/api/prices/{locale}/{iso2}` (`src/app/api/prices/[locale]/[iso2]/route.ts`) serves this
 * view, formatted with the locale's messages, to the deferred island, which fills a country-less
 * page after the paint when `fo_dest` names a shop country. It holds:
 *
 *  - for each core product sold in the country, the **same card** the country's shop root renders
 *    (`productCardView()` at one `now`): the "from" price, its equivalents and its slots, so the
 *    filled card and the shop root's card cannot disagree (AC-80's equality);
 *  - the link map: each `next` a country-less page links through the chooser (the home, every
 *    category and occasion hub, every core product) to that country's version of it,
 *    `countryVersionOf()`'s answer, the chooser's own 303 target. A product the country does not
 *    sell, a price band and the search have no entry: the island writes the path form
 *    `/{locale}/{chooseSegment}/{iso2}/{next}` for those, so the chooser still answers them (the
 *    band's `?price=` never becomes an `<a href>`, spec 008 AC-90).
 *
 * It reads no cookie, header or clock of its own (the caller passes `now`), so one document per
 * (locale, country) is cacheable for everyone. `pnpm check:no-db` covers this file.
 */
import { PRICES_ROUTE_PREFIX } from "@/config/commerce";
import type { CountryIso2 } from "@/config/countries";
import { countryConfig, isCountryIso2 } from "@/config/countries";
import { type LocaleCode, LOCALES, isLocaleCode } from "@/config/locales";
import type { ProductCardView } from "@/modules/ui";

import {
  type ChooserNext,
  chooseSegment,
  chooserNextPath,
  countryVersionOf,
} from "./chooser";
import { listingPages, productCardView } from "./listing";
import { listProducts } from "./read";
import { withCatalogReadScope } from "./read-scope";
import { coreRange, shopCountries } from "./shop";

export interface RememberedPricesView {
  readonly locale: LocaleCode;
  readonly iso2: CountryIso2;
  /** The country's name, as a message key (the registry's). */
  readonly nameKey: string;
  /** `/{locale}/{chooseSegment}`: the prefix every chooser link on a country-less page starts with. */
  readonly chooser: string;
  /** One card per core product sold there, in core-range order. */
  readonly cards: readonly ProductCardView[];
  /** `next` (no leading slash; `""` is the home) to that country's page. */
  readonly links: Readonly<Record<string, string>>;
}

/**
 * The view for `locale` and `iso2`, or `undefined` when `iso2` is not one of the locale's shop
 * countries (the route answers that with a 404, and the island leaves the page as served).
 */
export function rememberedPricesView(
  locale: LocaleCode,
  iso2: string,
  now: Date,
): Promise<RememberedPricesView | undefined> {
  // One read scope for the whole document: a route handler has no render scope, and without it
  // every card re-read the whole price table (TASK-294 carry-forward 1).
  return withCatalogReadScope(() => pricesView(locale, iso2, now));
}

async function pricesView(
  locale: LocaleCode,
  iso2: string,
  now: Date,
): Promise<RememberedPricesView | undefined> {
  const code = iso2.toUpperCase();
  if (!isCountryIso2(code)) return undefined;
  if (!(await shopCountries(locale)).includes(code)) return undefined;

  const sold = new Map(
    (await listProducts({ countryIso: code })).map((product) => [
      product.sku,
      product,
    ]),
  );
  const core = (await coreRange(locale)).flatMap((entry) => {
    const product = sold.get(entry.sku);
    return product === undefined ? [] : [product];
  });
  const cards = await Promise.all(
    core.map((product) =>
      productCardView(product, locale, code, { productLinks: true, now }),
    ),
  );

  const nexts: ChooserNext[] = [
    { locale, kind: "home" },
    ...(await listingPages(locale)).flatMap((page): ChooserNext[] => {
      if (page.entityKey === undefined) return [];
      if (page.pageType === "categoryHub") {
        return [{ locale, kind: "category", key: page.entityKey }];
      }
      if (page.pageType === "occasionHub") {
        return [{ locale, kind: "occasion", key: page.entityKey }];
      }
      return [];
    }),
    ...core.map((product): ChooserNext => ({
      locale,
      kind: "product",
      sku: product.sku,
    })),
  ];
  const links: Record<string, string> = {};
  for (const next of nexts) {
    const version = await countryVersionOf(next, code);
    if (version.kind === "page") links[chooserNextPath(next)] = version.path;
  }

  return {
    locale,
    iso2: code,
    nameKey: countryConfig(code).nameKey,
    chooser: `/${locale}/${chooseSegment(locale)}`,
    cards,
    links,
  };
}

/** One prices document's address and the country whose `catalog:{iso2}` tag it carries. */
export interface PricesDocument {
  readonly locale: LocaleCode;
  readonly iso2: CountryIso2;
  /** `/api/prices/{locale}/{iso2}`, the country code lowercase as `fo_dest` holds it. */
  readonly path: string;
}

/**
 * Every prices document: each launch locale × each of its shop countries. The route's
 * `generateStaticParams` and the cache registry's `catalog:{iso2}` documents (`src/lib/cache.ts`)
 * both read this list, so a document is prebuilt exactly where an invalidation reaches it.
 */
export function pricesDocuments(): Promise<readonly PricesDocument[]> {
  return withCatalogReadScope(listPricesDocuments);
}

async function listPricesDocuments(): Promise<readonly PricesDocument[]> {
  const documents: PricesDocument[] = [];
  for (const { code, isLaunch } of LOCALES) {
    if (!isLaunch || !isLocaleCode(code)) continue;
    for (const country of await shopCountries(code)) {
      if (!isCountryIso2(country)) continue;
      documents.push({
        locale: code,
        iso2: country,
        path: `${PRICES_ROUTE_PREFIX}/${code}/${country.toLowerCase()}`,
      });
    }
  }
  return documents;
}
