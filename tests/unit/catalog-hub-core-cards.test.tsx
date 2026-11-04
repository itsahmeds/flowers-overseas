/**
 * Hubs show the core range as clickable cards with no price (spec 008 §14 A-founder-2026-10-24a
 * "Hubs", **AC-7** as amended, **AC-88**, **AC-89**; spec 004 §14 A-founder-2026-10-24a items 1, 2,
 * 3 and 6, **AC-82**; T-07, T-88, T-89 and T-90's unit halves; TASK-388).
 *
 * Every category hub and occasion hub in `en` and `en-gb`, with today's data, rendered from the
 * real `listingView()` and the real messages, server HTML only (JavaScript off by construction):
 *
 *  - **AC-88**: the grid holds exactly the core products tagged to the hub, in "Our order"
 *    (photographed first, then the core rank), and nothing else; each card has a photograph or
 *    the placeholder, its name, `shop.price.choose`, `shop.cta.chooseCountry` and one `nofollow`
 *    link to the chooser with `next=product/{slug}`; the `ItemList` equals the cards (name and
 *    url, in order) and carries no price;
 *  - **AC-7**: no currency symbol and no money anywhere in the document, `shop.hub.noMoney` once,
 *    the picker present;
 *  - **AC-89**: DOM order H1, lede, `shop.hub.noMoney`, picker, grid, then (occasion hubs) the
 *    dates, then the copy and the destination rows;
 *  - **AC-82**: the picker's `next` is the hub's own key; every destination row is a direct link
 *    to that country's version of the hub (never through the chooser).
 *
 * The browser halves (chooser links answering 200, the two-open fixture, Back) are T-89/T-90's
 * e2e and stay CI's.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { localeConfig } from "../../src/config/locales.ts";
import {
  type ListingView,
  coreRange,
  listingPages,
  listingView,
} from "../../src/modules/catalog";
import { listingItemListEntries } from "../../src/modules/catalog/listingSchema.ts";
import { thinCoreHubsMarkdown } from "../../src/modules/catalog/listing.ts";
import { CategoryHubPage } from "../../src/modules/catalog/ui/CategoryHubPage.tsx";
import { OccasionHubPage } from "../../src/modules/catalog/ui/OccasionHubPage.tsx";
import { loadMessages } from "../../src/modules/i18n";
import { catalogProviders } from "../../src/modules/catalog/providers.ts";

const FROM = "2026-10-01";
const LOCALES = ["en", "en-gb"] as const;
const NAMESPACES = [
  "home",
  "shop",
  "categoryHub",
  "occasionHub",
  "occasionsIndex",
  "breadcrumb",
  "catalog",
  "common",
  "a11y",
  "media",
  "occasions",
  "destinations",
] as const;

/** Money in any shape the launch locales print it (AC-7). */
const MONEY = /[€£$]|\bPLN\b|\bEUR\b|\bGBP\b|\bUSD\b|zł/u;

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

function decode(html: string): string {
  return html
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"');
}

function text(html: string): string {
  return decode(html.replace(/<[^>]+>/gu, " "));
}

function shop(locale: string): {
  hub: { noMoney: string };
  price: { choose: string };
  cta: { chooseCountry: string };
} {
  return loadMessages(locale, ["shop"])["shop"] as never;
}

interface Hub {
  readonly locale: (typeof LOCALES)[number];
  readonly pageType: "categoryHub" | "occasionHub";
  readonly entityKey: string;
  readonly path: string;
  readonly view: ListingView;
  readonly html: string;
}

const products = await catalogProviders().catalogue.products();
const occasionsOf = new Map<string, readonly string[]>(
  products.map((p) => [p.sku, p.occasions]),
);

const HUBS: Hub[] = [];
for (const locale of LOCALES) {
  for (const page of await listingPages(locale)) {
    if (page.pageType !== "categoryHub" && page.pageType !== "occasionHub") {
      continue;
    }
    const view = await listingView(
      { locale, pageType: page.pageType, entity: page.slug },
      { from: FROM },
    );
    if (view === undefined) throw new Error(`${page.path} must render`);
    const Page =
      page.pageType === "categoryHub" ? CategoryHubPage : OccasionHubPage;
    HUBS.push({
      locale,
      pageType: page.pageType,
      entityKey: page.entityKey ?? "",
      path: page.path,
      view,
      html: render(<Page view={view} />, locale),
    });
  }
}

