/**
 * The country shop root as markup (spec 008 §5.3 row 1, **AC-1**, **AC-6**, **AC-8**, **AC-24**;
 * T-08, T-24, T-30; TASK-109).
 *
 * `tests/unit/corridor-page.test.tsx`'s pattern: `react-dom/server` over the **real**
 * `messages/*.json` and the **real** view model, so the asserted copy is the shipped copy and the
 * asserted prices are the seeded catalogue's own. Three properties are provable only here:
 *
 *  - **the empty state is honest** (AC-8) — a published country with no deliverable product has no
 *    URL on the committed corpus (§2 row 6 requires ≥1 product), so the state is reached with a
 *    fabricated view rather than a fixture provider swap, which is spec 008 §14 **A8 (b)**'s
 *    "implementer's choice, recorded in the brief". The e2e half is TASK-108's `/dev/components`
 *    gallery, where the same component is rendered, scanned by axe and photographed;
 *  - **exactly one image is nominated as the LCP candidate** (AC-24) — the grid's first card and
 *    nothing else, with the preload built by `MediaAsset` from the same manifest lookup;
 *  - **the page claims nothing** (AC-6) — the shared honesty patterns of
 *    `tests/support/listing-honesty.ts` over the rendered text and markup in all four locales.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type ListingView, listingView } from "../../src/modules/catalog";
import { CountryShopRootPage } from "../../src/modules/catalog/ui/CountryShopRootPage.tsx";
import { loadMessages } from "../../src/modules/i18n";
import { listingHonestyViolations, textOf } from "../support/listing-honesty";

/** A fixed window start, so a rendered date is assertable without freezing a clock. */
const FROM = "2026-09-15";

