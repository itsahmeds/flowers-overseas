/**
 * The search engine's source, composed from the catalogue, geo and i18n public functions (spec
 * 045 §5.2 "`SearchSource`"; TASK-401).
 *
 * The same reads spec 008's listings make, so a search result and a listing card cannot disagree:
 * a destination's listing set is `listProducts({ countryIso })`, its curation order
 * `topProductsForPrebuild()`, its saleability `availability()`, a card `productCardView()`, and a
 * page link is `listingHref()`'s answer, so it exists or is absent. Whichever catalogue provider is active
 * (the static dataset now, the database after spec 012b's cutover) answers through them, so
 * "static now, database later" needs no switch here (§2.9).
 *
 * **Countries are data.** Every destination comes from the country registry and every word that
 * names one from the catalogues (its name in each launch locale) and the registry (its slugs);
 * nothing here names a country (spec 004 AC-73).
 */
import {
  facetLabelKey,
  flowerTypes,
  occasionKeys,
  productTypes,
} from "@/config/catalogue/schemas";
import {
  COUNTRIES,
  type CountryIso2,
  countrySlug,
  isCountryIso2,
} from "@/config/countries";
import type { LocaleCode } from "@/config/locales";
import { isPublished } from "@/config/site-links";
import {
  type Product,
  availability,
  entityCopy,
  getCategory,
  getOccasion,
  getProduct,
  hasCardPhoto,
  listProducts,
  listingHref,
  productCardView,
  rankBandsFor,
  topProductsForPrebuild,
} from "@/modules/catalog";
import { corridorLinkHref } from "@/modules/geo";
import { launchLocaleCodes, loadMessages } from "@/modules/i18n";
import type { ProductCardView } from "@/modules/ui";

import { searchLanguage } from "./text";
import type {
  SearchDestination,
  SearchHub,
  SearchLabel,
  SearchProduct,
  SearchSource,
} from "./types";

type MessageTree = Readonly<Record<string, unknown>>;
type Namespace = Parameters<typeof loadMessages>[1][number];

/**
 * One build's memo. Every read below is asked many times per build (a label in four locales for
 * every product of seven destinations), and each is a pure function of the catalogue at that
 * moment, so it is cached for the life of one source; the engine asks `catalogSearchSource()` for
 * a fresh source per build, so nothing outlives the build that read it.
 */
interface Memo {
  readonly messages: Map<string, MessageTree>;
  readonly labels: Map<string, readonly string[]>;
  readonly listed: Map<string, Promise<readonly Product[]>>;
  readonly saleable: Map<string, Promise<boolean>>;
  readonly hubs: Map<string, Promise<readonly SearchHub[]>>;
}

function newMemo(): Memo {
  return {
    messages: new Map(),
    labels: new Map(),
    listed: new Map(),
    saleable: new Map(),
    hubs: new Map(),
  };
}

function remember<T>(map: Map<string, T>, key: string, read: () => T): T {
  const cached = map.get(key);
  if (cached !== undefined) return cached;
  const value = read();
  map.set(key, value);
  return value;
}

/** The message at a dotted key in one locale's merged catalogue, or `undefined`. */
function messageAt(
  memo: Memo,
  locale: LocaleCode,
  key: string,
): string | undefined {
  const [namespace, ...path] = key.split(".");
  if (namespace === undefined) return undefined;
  const catalogue = remember(
    memo.messages,
    `${locale}|${namespace}`,
    () => loadMessages(locale, [namespace as Namespace]) as MessageTree,
  );
  let node: unknown = catalogue[namespace];
  for (const part of path) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as MessageTree)[part];
  }
  return typeof node === "string" ? node : undefined;
}

function launchCodes(): LocaleCode[] {
  return launchLocaleCodes() as LocaleCode[];
}

/**
 * A product's facet labels in one locale (§2.3): its flower types, colours, occasions and product
 * type, each by its category or occasion copy (`Róże`, `Geburtstag`) and by its facet label, plus
 * the occasion categories it belongs to (`Birthday flowers`).
 */
function facetLabels(
  memo: Memo,
  product: Product,
  locale: LocaleCode,
): readonly string[] {
  return remember(memo.labels, `${product.sku}|${locale}`, () => {
    const labels = new Set<string>();
    const add = (text: string | undefined): void => {
      if (text !== undefined && text.trim() !== "") labels.add(text);
    };
    const facet = (key: string): string | undefined =>
      messageAt(memo, locale, key);
    add(entityCopy("category", product.productType, locale)?.name);
    add(facet(facetLabelKey("productType", product.productType)));
    for (const flower of product.flowerTypes) {
      add(entityCopy("category", flower, locale)?.name);
      add(facet(facetLabelKey("flowerType", flower)));
    }
    for (const colour of product.colours) {
      add(facet(facetLabelKey("colour", colour)));
    }
    for (const occasion of product.occasions) {
      add(entityCopy("occasion", occasion, locale)?.name);
      add(entityCopy("category", occasion, locale)?.name);
      add(facet(facetLabelKey("occasion", occasion)));
    }
    return [...labels];
  });
}