describe("the hub set", () => {
  it("covers both hub kinds in both locales", () => {
    for (const locale of LOCALES) {
      for (const pageType of ["categoryHub", "occasionHub"] as const) {
        expect(
          HUBS.filter((h) => h.locale === locale && h.pageType === pageType)
            .length,
          `${locale} ${pageType}`,
        ).toBeGreaterThan(5);
      }
    }
  });
});

describe("AC-88: every hub shows its core products, and only those, as chooser cards (T-89)", () => {
  it("holds exactly the core products tagged to it, photographed first, then by rank", async () => {
    for (const locale of LOCALES) {
      const core = await coreRange(locale);
      const coreSkus = new Set(core.map((entry) => entry.sku));
      const rank = new Map(core.map((entry) => [entry.sku, entry.coreRank]));
      for (const hub of HUBS.filter((h) => h.locale === locale)) {
        const ids = hub.view.hubItems.map((card) => card.productId);
        for (const id of ids)
          expect(coreSkus.has(id), `${hub.path} ${id}`).toBe(true);
        if (hub.pageType === "occasionHub") {
          // Exactly the core products carrying the occasion: none left out.
          const tagged = core
            .map((entry) => entry.sku)
            .filter((sku) => occasionsOf.get(sku)?.includes(hub.entityKey));
          expect([...ids].sort(), hub.path).toEqual([...tagged].sort());
        }
        for (const group of [
          hub.view.hubItems.filter((c) => c.photo.kind === "asset"),
          hub.view.hubItems.filter((c) => c.photo.kind === "placeholder"),
        ]) {
          const ranks = group.map((c) => rank.get(c.productId) ?? 0);
          expect(ranks, hub.path).toEqual([...ranks].sort((a, b) => a - b));
        }
        expect(hub.view.resultCount, hub.path).toBe(ids.length);
        expect(hub.view.items, hub.path).toEqual([]);
      }
    }
  });

  it("draws each card with a photograph or placeholder, its name, the ask, the action and one nofollow chooser link", () => {
    for (const hub of HUBS) {
      const words = shop(hub.locale);
      const segment = localeConfig(hub.locale).chooseSegment;
      const cards = hub.html.split("data-fo-product-card=").slice(1);
      expect(cards, hub.path).toHaveLength(hub.view.hubItems.length);
      cards.forEach((part, index) => {
        const card = part.slice(0, part.indexOf("</article>"));
        const view = hub.view.hubItems[index];
        expect(view?.href, hub.path).toMatch(
          new RegExp(`^/${hub.locale}/${segment}/product/[a-z0-9-]+$`, "u"),
        );
        const links = [...card.matchAll(/<a [^>]*>/gu)].map((m) => m[0]);
        expect(links, `${hub.path} ${view?.productId}`).toHaveLength(1);
        expect(links[0]).toContain(`href="${view?.href}"`);
        expect(links[0]).toContain('rel="nofollow"');
        expect(card).toMatch(/<picture|data-fo-media-placeholder/u);
        const words_ = text(card);
        expect(words_).toContain(view?.name ?? "-");
        expect(words_).toContain(words.price.choose);
        expect(words_).toContain(words.cta.chooseCountry);
        expect(card).not.toContain("data-fo-price");
      });
    }
  });

  it("lists the cards in its ItemList, name and url in order, with no price", () => {
    for (const hub of HUBS) {
      const entries = listingItemListEntries(hub.view);
      expect(entries, hub.path).toEqual(
        hub.view.hubItems.map((card) => ({ name: card.name, href: card.href })),
      );
      expect(JSON.stringify(entries)).not.toMatch(/price|offer/iu);
    }
  });
});

describe("AC-7: a hub renders no money, says why once and carries the picker (T-07)", () => {
  it("has no currency anywhere, `shop.hub.noMoney` exactly once, and one picker form", () => {
    for (const hub of HUBS) {
      const words = text(hub.html);
      expect(words, hub.path).not.toMatch(MONEY);
      expect(
        words.split(shop(hub.locale).hub.noMoney).length - 1,
        hub.path,
      ).toBe(1);
      expect(hub.html.match(/data-fo-hub-picker/gu), hub.path).toHaveLength(1);
      expect(hub.html, hub.path).not.toContain(
        'data-fo-product-card-money="priced"',
      );
    }
  });
});

