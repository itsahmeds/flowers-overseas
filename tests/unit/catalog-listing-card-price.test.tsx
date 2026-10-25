/**
 * The listing pages say each card's price once (spec 004 §14 A-founder-2026-10-19b clauses 1 to 4;
 * spec 008 AC-6, A2, A16 (a) as amended, T-06 and T-07 amended; TASK-285).
 *
 * Every country-scoped page type and both hubs, rendered from `listingView()` with the real
 * messages and one fixed clock **inside** the committed snapshot's window (`fx.data.ts`, `as_of`
 * 2026-09-08): the one state in which the pages used to print an equivalents line under every card,
 * so the state in which its absence means something (CI serves a stale snapshot, where no line
 * would print anyway). On each page:
 *
 *  - every card's price element is `formatMoney(view.items[i].price)` and the locale's
 *    `catalog.price.inclusive`, in grid order, and `ItemList`'s `Offer` price is that same amount
 *    (schema price = visible price);
 *  - no card, and nothing on the page, carries an equivalents line (the card's field is `null`
 *    until TASK-389 renders it, spec 004 §14 A-founder-2026-10-24a item 7);
 *  - the grid's example label is **one** element, displayed at every width, before the grid: on the
 *    count line's row of a country listing, on the heading row of a hub; every card's own label
 *    is in the HTML and hidden;
 *  - a hub card carries no price element and no `shop.card.noPrice`; `shop.hub.noMoney` is said once.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  type ListingView,
  listingView,
  productJsonLd,
  productView,
} from "../../src/modules/catalog";
import { CategoryHubPage } from "../../src/modules/catalog/ui/CategoryHubPage.tsx";
import { CountryCategoryPage } from "../../src/modules/catalog/ui/CountryCategoryPage.tsx";
import { CountryOccasionPage } from "../../src/modules/catalog/ui/CountryOccasionPage.tsx";
import { CountryShopRootPage } from "../../src/modules/catalog/ui/CountryShopRootPage.tsx";
import { OccasionHubPage } from "../../src/modules/catalog/ui/OccasionHubPage.tsx";
import {
  formatMoney,
  loadMessages,
  moneyDecimalString,
} from "../../src/modules/i18n";

/** Inside the 48-hour window of the 2026-09-08 snapshot. */
const FRESH = new Date("2026-09-09T12:00:00Z");
/** Past it: every rate is withheld and a converted price falls back to the destination's. */
const STALE = new Date("2026-09-11T00:00:01Z");
/** The window start for dated rows, fixed so nothing below depends on today. */
const FROM = "2026-09-09";

const NAMESPACES = [
  "shop",
  "categoryHub",
  "occasionHub",
  "breadcrumb",
  "catalog",
  "common",
  "a11y",
  "media",
  "occasions",
  "destinations",
] as const;

function render(node: ReactElement, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, [...NAMESPACES])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

type Identity = Parameters<typeof listingView>[0];

async function view(identity: Identity, now: Date): Promise<ListingView> {
  const resolved = await listingView(identity, { from: FROM, now });
  if (resolved === undefined) {
    throw new Error(`${JSON.stringify(identity)} must resolve`);
  }
  return resolved;
}

const LINE = "data-fo-price-equivalents";

