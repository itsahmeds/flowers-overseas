/**
 * `megaMenuModel(locale, iso2 | null)`: the mega menu out of and in a country's context (spec 004
 * §14 A-founder-2026-10-24a item 5; spec 043 AC-2, AC-3, AC-6, AC-50; TASK-383).
 *
 * Built **only from the existence functions, the taxonomy and the registries**, so an entry whose
 * page does not answer 200 is not drawn (A20) and adding a country or a hub is data, never a code
 * change (AC-73: nothing here names a country). Every input arrives through `MegaMenuData`, whose
 * committed value reads the catalogue; a test hands in its own existence rule (AC-100's removal
 * fixture) with no module mocking.
 *
 * **Out of context** (`iso2` null, or a country with no shop root in the locale): hub entries are
 * plain links to the country-less hubs (so every hub keeps an out-of-context inbound link: spec 043
 * AC-6), shop entries (a colour, a price band, "All flowers", a featured card) are chooser links,
 * path only, and the featured cards are core products with no price (item 2).
 *
 * **In context** (a URL naming country X with a shop, spec 043 §5.3 A): each hub entry becomes X's
 * country page of the same key (`hubDestinationHref()`, the hub's own destination row, so the menu
 * and the hub cannot disagree), and an entry with no such page in X is absent; colour and price
 * entries are GET forms to X's shop root with the facet; "All flowers" is X's shop root; featured
 * products are X's (core or not) at X's exact price, linking X's product pages (AC-50).
 *
 * The model is the same for every visitor and reads no header, cookie or IP: the route decides the
 * context from its own URL (`pageDestination()`), and the clock is the render's (build or
 * revalidation), the way the listing views read it. It is memoised per locale, context and day,
 * because the header renders on every page of a build.
 */
import {
  MEGA_ALL_LABEL_KEYS,
  MEGA_COLOUR_MIN_PRODUCTS,
  MEGA_COLUMN_HEADING_KEYS,
  MEGA_COMING_UP_COUNT,
  MEGA_COMING_UP_MONTHS,
  MEGA_EVERY_DAY_EXCLUDED,
  MEGA_EXTRAS_HEADING_KEY,
  MEGA_FLOWERS_TYPE_EXCLUDED,
  MEGA_MENU_ITEM_LABEL_KEYS,
  MEGA_PLANTS_FEATURED_TYPE,
  MEGA_PLANTS_GIFTS_HUBS,
  MEGA_PRICE_BAND_LABEL_KEYS,
  MEGA_SYMPATHY_HUBS,
  MEGA_SYMPATHY_OCCASION,
  RECIPIENT_GROUPS,
  type MegaColumnId,
} from "@/config/mega-menu";
import { PRICE_BAND_KEYS } from "@/config/commerce";
import { FACET_PARAMETERS, colours } from "@/config/catalogue/schemas";
import {
  type CountryIso2,
  countryConfig,
  deliveryDatesOpen,
  isCountryIso2,
} from "@/config/countries";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { isPublished } from "@/config/site-links";
import { QUERY_KEY } from "@/config/url-keys";
import { listCorridorPages, upcomingOccasions } from "@/modules/geo";
import { localePath } from "@/modules/i18n";
import {
  type ListingCardView,
  type MegaColumn,
  type MegaEntry,
  type MegaFeatured,
  type MegaMenuModel,
  MegaMenuModelSchema,
  type MegaPanel,
} from "@/modules/ui";

import { chooserPath } from "./chooser";
import { orderCountries } from "./country-order";
import {
  PRODUCT_COUNT_FLOOR,
  hubCardView,
  hubDestinationHref,
  listingAlternatePaths,
  occasionsIndexHref,
  productCardView,
} from "./listing";
import { productPageExists } from "./product";
import { catalogProviders } from "./providers";
import { listProducts } from "./read";
import { corridorShopEntry } from "./shop-entry";
import {
  type ShopData,
  committedShopData,
  coreRange,
  shopCountries,
} from "./shop";
import type { Product } from "./types";