describe("AC-89: products first, dates and copy after (T-90's order)", () => {
  it("puts H1, noMoney, the picker and the grid in that order, then the dates, the copy and the destination rows", () => {
    for (const hub of HUBS) {
      const at = (needle: string): number => hub.html.indexOf(needle);
      const order = [
        at("<h1"),
        at("data-fo-hub-no-money"),
        at("data-fo-hub-picker"),
        ...(hub.view.hubItems.length > 0 ? [at("data-fo-listing-grid=")] : []),
        ...(hub.pageType === "occasionHub" ? [at("data-fo-hub-dates=")] : []),
        ...(hub.view.intro === undefined ? [] : [at("data-fo-hub-about")]),
        ...(hub.html.includes("data-fo-hub-destinations=")
          ? [at("data-fo-hub-destinations=")]
          : []),
      ];
      for (const index of order) expect(index, hub.path).toBeGreaterThan(-1);
      expect(order, hub.path).toEqual([...order].sort((a, b) => a - b));
      const deck = at("data-fo-hub-deck");
      if (deck > -1) {
        expect(deck).toBeGreaterThan(at("<h1"));
        expect(deck).toBeLessThan(at("data-fo-hub-no-money"));
      }
    }
  });

  it("keeps every observed date in the occasion hub's table", () => {
    for (const hub of HUBS.filter((h) => h.pageType === "occasionHub")) {
      const observed = (hub.view.occasionDates ?? []).filter((r) => r.observed);
      expect(
        hub.html.match(/data-fo-hub-date="[A-Z]{2}"/gu) ?? [],
        hub.path,
      ).toHaveLength(observed.length);
    }
  });
});

describe("AC-82: the picker's next is the hub's key; destination rows link directly (T-88)", () => {
  it("posts the picker to the choice route of the hub's own path", () => {
    for (const hub of HUBS) {
      const tail = hub.path.slice(`/${hub.locale}/`.length);
      expect(hub.view.hubPicker?.action, hub.path).toBe(
        `/api/choose/${hub.locale}/${tail}`,
      );
      expect(hub.html).toContain(`action="/api/choose/${hub.locale}/${tail}"`);
      expect(hub.view.hubPicker?.chips.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("links every country whose version of the hub exists, directly, and nothing through the chooser", () => {
    let rows = 0;
    for (const hub of HUBS) {
      const segment = localeConfig(hub.locale).chooseSegment;
      const linked = hub.view.links.destinations.filter(
        (d) => d.href !== undefined,
      );
      const block = hub.html.slice(
        hub.html.indexOf("data-fo-hub-destinations="),
      );
      const hrefs =
        linked.length === 0
          ? []
          : [...block.matchAll(/<a [^>]*href="([^"]+)"/gu)].map((m) => m[1]);
      expect(new Set(hrefs), hub.path).toEqual(
        new Set(linked.map((d) => d.href)),
      );
      for (const href of hrefs) {
        expect(href, hub.path).not.toContain(`/${segment}/`);
        expect(href, hub.path).not.toContain("/api/choose");
      }
      rows += hrefs.length;
    }
    expect(rows).toBeGreaterThan(0);
  });
});

describe("a hub with no core product (the brief's escalation)", () => {
  const empty = HUBS.filter((hub) => hub.view.hubItems.length === 0);

  it("renders the head, noMoney and the picker, with no grid, no count line and no placeholder card", () => {
    expect(empty.length).toBeGreaterThan(0);
    for (const hub of empty) {
      expect(hub.html, hub.path).toContain("data-fo-hub-picker");
      expect(hub.html, hub.path).not.toContain("data-fo-listing-grid");
      expect(hub.html, hub.path).not.toContain("data-fo-hub-count");
      expect(hub.html, hub.path).not.toContain("data-fo-product-card");
    }
  });

  it("is printed as a warning for the coverage matrix", () => {
    const md = thinCoreHubsMarkdown(
      empty.map((hub) => ({
        locale: hub.locale,
        pageType: hub.pageType,
        entityKey: hub.entityKey,
        path: hub.path,
        coreCount: 0,
      })),
    );
    expect(md).toMatch(/^Warning: \d+ hubs show fewer than 6 core products/u);
    for (const hub of empty)
      expect(md).toContain(`- ${hub.path}: 0 core products`);
    expect(thinCoreHubsMarkdown([])).toBe("");
  });
});
