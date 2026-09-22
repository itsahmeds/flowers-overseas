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
    // No **purchase** affordance of any kind, disabled or otherwise. The one `<form>` and the one
    // `<button>` on the page are the sort control TASK-114 added (`method="get"`, submit): a
    // control that only re-renders the same twelve bouquets in another order, and the only way to
    // sort with JavaScript off. Counted exactly, so a second form — a basket, an email capture —
    // fails here.
    expect(html.match(/<form/giu) ?? []).toHaveLength(1);
    expect(html).toContain('<form class="gap-sm flex items-end" method="get"');
    expect(html.match(/<button/giu) ?? []).toHaveLength(1);
    expect(html).toContain('type="submit"');
    expect(html).not.toMatch(/basket|cart|buy now|add to/iu);
  });

  it("renders the sort form and its disclosure, and offers three orders (AC-9)", () => {
    // A visible `<label>` bound to the `<select>`, three options and a submit button — no island,
    // no `onchange`, nothing that needs JavaScript to work.
    expect(html).toContain('<label class="text-ink-muted self-center text-sm"');
    expect(html).toContain('for="listing-sort"');
    expect(html).toContain('id="listing-sort"');
    expect(html).toContain('name="sort"');
    expect(html).not.toMatch(/onchange/iu);
    expect(html.match(/<option/gu) ?? []).toHaveLength(3);
    expect(text).toContain("Our order");
    expect(text).toContain("Price: low to high");
    expect(text).toContain("Price: high to low");
    // The ranking disclosure, on the page beside the control (`plan/07` §2.1).
    expect(text).toContain("It is not a ranking by sales");
    expect(text).not.toMatch(/bestsell|most popular|recommended for you/iu);
  });

  it("paginates with real links in a labelled nav, page 1 linking to the bare URL (AC-10)", () => {
    expect(en.pageCount).toBeGreaterThan(1);
    const nav = html.slice(html.indexOf("data-fo-pagination"));
    expect(html).toContain(`data-fo-pagination="${String(en.pageCount)}"`);
    expect(nav).toContain(`href="${en.path}?page=2"`);
    // Never `?page=1`: that URL redirects, and no crawlable link may point at a redirect.
    expect(html).not.toContain("?page=1");
    expect(nav).toContain('aria-current="page"');
    expect(html).toMatch(/<nav[^>]*aria-label="[^"]+"[^>]*data-fo-pagination/u);
    // Real anchors, no buttons and no "load more".
    expect(nav).not.toMatch(/<button/iu);
    expect(text).not.toMatch(/load more/iu);
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

  it("gives the occasion table its third column, linked only where a page exists (§14 A10)", () => {
    // TASK-109 shipped two columns because no country-occasion page existed for a third to link
    // to; TASK-111 built them, so the column is here. Mother's Day is the one Polish occasion
    // that clears the six-product floor, so it is the only linked row — every other cell is
    // **empty**, never a disabled link or a "no page" placeholder (spec 004 AC-14).
    expect(html).toContain("Page</th>");
    const linked = (en.occasionDates ?? []).filter(
      (row) => row.href !== undefined,
    );
    expect(linked).toHaveLength(1);
    expect(linked[0]?.href).toBe("/en/poland/occasions/mothers-day");
    expect(html).toContain('href="/en/poland/occasions/mothers-day"');
    expect(html.match(/data-fo-occasion-page=/gu) ?? []).toHaveLength(1);
    expect(text).toContain("What we make for it");
    // Three header cells, and one more `<td>` per row than the two-column table had.
    expect(html.match(/scope="col"/gu) ?? []).toHaveLength(3);
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
    // TASK-080 committed the image bytes, so the first card is now on the asset branch and the
    // nomination is real rather than latent. The assertion is written to hold in **both** states —
    // "as many eager, high-priority images as the page nominated, and never more than one" — so
    // that withdrawing an image is not a test edit. The match is case-insensitive because
    // `renderToStaticMarkup` writes React's `fetchPriority` while the DOM attribute is
    // `fetchpriority`; the browser-side half is `tests/e2e/media-budgets.spec.ts`'s.
    const priority = en.items.filter(
      (card, index) => index === 0 && card.photo.kind === "asset",
    );
    expect(priority.length).toBeLessThanOrEqual(1);
    // One image marked high, and **one preload for that image** — the two halves the test's name
    // promises, counted apart because `fetchPriority` appears on both and counting them together
    // would pass a page that emitted two preloads and no image.
    expect(html.match(/<img[^>]*fetchpriority="high"/giu) ?? []).toHaveLength(
      priority.length,
    );
    expect(
      html.match(/<link[^>]*rel="preload"[^>]*as="image"/giu) ?? [],
    ).toHaveLength(priority.length);
    // Nothing below the first card is eager, in either state: the count of eager images equals the
    // count of nominations, so a second one would fail here rather than in a Lighthouse run.
    expect(html.match(/loading="eager"/gu) ?? []).toHaveLength(priority.length);
  });

  it("adds no client island and no inline script (§5.4)", () => {
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });
});

describe("page 2 and a sorted page (AC-9, AC-10; TASK-114)", () => {
  it("moves `aria-current`, offers Previous, and counts the page in the summary", async () => {
    const second = await listingView(
      { locale: "en", pageType: "countryShopRoot", country: "poland" },
      { from: FROM, page: 2 },
    );
    if (second === undefined) throw new Error("page 2 must exist");
    const html = render(<CountryShopRootPage view={second} />, "en");
    const text = textOf(html);
    expect(second.page).toBe(2);
    expect(second.items).toHaveLength(12);
    expect(text).toContain("page 2 of");
    expect(text).toContain("Previous");
    // Page 1's link is the bare URL, and the current page is not a link at all.
    expect(html).toContain(`>1</a>`);
    expect(html).toContain(`href="${second.path}"`);
    expect(html).toMatch(/<b aria-current="page"[^>]*>2<\/b>/u);
  });

  it("renders the chosen order as the selected option, from the server", async () => {
    const sorted = await listingView(
      { locale: "en", pageType: "countryShopRoot", country: "poland" },
      { from: FROM, sort: "price-desc", parameterised: true },
    );
    if (sorted === undefined) throw new Error("the sorted view must exist");
    const html = render(<CountryShopRootPage view={sorted} />, "en");
    // `defaultValue` on the `<select>` renders as `selected` on the option the URL asked for, so
    // the control shows the order the server actually rendered — with JavaScript off.
    expect(html).toContain('<option value="price-desc" selected=""');
    expect(html).toContain('data-fo-listing-toolbar="price-desc"');
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