/** The markup of each product card, one string per card, in grid order. */
function cards(html: string): string[] {
  return html.split("data-fo-product-card=").slice(1);
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function decode(html: string): string {
  return html
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"');
}

/** Every card's price element text, tags stripped, in document order. */
function priceTexts(html: string): string[] {
  const out: string[] = [];
  const opener = /<span[^>]*data-fo-price="card"[^>]*>/gu;
  for (let open = opener.exec(html); open !== null; open = opener.exec(html)) {
    const tag = /<(\/?)span\b[^>]*>/gu;
    tag.lastIndex = open.index;
    let depth = 0;
    let end = open.index;
    for (let match = tag.exec(html); match !== null; match = tag.exec(html)) {
      depth += match[1] === "/" ? -1 : 1;
      end = tag.lastIndex;
      if (depth === 0) break;
    }
    out.push(decode(html.slice(open.index, end).replace(/<[^>]+>/gu, "")));
  }
  return out;
}

function inclusive(locale: string): string {
  const catalog = loadMessages(locale, ["catalog"])["catalog"] as {
    price: { inclusive: string };
  };
  return catalog.price.inclusive;
}

/** The shop root's country slug in each locale. */
const POLAND = {
  en: "poland",
  "en-gb": "poland",
  de: "polen",
  pl: "polska",
} as const;

/** Every country-scoped page type over Poland, in the locales it is checked in. */
const COUNTRY_PAGES = [
  ...(["en", "en-gb", "de", "pl"] as const).map((locale) => ({
    name: `${locale} shop root`,
    locale,
    identity: {
      locale,
      pageType: "countryShopRoot",
      country: POLAND[locale],
    },
    page: (v: ListingView) => <CountryShopRootPage view={v} />,
  })),
  ...(["en", "en-gb"] as const).flatMap((locale) => [
    {
      name: `${locale} country category`,
      locale,
      identity: {
        locale,
        pageType: "countryCategory",
        country: "poland",
        entity: "roses",
      },
      page: (v: ListingView) => <CountryCategoryPage view={v} />,
    },
    {
      name: `${locale} country occasion`,
      locale,
      identity: {
        locale,
        pageType: "countryOccasion",
        country: "poland",
        entity: "mothers-day",
      },
      page: (v: ListingView) => <CountryOccasionPage view={v} />,
    },
  ]),
];

const HUB_PAGES = [
  {
    name: "the category hub",
    identity: { locale: "en", pageType: "categoryHub", entity: "roses" },
    page: (v: ListingView) => <CategoryHubPage view={v} />,
  },
  {
    name: "the occasion hub",
    identity: { locale: "en", pageType: "occasionHub", entity: "mothers-day" },
    page: (v: ListingView) => <OccasionHubPage view={v} />,
  },
] as const;

describe("country listings at a fresh rate: one price per card, with the inclusive words, and no equivalents", () => {
  it.each(COUNTRY_PAGES)("$name", async ({ identity, page, locale }) => {
    const v = await view(identity as Identity, FRESH);
    const html = render(page(v), locale);
    expect(cards(html)).toHaveLength(v.items.length);
    expect(v.items.length).toBeGreaterThan(0);
    expect(priceTexts(html)).toEqual(
      v.items.map(
        (item) => `${formatMoney(item.price, locale)}${inclusive(locale)}`,
      ),
    );
    expect(occurrences(html, LINE)).toBe(0);
    // The field exists since TASK-381 (spec 004 item 7) and stays null until TASK-389 fills it.
    for (const item of v.items) expect(item.equivalents).toBeNull();
    expect(html).not.toContain("data-fo-fx-fallback");
  });

  it.each(["en", "en-gb", "de", "pl"] as const)(
    "%s shop root: each card's price is the Offer.price the product page's JSON-LD emits",
    async (locale) => {
      const v = await view(
        { locale, pageType: "countryShopRoot", country: POLAND[locale] },
        FRESH,
      );
      for (const item of v.items) {
        const pdp = await productView(
          { locale, countryIso: "PL", sku: item.productId },
          { parameterised: false, now: FRESH },
        );
        if (pdp === undefined) throw new Error(`${item.productId}: no view`);
        // The gate opened on the view (Phase 0 keeps it shut everywhere): the builder reads only
        // the view, so the offer it would emit is this one.
        const product = productJsonLd(
          {
            ...pdp,
            country: { ...pdp.country, state: "live" as const },
            delivery: { ...pdp.delivery, state: "live" as const },
            indexability: { ...pdp.indexability, indexable: true },
          },
          (key) => key,
          { baseUrl: "https://flowersoverseas.com" },
        ).find((node) => node?.["@type"] === "Product");
        const offer = product?.["offers"] as
          Record<string, unknown> | undefined;
        expect(offer?.["price"], item.productId).toBe(
          moneyDecimalString(item.price),
        );
        expect(offer?.["priceCurrency"], item.productId).toBe(
          item.price.currency,
        );
      }
    },
  );
});

describe("the grid's example label: one element, displayed at every width, above the grid (clause 3)", () => {
  it.each(COUNTRY_PAGES)(
    "$name: on the count line's row",
    async ({ identity, page, locale }) => {
      const v = await view(identity as Identity, FRESH);
      const html = render(page(v), locale);
      expect(occurrences(html, "data-fo-grid-provenance=")).toBe(1);
      const at = html.indexOf("data-fo-grid-provenance=");
      const label = html.slice(html.lastIndexOf("<div", at), at + 60);
      // An all-example grid (every committed photograph is an example): no `md:hidden`.
      expect(label).toContain('data-fo-grid-provenance="all"');
      expect(label).not.toContain("md:hidden");
      // Inside the count line's row, and before the grid's first card.
      const row = html.indexOf("data-fo-listing-count-row");
      expect(row).toBeGreaterThan(-1);
      expect(at).toBeGreaterThan(row);
      expect(at).toBeLessThan(html.indexOf("data-fo-listing-disclosure"));
      expect(at).toBeLessThan(html.indexOf("data-fo-product-card="));
      // Every grid card's own label is in the HTML and hidden at every width; only the country
      // occasion's lead figure (the grid's first `<li>` on page 1) shows its own from `md` up.
      const own = cards(html).map(
        (part) => /data-fo-card-provenance="([^"]+)"/u.exec(part)?.[1],
      );
      const lead = identity.pageType === "countryOccasion";
      expect(own).toEqual(
        v.items.map((item, index) =>
          item.photo.kind !== "asset"
            ? undefined
            : lead && index === 0
              ? "md"
              : "hidden",
        ),
      );
    },
  );

  it.each(HUB_PAGES)(
    "$name: on the grid's heading row",
    async ({ identity, page }) => {
      const v = await view(identity as Identity, FRESH);
      const html = render(page(v), "en");
      expect(occurrences(html, "data-fo-grid-provenance=")).toBe(1);
      const at = html.indexOf("data-fo-grid-provenance=");
      expect(html.slice(at, at + 40)).toContain('"all"');
      expect(at).toBeGreaterThan(html.indexOf('id="hub-products-heading"'));
      expect(at).toBeLessThan(html.indexOf("data-fo-product-card="));
      for (const part of cards(html)) {
        expect(part).toContain('data-fo-card-provenance="hidden"');
      }
    },
  );
});