type HubKind = "category" | "occasion";

/** A taxonomy row as the menu reads it. */
export interface MegaTaxonomyRow {
  readonly key: string;
  readonly kind: string;
  readonly labelKey: string;
  readonly sort: number;
}

/** A corridor guide as the Destinations panel reads it. */
export interface MegaCorridor {
  readonly iso2: string;
  readonly path: string;
  readonly nameKey: string;
  /** Ordering open there (`deliveryDatesOpen()`), never a status string (the board's escalation). */
  readonly open: boolean;
  readonly sortWeight: number;
}

/**
 * Everything `megaMenuModel()` reads. The committed value (`committedMegaMenuData`) is the
 * catalogue, the registries and the existence functions; a fixture replaces any part.
 */
export interface MegaMenuData {
  readonly shop: ShopData;
  readonly categories: () => Promise<readonly MegaTaxonomyRow[]>;
  readonly occasions: () => Promise<readonly MegaTaxonomyRow[]>;
  /** The country-less hub's path in this locale, or `undefined` where it does not exist. */
  readonly hubPath: (
    locale: LocaleCode,
    kind: HubKind,
    key: string,
  ) => Promise<string | undefined>;
  /** X's page of the same key (the hub's own destination row), or `undefined`. */
  readonly countryHubPath: (
    locale: LocaleCode,
    kind: HubKind,
    key: string,
    iso2: CountryIso2,
  ) => Promise<string | undefined>;
  /** X's shop root in this locale, or `undefined` (then the page is out of context). */
  readonly shopRoot: (
    locale: LocaleCode,
    iso2: CountryIso2,
  ) => Promise<string | undefined>;
  readonly occasionsIndex: (locale: LocaleCode) => Promise<string | undefined>;
  readonly destinationsHub: (locale: LocaleCode) => string | undefined;
  readonly corridors: (locale: LocaleCode) => readonly MegaCorridor[];
  /** One destination's dated occasions from `from` for `months`, in date order. */
  readonly datedOccasions: (
    iso2: string,
    from: string,
    months: number,
  ) => readonly { readonly occasionKey: string; readonly date: string }[];
  /** Every active product. */
  readonly products: () => Promise<readonly Product[]>;
  /** Does X sell this product (its product page exists)? */
  readonly saleableIn: (
    sku: string,
    iso2: CountryIso2,
    locale: LocaleCode,
  ) => Promise<boolean>;
  /** The add-ons' name keys, in data order. */
  readonly addonNameKeys: () => Promise<readonly string[]>;
  readonly countryLessCard: (
    product: Product,
    locale: LocaleCode,
  ) => Promise<ListingCardView>;
  readonly countryCard: (
    product: Product,
    locale: LocaleCode,
    iso2: CountryIso2,
    now: Date,
  ) => Promise<ListingCardView & { readonly href?: string | undefined }>;
}

/** The catalogue, the registries and the existence functions as committed. */
export const committedMegaMenuData: MegaMenuData = {
  shop: committedShopData,
  categories: () => catalogProviders().catalogue.categories(),
  occasions: () => catalogProviders().catalogue.occasions(),
  hubPath: async (locale, kind, key) =>
    (
      await listingAlternatePaths({
        pageType: kind === "category" ? "categoryHub" : "occasionHub",
        entityKey: key,
        locale,
      })
    )[locale],
  countryHubPath: (locale, kind, key, iso2) =>
    hubDestinationHref(locale, { kind, entityKey: key }, iso2),
  shopRoot: async (locale, iso2) =>
    (await corridorShopEntry(locale, iso2)).shopEntryHref,
  occasionsIndex: (locale) => occasionsIndexHref(locale),
  destinationsHub: (locale) =>
    isPublished("destinations")
      ? localePath(locale, "destinations")
      : undefined,
  corridors: (locale) =>
    listCorridorPages()
      .filter((page) => page.locale === locale && isCountryIso2(page.iso2))
      .map((page) => {
        const iso2 = page.iso2 as CountryIso2;
        const config = countryConfig(iso2);
        return {
          iso2,
          path: localePath(locale, "destinations", page.slug),
          nameKey: config.nameKey,
          open: deliveryDatesOpen(iso2),
          sortWeight: config.sortWeight,
        };
      }),
  datedOccasions: (iso2, from, months) => upcomingOccasions(iso2, from, months),
  products: () => listProducts(),
  saleableIn: (sku, iso2, locale) =>
    productPageExists({ sku, countryIso: iso2, locale }),
  addonNameKeys: async () =>
    (await catalogProviders().catalogue.addons()).map((addon) => addon.nameKey),
  countryLessCard: (product, locale) => hubCardView(product, locale),
  countryCard: (product, locale, iso2, now) =>
    productCardView(product, locale, iso2, { productLinks: true, now }),
};

