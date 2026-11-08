/**
 * Country listings: `priceBands()`, "Our order", 24 per page and the `price` and `colour` facets
 * (spec 008 §14 A-founder-2026-10-24a, AC-9 and AC-10 as amended, AC-90, AC-91, AC-92; T-91,
 * T-92; TASK-390). The e2e halves (JavaScript off, the crawl's `<a href>` scan, the two-open
 * fixture) are owed to the later test pass, recorded in `docs/tasks/TASK-390.md`.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FACET_PARAMETERS } from "../../src/config/catalogue/schemas.ts";
import type { CurrencyCode } from "../../src/config/currencies.ts";
import { QUERY_KEY } from "../../src/config/url-keys.ts";
import {
  type ListingView,
  countryPriceBands,
  listingView,
} from "../../src/modules/catalog/listing.ts";
import {
  compareOurOrder,
  ourOrder,
} from "../../src/modules/catalog/our-order.ts";
import { listingRequest } from "../../src/modules/catalog/params.ts";
import {
  bandOf,
  nicestAtOrBelow,
  priceBands,
} from "../../src/modules/catalog/price-bands.ts";
import { hasCardPhoto } from "../../src/modules/catalog/search-reads.ts";
import { CountryCategoryPage } from "../../src/modules/catalog/ui/CountryCategoryPage.tsx";
import { CountryShopRootPage } from "../../src/modules/catalog/ui/CountryShopRootPage.tsx";
import { loadMessages } from "../../src/modules/i18n";

const FROM = "2026-09-15";
// The committed FX snapshot ages; one fixed instant keeps every card's price stable.
const NOW = new Date("2026-09-15T10:00:00Z");

const NAMESPACES = [
  "shop",
  "breadcrumb",
  "catalog",
  "common",
  "a11y",
  "media",
  "occasions",
  "destinations",
  "nav",
  "home",
] as const;

function render(node: ReactElement, locale = "en"): string {
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

const minor = (values: readonly number[]): bigint[] => values.map(BigInt);

describe("priceBands (T-91, AC-90)", () => {
  it("rounds down to 1, 2, 2.5 or 5 times a power of ten", () => {
    expect(nicestAtOrBelow(0n)).toBe(0n);
    expect(nicestAtOrBelow(1n)).toBe(1n);
    expect(nicestAtOrBelow(3n)).toBe(2n);
    expect(nicestAtOrBelow(24n)).toBe(20n);
    expect(nicestAtOrBelow(25n)).toBe(25n);
    expect(nicestAtOrBelow(49n)).toBe(25n);
    expect(nicestAtOrBelow(4190n)).toBe(2500n);
    expect(nicestAtOrBelow(5490n)).toBe(5000n);
    expect(nicestAtOrBelow(9999n)).toBe(5000n);
    expect(nicestAtOrBelow(10000n)).toBe(10000n);
    expect(nicestAtOrBelow(21900n)).toBe(20000n);
  });

  it("pins GBP: the board's France example gives under £25, £25 to £50, £50 and over", () => {
    const bands = priceBands(
      [3190, 3190, 4190, 4190, 4190, 5490, 5490, 7290, 7290],
      "GBP",
    );
    expect(bands.thresholds).toStrictEqual(minor([2500, 5000]));
    expect(bands.bands.map((band) => band.key)).toStrictEqual([
      "low",
      "mid",
      "high",
    ]);
    expect(bandOf(bands, 2499)).toBe("low");
    expect(bandOf(bands, 2500)).toBe("mid");
    expect(bandOf(bands, 4999)).toBe("mid");
    expect(bandOf(bands, 5000)).toBe("high");
  });

  it("pins PLN and EUR from their own amounts, with no table per currency", () => {
    const pln = priceBands(
      [14900, 16900, 18900, 21900, 24900, 27900, 32900, 38900, 45900],
      "PLN",
    );
    // p33 = 18900 → 10000 (100 zł); p67 = 27900 → 25000 (250 zł).
    expect(pln.thresholds).toStrictEqual(minor([10000, 25000]));
    const eur = priceBands([3900, 4400, 4900, 5900, 6900, 7900], "EUR");
    // p33 = 4400 → 2500; p67 = 5900 → 5000.
    expect(eur.thresholds).toStrictEqual(minor([2500, 5000]));
  });

  it("never returns a float: every threshold and bound is a bigint", () => {
    const bands = priceBands([1999, 2999, 3999], "EUR");
    for (const threshold of bands.thresholds) {
      expect(typeof threshold).toBe("bigint");
    }
    for (const band of bands.bands) {
      for (const bound of [band.fromMinor, band.toMinor]) {
        if (bound !== undefined) expect(typeof bound).toBe("bigint");
      }
    }
  });

  it("gives three bands for a currency in no config at all", () => {
    const bands = priceBands(
      [120000, 150000, 180000, 260000, 310000, 420000],
      "XTS" as CurrencyCode,
    );
    expect(bands.bands).toHaveLength(3);
    expect(bands.thresholds).toStrictEqual(minor([100000, 250000]));
  });

  it("collapses to two bands when t2 ≤ t1, and to one with no price", () => {
    const two = priceBands([3190, 3190, 3190, 3190], "GBP");
    expect(two.bands.map((band) => band.key)).toStrictEqual(["low", "high"]);
    expect(bandOf(two, 3190)).toBe("high");
    const one = priceBands([], "GBP");
    expect(one.bands).toHaveLength(1);
    expect(bandOf(one, 3190)).toBeUndefined();
  });

  it("is the chooser's `price` key: one parameter name", () => {
    expect(FACET_PARAMETERS.priceBand).toBe(QUERY_KEY.price);
  });
});

describe("Our order (T-92, AC-9, AC-91)", () => {
  const row = (
    sku: string,
    hasPhoto: boolean,
    marginBand: number,
    curationIndex: number,
  ) => ({ sku, hasPhoto, marginBand, curationIndex });

  it("compares photograph, then band high first, then curation, then SKU", () => {
    expect(
      compareOurOrder(row("B", true, 0, 9), row("A", false, 4, 0)),
    ).toBeLessThan(0);
    expect(
      compareOurOrder(row("B", true, 3, 9), row("A", true, 1, 0)),
    ).toBeLessThan(0);
    expect(
      compareOurOrder(row("B", true, 1, 2), row("A", true, 1, 5)),
    ).toBeLessThan(0);
    expect(
      compareOurOrder(row("A", true, 1, 2), row("B", true, 1, 2)),
    ).toBeLessThan(0);
    expect(
      ourOrder([
        row("C", false, 0, 0),
        row("B", true, 0, 1),
        row("A", true, 0, 1),
      ]).map((entry) => entry.sku),
    ).toStrictEqual(["A", "B", "C"]);
  });
});

const shop = async (
  options: Parameters<typeof listingView>[1] = {},
  locale = "en",
): Promise<ListingView> => {
  const view = await listingView(
    { locale, pageType: "countryShopRoot", country: "poland" },
    { from: FROM, now: NOW, ...options },
  );
  if (view === undefined) throw new Error("the shop root must exist");
  return view;
};

describe("order and pages on the shop root (AC-91, AC-10)", () => {
  it("holds 24 cards on page 1, photographs first, and the last page is ceil(count / 24)", async () => {
    const first = await shop();
    expect(first.items).toHaveLength(24);
    expect(first.pageCount).toBe(Math.ceil(first.resultCount / 24));
    // Photograph first: no photographed card after an unphotographed one, across all pages.
    const all: string[] = [];
    for (let page = 1; page <= first.pageCount; page += 1) {
      all.push(...(await shop({ page })).items.map((card) => card.productId));
    }
    expect(all).toHaveLength(first.resultCount);
    const photos = all.map((sku) => hasCardPhoto(sku, "en"));
    const firstWithout = photos.indexOf(false);
    if (firstWithout >= 0) {
      expect(photos.slice(firstWithout).every((photo) => !photo)).toBe(true);
    }
    expect(
      await listingView(
        { locale: "en", pageType: "countryShopRoot", country: "poland" },
        { from: FROM, now: NOW, page: first.pageCount + 1 },
      ),
    ).toBeUndefined();
  });

  it("sorts `price-asc` by the displayed card price over the whole list", async () => {
    const first = await shop({ sort: "price-asc" });
    const amounts: bigint[] = [];
    for (let page = 1; page <= first.pageCount; page += 1) {
      amounts.push(
        ...(await shop({ sort: "price-asc", page })).items.map((card) =>
          BigInt(card.price.amountMinor),
        ),
      );
    }
    expect(amounts).toStrictEqual(
      [...amounts].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
  });
});

describe("the price and colour facets (AC-90)", () => {
  it("parses `?price=mid&colour=white` as a parameterised request carrying both", () => {
    const request = listingRequest({ price: "mid", colour: "white" });
    expect(request.facets).toStrictEqual({ price: "mid", colour: "white" });
    expect(request.parameterised).toBe(true);
    expect(request.canonicalPage).toBeUndefined();
  });

  it("keeps only the cards in the asked band of the country's own bands", async () => {
    const { bands, prices } = await countryPriceBands("en", "PL", NOW);
    if (bands === undefined) throw new Error("Poland has prices");
    const mid = await shop({ facets: { price: "mid" }, parameterised: true });
    const expected = [...prices.entries()].filter(
      ([, price]) => bandOf(bands, price.amountMinor) === "mid",
    );
    expect(mid.resultCount).toBe(expected.length);
    expect(mid.resultCount).toBeGreaterThan(0);
    for (const card of mid.items) {
      expect(bandOf(bands, card.price.amountMinor), card.productId).toBe("mid");
    }
    expect(mid.facet?.price?.key).toBe("mid");
    expect(mid.facet?.bareCount).toBe((await shop()).resultCount);
    expect(mid.directive).toBe("noindex,follow");
  });

  it("keeps only white products for `?colour=white`, and both filters intersect", async () => {
    const white = await shop({
      facets: { colour: "white" },
      parameterised: true,
    });
    const bare = await shop();
    expect(white.resultCount).toBeGreaterThan(0);
    expect(white.resultCount).toBeLessThan(bare.resultCount);
    const both = await shop({
      facets: { colour: "white", price: "high" },
      parameterised: true,
    });
    expect(both.resultCount).toBeLessThanOrEqual(white.resultCount);
  });

  it("renders a facet with no match as the line and the bare link, page 1, no grid, no 404", async () => {
    // A colour and band pairing that holds nothing in Poland with today's data.
    let empty: ListingView | undefined;
    search: for (const colour of [
      "blue",
      "orange",
      "purple",
      "pastel",
      "yellow",
    ] as const) {
      for (const price of ["low", "mid", "high"] as const) {
        const view = await shop({
          facets: { colour, price },
          parameterised: true,
        });
        if (view.resultCount === 0) {
          empty = view;
          break search;
        }
      }
    }
    if (empty === undefined) throw new Error("no empty facet pairing found");
    expect(empty.items).toHaveLength(0);
    expect(empty.page).toBe(1);
    const html = render(<CountryShopRootPage view={empty} />);
    expect(html).toContain('data-fo-facet-line="empty"');
    expect(html).not.toContain("data-fo-listing-grid=");
    expect(html).not.toContain("data-fo-listing-empty=");
    expect(html).toContain(`href="${empty.path}"`);
  });

  it("prints the band's amounts and never puts `price=` or `colour=` in an `<a href>`", async () => {
    const mid = await shop({
      facets: { price: "mid", colour: "white" },
      parameterised: true,
    });
    const html = render(<CountryShopRootPage view={mid} />);
    expect(html).toContain('data-fo-facet-line="result"');
    expect(html).toMatch(/ to /u);
    expect(html).toContain("White");
    const hrefs = [...html.matchAll(/<a\b[^>]*href="([^"]*)"/gu)].map(
      (match) => match[1] ?? "",
    );
    for (const href of hrefs) {
      expect(href).not.toMatch(/[?&](price|colour)=/u);
    }
    // The sort form carries the facet as hidden fields, so a re-sort keeps it.
    expect(html).toMatch(/<input[^>]*name="price"[^>]*value="mid"/u);
    expect(html).toMatch(/<input[^>]*name="colour"[^>]*value="white"/u);
  });

  it("keeps the facet across pages through a GET form, page 1's button sending no `page`", async () => {
    const white = await shop({
      facets: { colour: "white" },
      parameterised: true,
    });
    if (white.pageCount < 2) return;
    const html = render(<CountryShopRootPage view={white} />);
    const at = html.indexOf("data-fo-pagination");
    const pager = html.slice(at, html.indexOf("</nav>", at));
    expect(pager).toMatch(/<form[^>]*method="get"/u);
    const next =
      /<button[^>]*data-fo-pagination-next[^>]*>/u.exec(pager)?.[0] ?? "";
    expect(next).toContain('name="page"');
    expect(next).toContain('value="2"');
    expect(pager).not.toMatch(/<a\b/u);
  });

  it("filters a country category the same way, and ignores facets on a country occasion page", async () => {
    const category = await listingView(
      {
        locale: "en",
        pageType: "countryCategory",
        country: "poland",
        entity: "mixed-flowers",
      },
      {
        from: FROM,
        now: NOW,
        facets: { colour: "white" },
        parameterised: true,
      },
    );
    expect(category?.facet?.colour).toBe("white");
    if (category !== undefined) {
      const html = render(<CountryCategoryPage view={category} />);
      expect(html).toContain("data-fo-facet-line=");
    }
    const bareOccasion = await listingView(
      {
        locale: "en",
        pageType: "countryOccasion",
        country: "poland",
        entity: "mothers-day",
      },
      { from: FROM, now: NOW },
    );
    const facetedOccasion = await listingView(
      {
        locale: "en",
        pageType: "countryOccasion",
        country: "poland",
        entity: "mothers-day",
      },
      {
        from: FROM,
        now: NOW,
        facets: { colour: "white" },
        parameterised: true,
      },
    );
    expect(facetedOccasion?.facet).toBeUndefined();
    expect(facetedOccasion?.resultCount).toBe(bareOccasion?.resultCount);
    expect(facetedOccasion?.directive).toBe("noindex,follow");
  });
});

describe("local specials stay on their one country (AC-92, unit half)", () => {
  it("never lists a card flagged `localSpecial` in Poland in another shop country", async () => {
    const pl = await shop();
    const flagged = pl.items.filter((card) => card.localSpecial);
    const germany = await listingView(
      { locale: "en", pageType: "countryShopRoot", country: "germany" },
      { from: FROM, now: NOW },
    );
    const elsewhere = new Set(germany?.items.map((card) => card.productId));
    for (const card of flagged) {
      expect(elsewhere.has(card.productId), card.productId).toBe(false);
    }
  });
});