describe("a destination-less hub: no price on any card, and the reason said once (clause 4, spec 008 AC-7)", () => {
  it.each(HUB_PAGES)("$name", async ({ identity, page }) => {
    const v = await view(identity as Identity, FRESH);
    const html = render(page(v), "en");
    expect(cards(html).length).toBeGreaterThan(0);
    expect(occurrences(html, LINE)).toBe(0);
    expect(html).not.toContain('data-fo-price="card"');
    // Each hub card's text is its name and its (hidden) example label, and nothing else.
    const media = loadMessages("en", ["media"])["media"] as {
      provenance: { aiExample: string };
    };
    cards(html).forEach((part, index) => {
      const card = part.slice(0, part.indexOf("</article>"));
      expect(
        decode(card.slice(card.indexOf(">") + 1).replace(/<[^>]+>/gu, ""))
          .replace(media.provenance.aiExample, "")
          .trim(),
      ).toBe(v.hubItems[index]?.name);
    });
    expect(decode(html)).not.toContain(
      "No price here. The price depends on the destination.",
    );
    const shop = loadMessages("en", ["shop"])["shop"] as {
      hub: { noMoney: string };
    };
    expect(occurrences(decode(html), shop.hub.noMoney)).toBe(1);
  });
});

describe("a stale rate: still one price per card, and the page says which currency it quotes (A21 clause 6 (d))", () => {
  it.each(COUNTRY_PAGES.filter(({ locale }) => locale === "en"))(
    "$name",
    async ({ identity, page }) => {
      const v = await view(identity as Identity, STALE);
      const html = render(page(v), "en");
      expect(priceTexts(html)).toEqual(
        v.items.map(
          (item) => `${formatMoney(item.price, "en")}${inclusive("en")}`,
        ),
      );
      expect(occurrences(html, LINE)).toBe(0);
      expect(occurrences(html, "data-fo-fx-fallback")).toBe(1);
    },
  );
});