/** Options for one build of the model. */
export interface MegaMenuOptions {
  /** The render's clock (build or revalidation); "Coming up" counts from its UTC date. */
  readonly now?: Date;
  readonly data?: MegaMenuData;
}

/** The context the model was asked for, resolved: a country with a shop root here, or none. */
interface Context {
  readonly iso2: CountryIso2;
  readonly shopRoot: string;
}

function link(
  id: string,
  labelKey: string,
  href: string,
  date?: string,
): MegaEntry {
  return date === undefined
    ? { kind: "link", id, labelKey, href }
    : { kind: "link", id, labelKey, href, date };
}

function column(
  id: MegaColumnId,
  entries: readonly MegaEntry[],
  wide = false,
): MegaColumn[] {
  return entries.length === 0
    ? []
    : [
        {
          id,
          headingKey: MEGA_COLUMN_HEADING_KEYS[id],
          entries: [...entries],
          wide,
        },
      ];
}

/** A hub entry: the country-less hub out of context, X's page of the same key in context. */
async function hubEntry(
  locale: LocaleCode,
  context: Context | null,
  data: MegaMenuData,
  hub: { readonly kind: HubKind; readonly key: string },
  labelKey: string,
  id: string = `${hub.kind}:${hub.key}`,
  date?: string,
): Promise<MegaEntry | undefined> {
  const href =
    context === null
      ? await data.hubPath(locale, hub.kind, hub.key)
      : await data.countryHubPath(locale, hub.kind, hub.key, context.iso2);
  return href === undefined ? undefined : link(id, labelKey, href, date);
}

function present<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function bySort(left: MegaTaxonomyRow, right: MegaTaxonomyRow): number {
  return left.sort - right.sort || left.key.localeCompare(right.key, "en");
}

/** The UTC calendar date of the render's one clock reading. */
function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The products a panel may feature, in "Our order": out of context the core range in rank order
 * (item 1: nothing else shows before a country is chosen); in context the products X sells, the
 * core range first in rank order, then every other product by SKU (spec 043 AC-50: X's own, core
 * or not). Until spec 045's ranking signal exists every band is 0, so rank order decides.
 */
async function featurable(
  locale: LocaleCode,
  context: Context | null,
  data: MegaMenuData,
): Promise<readonly Product[]> {
  const products = await data.products();
  const bySku = new Map(products.map((product) => [product.sku, product]));
  const core = (await coreRange(locale, data.shop))
    .map((entry) => bySku.get(entry.sku))
    .filter(present);
  if (context === null) return core;
  const coreSkus = new Set(core.map((product) => product.sku));
  const rest = products
    .filter((product) => !coreSkus.has(product.sku))
    .sort((left, right) => left.sku.localeCompare(right.sku, "en"));
  const sold: Product[] = [];
  for (const product of [...core, ...rest]) {
    if (await data.saleableIn(product.sku, context.iso2, locale)) {
      sold.push(product);
    }
  }
  return sold;
}

