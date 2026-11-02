/**
 * The locale home's model, products first (spec 004 §14 A-founder-2026-10-24a items 2, 3 and 4;
 * AC-92, AC-95 to AC-98, AC-107; TASK-386, TASK-387;
 * `docs/design/wireframes/home-desktop.dc.html` and `home-mobile.dc.html`, v3).
 *
 * Every product on the home is a **country-less core card**: its photograph, its name, "Choose a
 * country to see the price" and one link through the chooser (`next=product/{slug}`). No price,
 * no currency and no delivery slot is read here, because none may be shown before a country is
 * chosen (the founder's "b", 2026-10-24); the card's view model has no field one could arrive in.
 *
 * The sections, in DOM order, each answered from data:
 *
 *  - **The picker** (item 4.2): the chooser's form with an empty `next`, its buttons the first
 *    `PICKER_CHIPS` shop countries in the one country order, its `<datalist>` every registry
 *    country. The same `chooserPageView()` the chooser page reads, so the two cannot disagree.
 *  - **Our selection** (item 4.3, the orchestrator's design call of 2026-10-24): the whole core
 *    range in rank order ("Our order" while every band is 0), so AC-95 holds from this section.
 *  - **Shop by occasion** (item 4.4): a tab per `HOME_OCCASION_TABS` key that at least
 *    `HOME_SECTION_MIN_PRODUCTS` core products carry, up to `HOME_TAB_CARDS` cards each, and the
 *    occasion hub (a country-less page, so a plain link) where it exists.
 *  - **Shop by price** (item 4.5): the three bands as chooser links, `next=price/{band}`; no
 *    amount, because a band's amounts are a country's.
 *  - **Coming up** (item 4.6): the next `HOME_COMING_UP.occasions` dated occasions observed in any
 *    shop country that enough core products carry, each at its earliest date, with the shop
 *    countries keeping it that day.
 *
 * **The dedupe rule** (item 4, AC-98) is `dedupeSection()`: a later section skips a product already
 * displayed above it while enough others remain to fill its slots, and repeats one otherwise.
 *
 * Nothing here reads a header, a cookie or an IP, and nothing names a country (AC-73): the shop
 * set, the core range and the calendar are the registries'.
 */
import {
  HOME_COMING_UP,
  HOME_COMING_UP_MONTHS,
  HOME_OCCASION_TABS,
  HOME_SECTION_MIN_PRODUCTS,
  HOME_TAB_CARDS,
  PICKER_CHIPS,
  PRICE_BAND_KEYS,
} from "@/config/commerce";
import {
  anyDeliveryDatesOpen,
  countryConfig,
  isCountryIso2,
} from "@/config/countries";
import type { LocaleCode } from "@/config/locales";
import { isPublished, listingLinkId } from "@/config/site-links";
import { type DatedOccasion, upcomingOccasions } from "@/modules/geo";
import { formatDate, formatList, listingPath } from "@/modules/i18n";
import { type HomeCardView, type HomeView, HomeViewSchema } from "@/modules/ui";

import { chooserPath } from "./chooser";
import { chooserPageView } from "./chooser-choice";
import { countryDisplayName } from "./country-order";
import { listingExists, photoFor } from "./listing";
import { catalogProviders } from "./providers";
import { copyRow } from "./copy";
import {
  type ShopData,
  committedShopData,
  coreRange,
  shopCountries,
} from "./shop";
import { slugFor } from "./slugs";

/** A product as the home reads it: its key, its name and the occasions it carries. */
export interface HomeProduct {
  readonly sku: string;
  readonly name: string;
  readonly occasions: readonly string[];
}

/** An occasion row as the home reads it: its key and its label's message key. */
export interface HomeOccasion {
  readonly key: string;
  readonly labelKey: string;
}

/** Everything `homeView()` reads. The committed value is the registries; a test replaces parts. */
export interface HomeData {
  readonly shop: ShopData;
  readonly products: () => Promise<readonly HomeProduct[]>;
  readonly occasions: () => Promise<readonly HomeOccasion[]>;
  /** The occasion hub's path where it exists and may be linked in this locale, else `undefined`. */
  readonly occasionHubHref: (
    locale: LocaleCode,
    key: string,
  ) => Promise<string | undefined>;
  /** One country's dated occasions in `[from, from + months)`, in date order. */
  readonly datedOccasions: (
    iso2: string,
    from: string,
    months: number,
  ) => readonly DatedOccasion[];
  /** Is ordering open in any destination? (spec 043 AC-8's state line shows while it is not.) */
  readonly anyOpen: () => boolean;
}