/** The other launch languages' labels: the alt field (one locale per language). */
function altLabels(
  memo: Memo,
  product: Product,
  locale: LocaleCode,
): SearchLabel[] {
  const own = searchLanguage(locale);
  const seen = new Set<string>([own]);
  const labels: SearchLabel[] = [];
  for (const other of launchCodes()) {
    const language = searchLanguage(other);
    if (seen.has(language)) continue;
    seen.add(language);
    for (const text of facetLabels(memo, product, other)) {
      labels.push({ locale: other, text });
    }
  }
  return labels;
}

function destinationIso2(iso2: string): CountryIso2 {
  if (!isCountryIso2(iso2)) {
    throw new Error(`\`${iso2}\` is not a configured destination`);
  }
  return iso2;
}

const HUB_PAGES = {
  occasion: { country: "countryOccasion", hub: "occasionHub" },
  category: { country: "countryCategory", hub: "categoryHub" },
} as const;

/** The category keys the taxonomy allows: product types, occasions and flower types. */
const CATEGORY_KEYS: readonly string[] = [
  ...new Set<string>([...productTypes, ...occasionKeys, ...flowerTypes]),
];

/**
 * Every occasion and category the catalogue has, with its label in every launch locale; only
 * those with copy in the request locale (a link needs words to read).
 */
async function hubsFor(locale: LocaleCode): Promise<SearchHub[]> {
  const hubs: SearchHub[] = [];
  const entities: { kind: SearchHub["kind"]; key: string }[] = [];
  for (const key of occasionKeys) {
    if ((await getOccasion(key)) !== null)
      entities.push({ kind: "occasion", key });
  }
  for (const key of CATEGORY_KEYS) {
    if ((await getCategory(key)) !== null)
      entities.push({ kind: "category", key });
  }
  for (const { kind, key } of entities) {
    const label = entityCopy(kind, key, locale)?.name;
    if (label === undefined) continue;
    const labels: SearchLabel[] = [];
    for (const other of launchCodes()) {
      const name = entityCopy(kind, key, other)?.name;
      if (name !== undefined) labels.push({ locale: other, text: name });
    }
    hubs.push({ kind, key, label, labels });
  }
  return hubs;
}

/**
 * The catalogue-backed source. Each call returns a fresh source with an empty memo; the engine
 * takes the factory and asks for one per build, so a rebuild after `invalidate()` reads the
 * catalogue again rather than a previous build's answers.
 */
export function catalogSearchSource(): SearchSource {
  const memo = newMemo();
  const listed = (iso2: CountryIso2): Promise<readonly Product[]> =>
    remember(memo.listed, iso2, () => listProducts({ countryIso: iso2 }));
  const saleable = (sku: string, iso2: CountryIso2): Promise<boolean> =>
    remember(memo.saleable, `${sku}|${iso2}`, () =>
      availability({ productId: sku, countryIso: iso2 }).then(
        (verdict) => verdict.saleable,
      ),
    );

  return {
    locales: launchCodes,

    destinations(locale) {
      return Promise.all(
        COUNTRIES.map(async (country): Promise<SearchDestination> => {
          const iso2 = country.iso2;
          const words = new Set<string>();
          for (const other of launchCodes()) {
            const name = messageAt(memo, other, country.nameKey);
            if (name !== undefined) words.add(name);
            words.add(countrySlug(iso2, other));
          }
          return {
            iso2,
            words: [...words],
            shopHref: await listingHref({
              pageType: "countryShopRoot",
              locale,
              countryIso: iso2,
            }),
            corridorHref: corridorLinkHref(iso2, locale),
          };
        }),
      );
    },

    async products(locale, iso2) {
      const countryIso = destinationIso2(iso2);
      const products = await listed(countryIso);
      const order = await topProductsForPrebuild(
        countryIso,
        locale,
        Math.max(products.length, 1),
      );
      const curation = new Map(
        order.map((product, index) => [product.sku, index]),
      );
      return Promise.all(
        products.map(async (product): Promise<SearchProduct> => {
          const copy = entityCopy("product", product.sku, locale);
          return {
            sku: product.sku,
            name: copy?.name ?? product.name,
            facetLabels: facetLabels(memo, product, locale),
            altLabels: altLabels(memo, product, locale),
            description: copy?.description ?? "",
            hasPhoto: hasCardPhoto(product.sku, locale),
            curationIndex: curation.get(product.sku) ?? order.length,
            saleable: await saleable(product.sku, countryIso),
          };
        }),
      );
    },

    hubs(locale) {
      return remember(memo.hubs, locale, () => hubsFor(locale));
    },

    async hubHref(locale, iso2, hub) {
      const pages = HUB_PAGES[hub.kind];
      if (iso2 !== undefined && isCountryIso2(iso2)) {
        const country = await listingHref({
          pageType: pages.country,
          locale,
          countryIso: iso2,
          entityKey: hub.key,
        });
        if (country !== undefined) return country;
      }
      return listingHref({ pageType: pages.hub, locale, entityKey: hub.key });
    },

    rankBands(iso2) {
      return rankBandsFor(destinationIso2(iso2));
    },

    async cards(locale, iso2, skus) {
      const countryIso = destinationIso2(iso2);
      const productLinks = isPublished("product");
      const now = new Date();
      const cards: ProductCardView[] = [];
      for (const sku of skus) {
        const product = await getProduct(sku);
        if (product === null) continue;
        cards.push(
          await productCardView(product, locale, countryIso, {
            productLinks,
            now,
          }),
        );
      }
      return cards;
    },
  };
}