async function featuredCard(
  locale: LocaleCode,
  context: Context | null,
  data: MegaMenuData,
  product: Product | undefined,
  now: Date,
): Promise<MegaFeatured | null> {
  if (product === undefined) return null;
  if (context === null) {
    return {
      card: await data.countryLessCard(product, locale),
      href: chooserPath(locale, { locale, kind: "product", sku: product.sku }),
      chooser: true,
    };
  }
  const card = await data.countryCard(product, locale, context.iso2, now);
  if (card.href === undefined) return null;
  return { card, href: card.href, chooser: false };
}

/**
 * The colours of "By colour", in drawing order. Out of context: each colour at least
 * `MEGA_COLOUR_MIN_PRODUCTS` core products carry (item 5). In context: each colour whose facet on
 * X's shop root would hold at least the listing floor (`PRODUCT_COUNT_FLOOR`) of X's products, so
 * a colour never leads to a thin result. Ordered by how many core products carry it, then by the
 * taxonomy's colour order (the board: White, Pink, Orange, then Pastel and Mixed in context).
 */
function colourKeys(
  core: readonly Product[],
  sold: readonly Product[] | null,
): readonly string[] {
  const count = (products: readonly Product[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const product of products) {
      for (const colour of new Set(product.colours)) {
        counts.set(colour, (counts.get(colour) ?? 0) + 1);
      }
    }
    return counts;
  };
  const coreCounts = count(core);
  const listed =
    sold === null
      ? [...coreCounts.entries()]
          .filter(([, n]) => n >= MEGA_COLOUR_MIN_PRODUCTS)
          .map(([colour]) => colour)
      : [...count(sold).entries()]
          .filter(([, n]) => n >= PRODUCT_COUNT_FLOOR)
          .map(([colour]) => colour);
  const order: readonly string[] = colours;
  return listed.sort(
    (left, right) =>
      (coreCounts.get(right) ?? 0) - (coreCounts.get(left) ?? 0) ||
      order.indexOf(left) - order.indexOf(right),
  );
}

/** A shop entry: the chooser out of context, a GET form to X's shop root in context. */
function shopEntry(
  locale: LocaleCode,
  context: Context | null,
  entry: {
    readonly id: string;
    readonly labelKey: string;
    readonly next: string;
    readonly facet: { readonly name: string; readonly value: string };
  },
): MegaEntry {
  return context === null
    ? {
        kind: "chooser",
        id: entry.id,
        labelKey: entry.labelKey,
        href: chooserPath(locale, entry.next),
      }
    : {
        kind: "facet",
        id: entry.id,
        labelKey: entry.labelKey,
        action: context.shopRoot,
        name: entry.facet.name,
        value: entry.facet.value,
      };
}

/** The "All flowers" entry: the chooser with an empty `next`, or X's shop root. */
function allFlowers(locale: LocaleCode, context: Context | null): MegaEntry {
  return context === null
    ? {
        kind: "chooser",
        id: "all-flowers",
        labelKey: MEGA_ALL_LABEL_KEYS.flowers,
        href: chooserPath(locale, ""),
      }
    : link("all-flowers", MEGA_ALL_LABEL_KEYS.flowers, context.shopRoot);
}