async function committedOccasionHubHref(
  locale: LocaleCode,
  key: string,
): Promise<string | undefined> {
  if (!isPublished(listingLinkId("occasionHub"))) return undefined;
  const slug = slugFor("occasion", key, locale);
  if (slug === undefined) return undefined;
  const exists = await listingExists({
    pageType: "occasionHub",
    locale,
    entityKey: key,
  });
  return exists
    ? listingPath(locale, { pageType: "occasionHub", slug })
    : undefined;
}

/** The registries and the catalogue as committed. */
export const committedHomeData: HomeData = {
  shop: committedShopData,
  products: async () =>
    (await catalogProviders().catalogue.products()).map((product) => ({
      sku: product.sku,
      name: product.name,
      occasions: product.occasions,
    })),
  occasions: async () =>
    (await catalogProviders().catalogue.occasions()).map((row) => ({
      key: row.key,
      labelKey: row.labelKey,
    })),
  occasionHubHref: committedOccasionHubHref,
  datedOccasions: (iso2, from, months) => upcomingOccasions(iso2, from, months),
  anyOpen: anyDeliveryDatesOpen,
};

/**
 * **The dedupe rule** (item 4, AC-98). `order` is the section's own order, `shown` what the
 * sections above it display, `slots` how many cards it draws. Walking its own order, the section
 * skips a product already shown while the fresh products still ahead of it can fill the remaining
 * slots, and takes it otherwise, so it repeats only what it must. Pure and deterministic: the
 * same inputs give the same list on every run.
 */
export function dedupeSection(
  order: readonly string[],
  shown: ReadonlySet<string>,
  slots: number,
): readonly string[] {
  const picked: string[] = [];
  for (let index = 0; index < order.length; index += 1) {
    if (picked.length >= slots) break;
    const sku = order[index];
    if (sku === undefined) continue;
    if (shown.has(sku)) {
      const freshAhead = order
        .slice(index + 1)
        .filter((later) => !shown.has(later)).length;
      if (picked.length + freshAhead >= slots) continue;
    }
    picked.push(sku);
  }
  return picked;
}

/** `YYYY-MM-DD` of an instant in UTC: the day the page is rendered, never a visitor's clock. */
function isoDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * A calendar date as a page prints it. Midday UTC is the one hour that is the same calendar date in
 * every European zone, so "Fri 25 Dec" cannot become the 24th for a zone the formatter is given.
 */
function printedDate(date: string, locale: LocaleCode): string {
  return formatDate(
    new Date(`${date}T12:00:00Z`),
    locale,
    "deliveryDate",
    "UTC",
  );
}

/** The country-less card of one core product: its photograph, its name, its chooser link. */
function cardOf(
  product: HomeProduct,
  locale: LocaleCode,
): HomeCardView | undefined {
  // A product with no slug in this locale has no page to choose a country for: it is not drawn.
  if (slugFor("product", product.sku, locale) === undefined) return undefined;
  const { photo, provenance } = photoFor(product.sku, locale);
  return {
    productId: product.sku,
    name: copyRow("product", product.sku, locale)?.name ?? product.name,
    href: chooserPath(locale, { locale, kind: "product", sku: product.sku }),
    photo,
    provenance,
  };
}

/** Each dated occasion at its earliest date across `countries`, with the countries keeping it then. */
function datedAcross(
  countries: readonly string[],
  from: string,
  data: HomeData,
): readonly {
  readonly key: string;
  readonly date: string;
  readonly countries: readonly string[];
}[] {
  const earliest = new Map<string, { date: string; countries: string[] }>();
  for (const iso2 of countries) {
    const seenHere = new Set<string>();
    for (const dated of data.datedOccasions(
      iso2,
      from,
      HOME_COMING_UP_MONTHS,
    )) {
      // A country's own next occurrence only: a second one inside the window is a year later.
      if (seenHere.has(dated.occasionKey)) continue;
      seenHere.add(dated.occasionKey);
      const known = earliest.get(dated.occasionKey);
      if (known === undefined || dated.date < known.date) {
        earliest.set(dated.occasionKey, {
          date: dated.date,
          countries: [iso2],
        });
      } else if (dated.date === known.date) {
        known.countries.push(iso2);
      }
    }
  }
  return [...earliest.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) =>
      left.date === right.date
        ? left.key.localeCompare(right.key, "en")
        : left.date.localeCompare(right.date),
    );
}

export interface HomeViewOptions {
  /** The render's clock: "Coming up" starts today. ISR re-renders it at least hourly. */
  readonly now?: Date;
  readonly data?: HomeData;
}