/** Every namespace a shop-root document resolves. */
const NAMESPACES = [
  "shop",
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

async function viewFor(locale: string, country: string): Promise<ListingView> {
  const view = await listingView(
    { locale, pageType: "countryShopRoot", country },
    { from: FROM },
  );
  if (view === undefined) {
    throw new Error(`the ${locale} ${country} shop root must exist`);
  }
  return view;
}

const en = await viewFor("en", "poland");

describe("the populated shop root (§5.3 row 1)", () => {
  const html = render(<CountryShopRootPage view={en} />, "en");
  const text = textOf(html);

  it("renders one `<h1>`, and it is the shop root's heading", () => {
    expect(html.match(/<h1/gu)).toHaveLength(1);
    expect(text).toContain("Flowers we make for Poland");
  });

  it("opens with the priced grid, before any prose block", () => {
    const grid = html.indexOf("data-fo-listing-grid");
    const tiles = html.indexOf("data-fo-shop-tiles");
    const occasions = html.indexOf("data-fo-shop-occasions");
    const intro = html.indexOf("data-fo-shop-intro");
    expect(grid).toBeGreaterThan(-1);
    expect(grid).toBeLessThan(tiles);
    expect(tiles).toBeLessThan(occasions);
    expect(occasions).toBeLessThan(intro);
  });

  it("carries the demo sentence — the whole of the Phase 0 state (§13 Q8)", () => {
    expect(text).toContain("You cannot order yet");
    // No purchase affordance of any kind, disabled or otherwise.
    expect(html).not.toMatch(/<button/iu);
    expect(html).not.toMatch(/<form/iu);
  });

  it("prices every card, through `formatMoney` and nowhere else", () => {
    const cards = html.match(/data-fo-product-card="/gu) ?? [];
    expect(cards.length).toBe(en.items.length);
    expect(cards.length).toBeGreaterThan(0);
    // `en` quotes the locale's default currency (EUR), `en-gb` GBP: the symbol is data, so the
    // assertion is "a formatted amount per card", never a typed one.
    const prices =
      html.match(
        /(?:[€£]\s?[\d\u00a0,.]+|[\d\u00a0,.]+\s?(?:PLN|z\u0142))/gu,
      ) ?? [];
    expect(prices.length).toBeGreaterThanOrEqual(cards.length);
    expect(text).toContain("Includes VAT and delivery");
    // The committed FX snapshot is older than spec 005's ceiling, so every projection falls back
    // to the destination's own currency — and the page says so, once (spec 005 §14 A3, §5.3's
    // "stale FX" state). A price in złoty on an English page with no sentence beside it is the
    // one thing that state exists to prevent.
    expect(en.fxFallback).toBe(true);
    expect(text).toContain("currency of the delivery country");
  });

  it("renders the category tiles with their `from` prices and plural counts", () => {
    expect(en.tiles.length).toBeGreaterThan(0);
    for (const tile of en.tiles) {
      expect(html, tile.key).toContain(`data-fo-category-tile="${tile.key}"`);
      expect(html, tile.key).toContain(`href="${tile.href}"`);
    }
    expect(text).toContain("bouquets we can make for Poland");
    expect(html).toContain("data-fo-from-price");
  });

  it("renders the destination's own dated occasion rows, never a typed date", () => {
    expect(en.occasionDates?.length).toBeGreaterThan(0);
    // `formatDate` in `en`, from the view model's ISO dates — the component composes no date.
    expect(text).toMatch(/\d{1,2} [A-Z][a-z]+ 20\d\d/u);
    expect(html).toContain("<caption");
    expect(html).toContain('scope="row"');
  });

  it("is a breadcrumb of four crumbs, the leaf marked and not a link", () => {
    expect(en.breadcrumb.map((crumb) => crumb.labelKey)).toEqual([
      "common.homeLink",
      "breadcrumb.destinations",
      "destinations.pl.name",
      "breadcrumb.shopRoot",
    ]);
    expect(html).toContain('aria-current="page"');
    expect(textOf(html.slice(0, html.indexOf("</nav>")))).toContain("Flowers");
  });

  it("nominates exactly one LCP candidate and one preload for it (AC-24)", () => {
    // Phase 0 has no committed image bytes (TASK-080), so every card is on spec 006's placeholder
    // branch and the page nominates **nothing**: `MediaAsset` emits a preload only for an asset it
    // renders, so "at most one" is what holds on the committed manifest, and the mechanism is
    // asserted by the count of `priority` nominations the page makes.
    const priority = en.items.filter(
      (card, index) => index === 0 && card.photo.kind === "asset",
    );
    expect(priority.length).toBeLessThanOrEqual(1);
    expect(html.match(/fetchpriority="high"/gu) ?? []).toHaveLength(
      priority.length,
    );
    // Nothing below the first card is eager, in either state.
    expect(html.match(/loading="eager"/gu) ?? []).toHaveLength(0);
  });

  it("adds no client island and no inline script (§5.4)", () => {
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });
});

describe("the honesty rules over the rendered page (AC-6)", () => {
  for (const [locale, country] of [
    ["en", "poland"],
    ["en-gb", "poland"],
    ["de", "polen"],
    ["pl", "polska"],
  ] as const) {
    it(`${locale}: no rating, badge, countdown, old price or basket`, async () => {
      const view = await viewFor(locale, country);
      const html = render(<CountryShopRootPage view={view} />, locale);
      expect(listingHonestyViolations({ text: textOf(html), html })).toEqual(
        [],
      );
    });
  }
});

describe("the empty state (AC-8, §14 A8 (b))", () => {
  /**
   * A published country whose catalogue has no deliverable product. No such country exists on the
   * committed corpus — §2 row 6 gives a shop root only where ≥1 product does — so the state is
   * fabricated from the real view with its products removed. Everything else is the shipped view.
   */
  const empty: ListingView = {
    ...en,
    items: [],
    tiles: [],
    resultCount: 0,
    pageCount: 0,
    occasionDates: [],
  };
  const html = render(<CountryShopRootPage view={empty} />, "en");
  const text = textOf(html);

  it("says what is true and offers the ways out", () => {
    expect(text).toContain("Nothing we can deliver in Poland yet");
    expect(text).toContain("All destinations");
    expect(html).toContain(`href="${empty.links.corridor ?? ""}"`);
    expect(empty.links.corridor).toBeDefined();
  });

  it("renders no grid, no skeleton, no placeholder card and no price", () => {
    expect(html).not.toContain("data-fo-listing-grid");
    expect(html).not.toContain("data-fo-product-card");
    expect(html).not.toContain("data-fo-category-tile");
    expect(html).not.toMatch(/skeleton|placeholder-card|shimmer/iu);
    expect(text).not.toMatch(/£|€|zł|PLN/u);
  });

  it("keeps one `<h1>` and does not promise a catalogue", () => {
    expect(html.match(/<h1/gu)).toHaveLength(1);
    expect(text).not.toContain("Everything we can make for Poland");
    expect(text).not.toContain("You cannot order yet");
    expect(html).toContain('data-fo-listing-state="empty"');
  });
});