async function flowersPanel(
  locale: LocaleCode,
  context: Context | null,
  data: MegaMenuData,
  featured: readonly Product[],
  core: ReadonlySet<string>,
  now: Date,
): Promise<MegaPanel> {
  const categories = [...(await data.categories())].sort(bySort);
  const ofKind = async (kind: string, excluded: readonly string[] = []) =>
    (
      await Promise.all(
        categories
          .filter((row) => row.kind === kind && !excluded.includes(row.key))
          .map((row) =>
            hubEntry(
              locale,
              context,
              data,
              { kind: "category", key: row.key },
              row.labelKey,
            ),
          ),
      )
    ).filter(present);
  const byType = await ofKind("productType", MEGA_FLOWERS_TYPE_EXCLUDED);
  const byFlower = await ofKind("flowerType");
  // A colour has no category hub today, so its `next` is the shop root (item 5; the colour-shape
  // escalation on TASK-381 and the board). Counted over the products this page may show.
  const byColour = colourKeys(
    featured.filter((product) => core.has(product.sku)),
    context === null ? null : featured,
  ).map((colour) =>
    shopEntry(locale, context, {
      id: `colour:${colour}`,
      labelKey: `catalog.facet.colour.${colour}`,
      next: "",
      facet: { name: FACET_PARAMETERS.colour, value: colour },
    }),
  );
  return {
    id: "flowers",
    labelKey: MEGA_MENU_ITEM_LABEL_KEYS.flowers,
    columns: [
      ...column("byType", byType),
      ...column("byFlower", byFlower, byFlower.length > 5),
      ...column("byColour", byColour),
    ],
    all: allFlowers(locale, context),
    extras: null,
    featured: await featuredCard(locale, context, data, featured[0], now),
  };
}

/** The dated occasions "Coming up" may list, each with its earliest date, in date order. */
function datedAcross(
  countries: readonly string[],
  from: string,
  data: MegaMenuData,
): readonly { readonly occasionKey: string; readonly date: string }[] {
  const earliest = new Map<string, string>();
  for (const iso2 of countries) {
    for (const dated of data.datedOccasions(
      iso2,
      from,
      MEGA_COMING_UP_MONTHS,
    )) {
      const seen = earliest.get(dated.occasionKey);
      if (seen === undefined || dated.date < seen) {
        earliest.set(dated.occasionKey, dated.date);
      }
    }
  }
  return [...earliest.entries()]
    .map(([occasionKey, date]) => ({ occasionKey, date }))
    .sort((left, right) =>
      left.date === right.date
        ? left.occasionKey.localeCompare(right.occasionKey, "en")
        : left.date.localeCompare(right.date),
    );
}