/** The home's model. Parsed by `HomeViewSchema`, so a renderer can rely on its shape. */
export async function homeView(
  locale: LocaleCode,
  options: HomeViewOptions = {},
): Promise<HomeView> {
  const data = options.data ?? committedHomeData;
  const now = options.now ?? new Date();

  const picker = await chooserPageView(
    locale,
    { locale, kind: "home" },
    { kind: "ask" },
    { remembered: undefined, chips: PICKER_CHIPS, data: data.shop },
  );

  const range = await coreRange(locale, data.shop);
  const bySku = new Map(
    (await data.products()).map((product) => [product.sku, product]),
  );
  const core: HomeProduct[] = [];
  const cards = new Map<string, HomeCardView>();
  for (const entry of range) {
    const product = bySku.get(entry.sku);
    if (product === undefined) continue;
    const card = cardOf(product, locale);
    if (card === undefined) continue;
    core.push(product);
    cards.set(product.sku, card);
  }
  const cardsFor = (skus: readonly string[]): HomeCardView[] =>
    skus.flatMap((sku) => {
      const card = cards.get(sku);
      return card === undefined ? [] : [card];
    });
  const carrying = (key: string): string[] =>
    core
      .filter((product) => product.occasions.includes(key))
      .map((product) => product.sku);

  // Our selection: the whole core range, in rank order.
  const selection = core.map((product) => product.sku);
  const shown = new Set(selection);

  const occasionRows = await data.occasions();
  const labelOf = new Map(occasionRows.map((row) => [row.key, row.labelKey]));

  // Shop by occasion: every panel is weighed against "Our selection"; the panels are alternatives
  // (one displays at a time), so none dedupes against another.
  const occasions: HomeView["occasions"][number][] = [];
  for (const key of HOME_OCCASION_TABS) {
    const labelKey = labelOf.get(key);
    const order = carrying(key);
    if (labelKey === undefined || order.length < HOME_SECTION_MIN_PRODUCTS) {
      continue;
    }
    const hubHref = await data.occasionHubHref(locale, key);
    occasions.push({
      key,
      labelKey,
      cards: cardsFor(dedupeSection(order, shown, HOME_TAB_CARDS)),
      total: order.length,
      ...(hubHref === undefined ? {} : { hubHref }),
    });
  }
  // What the default state displays above "Coming up": the selection and the first, checked panel.
  const shownAboveComingUp = new Set([
    ...shown,
    ...(occasions[0]?.cards.map((card) => card.productId) ?? []),
  ]);

  const countries = await shopCountries(locale, data.shop);
  const comingUp: HomeView["comingUp"][number][] = [];
  for (const dated of datedAcross(countries, isoDay(now), data)) {
    if (comingUp.length >= HOME_COMING_UP.occasions) break;
    const labelKey = labelOf.get(dated.key);
    const order = carrying(dated.key);
    if (labelKey === undefined || order.length < HOME_SECTION_MIN_PRODUCTS) {
      continue;
    }
    const names = dated.countries
      .filter(isCountryIso2)
      .map((iso2) => countryDisplayName(countryConfig(iso2), locale));
    const listed = names.slice(0, HOME_COMING_UP.names);
    const hubHref = await data.occasionHubHref(locale, dated.key);
    const picked = dedupeSection(
      order,
      shownAboveComingUp,
      HOME_COMING_UP.cards,
    );
    for (const sku of picked) shownAboveComingUp.add(sku);
    comingUp.push({
      key: dated.key,
      labelKey,
      dateIso: dated.date,
      date: printedDate(dated.date, locale),
      countries:
        names.length > HOME_COMING_UP.names
          ? formatList(listed, locale, "unit")
          : formatList(listed, locale, "conjunction"),
      more: Math.max(0, names.length - HOME_COMING_UP.names),
      cards: cardsFor(picked),
      ...(hubHref === undefined ? {} : { hubHref }),
    });
  }

  return HomeViewSchema.parse({
    picker: {
      action: picker.action,
      chips: picker.chips.map(({ code, name }) => ({ code, name })),
      datalist: picker.datalist,
    },
    notOpen: !data.anyOpen(),
    selection: {
      cards: cardsFor(selection),
      seeAllHref: chooserPath(locale, { locale, kind: "home" }),
    },
    occasions,
    priceBands: PRICE_BAND_KEYS.map((band) => ({
      band,
      href: chooserPath(locale, { locale, kind: "price", band }),
    })),
    comingUp,
  });
}