async function occasionsPanel(
  locale: LocaleCode,
  context: Context | null,
  data: MegaMenuData,
  featured: readonly Product[],
  core: ReadonlySet<string>,
  now: Date,
): Promise<MegaPanel> {
  const occasions = [...(await data.occasions())].sort(bySort);
  const labelOf = new Map(occasions.map((row) => [row.key, row.labelKey]));
  const everyDay = (
    await Promise.all(
      occasions
        .filter(
          (row) =>
            row.kind === "evergreen" &&
            !MEGA_EVERY_DAY_EXCLUDED.includes(row.key),
        )
        .map((row) =>
          hubEntry(
            locale,
            context,
            data,
            { kind: "occasion", key: row.key },
            row.labelKey,
          ),
        ),
    )
  ).filter(present);
  const forWhom = (
    await Promise.all(
      RECIPIENT_GROUPS.map((group) =>
        hubEntry(
          locale,
          context,
          data,
          { kind: "occasion", key: group.occasionKey },
          group.labelKey,
          `recipient:${group.id}`,
        ),
      ),
    )
  ).filter(present);
  // Out of context: across every shop country, each occasion at its earliest date. In context:
  // X's own calendar, each linking X's page of that occasion.
  const countries =
    context === null ? await shopCountries(locale, data.shop) : [context.iso2];
  const dated = datedAcross(countries, todayIso(now), data);
  const comingUp: MegaEntry[] = [];
  for (const { occasionKey, date } of dated) {
    if (comingUp.length === MEGA_COMING_UP_COUNT) break;
    const labelKey = labelOf.get(occasionKey);
    if (labelKey === undefined) continue;
    const entry = await hubEntry(
      locale,
      context,
      data,
      { kind: "occasion", key: occasionKey },
      labelKey,
      `coming-up:${occasionKey}`,
      date,
    );
    if (entry !== undefined) comingUp.push(entry);
  }
  // The featured card: the first featurable product of the next dated occasion that has one (the
  // board's reading of item 5's "the first core product of the next dated occasion", which finds
  // nothing when the next occasion carries no core product).
  // Core products are looked for first in context too, so the card is the same bouquet the
  // country-less menu features wherever the country sells it (the board's frames 5 and 6).
  const carries = (product: Product, key: string): boolean =>
    (product.occasions as readonly string[]).includes(key);
  const firstFor = (candidates: readonly Product[]): Product | undefined => {
    for (const { occasionKey } of dated) {
      const found = candidates.find((product) => carries(product, occasionKey));
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const pick =
    firstFor(featured.filter((product) => core.has(product.sku))) ??
    firstFor(featured);
  const index = await data.occasionsIndex(locale);
  return {
    id: "occasions",
    labelKey: MEGA_MENU_ITEM_LABEL_KEYS.occasions,
    columns: [
      ...column("everyDay", everyDay, true),
      ...column("forWhom", forWhom),
      ...column("comingUp", comingUp),
    ],
    all:
      index === undefined
        ? null
        : link("all-occasions", MEGA_ALL_LABEL_KEYS.occasions, index),
    extras: null,
    featured: await featuredCard(locale, context, data, pick, now),
  };
}

async function sympathyPanel(
  locale: LocaleCode,
  context: Context | null,
  data: MegaMenuData,
  featured: readonly Product[],
  now: Date,
): Promise<MegaPanel> {
  const [categories, occasions] = await Promise.all([
    data.categories(),
    data.occasions(),
  ]);
  const labelOf = (kind: HubKind, key: string): string | undefined =>
    (kind === "category" ? categories : occasions).find(
      (row) => row.key === key,
    )?.labelKey;
  const entries = (
    await Promise.all(
      MEGA_SYMPATHY_HUBS.map(async (hub) => {
        const labelKey = labelOf(hub.kind, hub.key);
        return labelKey === undefined
          ? undefined
          : hubEntry(locale, context, data, hub, labelKey);
      }),
    )
  ).filter(present);
  return {
    id: "sympathy",
    labelKey: MEGA_MENU_ITEM_LABEL_KEYS.sympathy,
    columns: column("sympathy", entries),
    all: null,
    extras: null,
    featured: await featuredCard(
      locale,
      context,
      data,
      featured.find((product) =>
        (product.occasions as readonly string[]).includes(
          MEGA_SYMPATHY_OCCASION,
        ),
      ),
      now,
    ),
  };
}

async function plantsGiftsPanel(
  locale: LocaleCode,
  context: Context | null,
  data: MegaMenuData,
  featured: readonly Product[],
  now: Date,
): Promise<MegaPanel> {
  const categories = await data.categories();
  const entries = (
    await Promise.all(
      MEGA_PLANTS_GIFTS_HUBS.map(async (hub) => {
        const labelKey = categories.find(
          (row) => row.key === hub.key,
        )?.labelKey;
        return labelKey === undefined
          ? undefined
          : hubEntry(locale, context, data, hub, labelKey);
      }),
    )
  ).filter(present);
  const addons = await data.addonNameKeys();
  return {
    id: "plantsGifts",
    labelKey: MEGA_MENU_ITEM_LABEL_KEYS.plantsGifts,
    columns: column("plantsGifts", entries),
    all: null,
    extras:
      addons.length === 0
        ? null
        : { headingKey: MEGA_EXTRAS_HEADING_KEY, labelKeys: [...addons] },
    featured: await featuredCard(
      locale,
      context,
      data,
      featured.find(
        (product) => product.productType === MEGA_PLANTS_FEATURED_TYPE,
      ),
      now,
    ),
  };
}

function byPricePanel(locale: LocaleCode, context: Context | null): MegaPanel {
  // Word labels in both contexts: a band's amounts are `priceBands()`'s (spec 008's amendment,
  // TASK-390), and no amount shows before a country (item 2).
  const entries = PRICE_BAND_KEYS.map((band) =>
    shopEntry(locale, context, {
      id: `price:${band}`,
      labelKey: MEGA_PRICE_BAND_LABEL_KEYS[band],
      next: `price/${band}`,
      facet: { name: QUERY_KEY.price, value: band },
    }),
  );
  return {
    id: "byPrice",
    labelKey: MEGA_MENU_ITEM_LABEL_KEYS.byPrice,
    columns: column("byPrice", entries),
    all: null,
    extras: null,
    featured: null,
  };
}

function destinationsPanel(locale: LocaleCode, data: MegaMenuData): MegaPanel {
  // Each entry names its country, so each is a direct link in both contexts (item 3). "Ordering
  // open" keys on `deliveryDatesOpen()` (the board's escalation): today every guide is "Opening
  // soon", and a country moves up the day its dates open, with no code change.
  const corridors = orderCountries(data.corridors(locale), locale);
  const entry = (corridor: MegaCorridor): MegaEntry =>
    link(`destination:${corridor.iso2}`, corridor.nameKey, corridor.path);
  const open = corridors.filter((corridor) => corridor.open).map(entry);
  const soon = corridors.filter((corridor) => !corridor.open).map(entry);
  const hub = data.destinationsHub(locale);
  return {
    id: "destinations",
    labelKey: MEGA_MENU_ITEM_LABEL_KEYS.destinations,
    columns: [
      ...column("open", open, open.length > 5),
      ...column("soon", soon, soon.length > 5),
    ],
    all:
      hub === undefined
        ? null
        : link("all-destinations", MEGA_ALL_LABEL_KEYS.destinations, hub),
    extras: null,
    featured: null,
  };
}

function hasContent(panel: MegaPanel): boolean {
  return panel.columns.length > 0 || panel.all !== null;
}

async function resolveContext(
  locale: LocaleCode,
  iso2: string | null,
  data: MegaMenuData,
): Promise<Context | null> {
  if (iso2 === null || !isCountryIso2(iso2)) return null;
  const shopRoot = await data.shopRoot(locale, iso2);
  return shopRoot === undefined ? null : { iso2, shopRoot };
}

async function buildModel(
  locale: LocaleCode,
  iso2: string | null,
  now: Date,
  data: MegaMenuData,
): Promise<MegaMenuModel> {
  const context = await resolveContext(locale, iso2, data);
  const core = new Set(
    (await coreRange(locale, data.shop)).map((entry) => entry.sku),
  );
  const featured = await featurable(locale, context, data);
  const panels = [
    await flowersPanel(locale, context, data, featured, core, now),
    await occasionsPanel(locale, context, data, featured, core, now),
    await sympathyPanel(locale, context, data, featured, now),
    await plantsGiftsPanel(locale, context, data, featured, now),
    byPricePanel(locale, context),
    destinationsPanel(locale, data),
  ].filter(hasContent);
  return MegaMenuModelSchema.parse({
    context: context?.iso2 ?? null,
    panels,
  });
}

const memo = new Map<string, Promise<MegaMenuModel>>();

/**
 * The mega menu for one locale and context (item 5). `iso2` is the URL's country
 * (`pageDestination()`), or `null`; a country with no shop root here is out of context. A
 * pseudo-locale or an unknown code has no listing page, so it gets an empty menu.
 */
export async function megaMenuModel(
  locale: string,
  iso2: string | null,
  options: MegaMenuOptions = {},
): Promise<MegaMenuModel> {
  if (!isLocaleCode(locale)) return { context: null, panels: [] };
  const now = options.now ?? new Date();
  if (options.data !== undefined) {
    return buildModel(locale, iso2, now, options.data);
  }
  const key = `${locale}|${iso2 ?? "-"}|${todayIso(now)}`;
  let built = memo.get(key);
  if (built === undefined) {
    built = buildModel(locale, iso2, now, committedMegaMenuData);
    memo.set(key, built);
    built.catch(() => memo.delete(key));
  }
  return built;
}
