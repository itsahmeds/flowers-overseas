/**
 * The two destination-less hubs as markup and as a view model (spec 008 §2 rows 10 and 13, §5.3
 * rows 3 and 4, **AC-7**, **AC-11**, §14 **A1**, **A3** and **A10**; T-07, T-11; TASK-112).
 *
 * `tests/unit/catalog-shop-page.test.tsx`'s pattern: `react-dom/server` over the **real**
 * `messages/*.json` and the **real** view model, so the asserted copy is the shipped copy and the
 * asserted dates are the committed calendar's own.
 *
 * Four properties live here because only this layer can prove them cheaply over *every* hub:
 *
 *  - **no money, by the type** (AC-7, §14 A3) — every hub view reads `hubItems` and never `items`,
 *    a `HubCardView` has no field a price could arrive in, `ListingViewSchema` refuses a view that
 *    carries both arrays, and the rendered document contains no currency symbol at all;
 *  - **the date table's two blanks are two different facts** (AC-11, §14 design-round Q6) — a
 *    destination that does not keep the occasion is **absent** from the table, a destination that
 *    keeps it but whose rule cannot be computed is a row with the date *said to be omitted*, and an
 *    **evergreen** occasion (§14 A1) has no table at all rather than seven blank rows;
 *  - **a link only where a page exists** — the picker names every published destination and links
 *    the ones `listingExists()` claims, which on the committed corpus is all seven for `roses` and
 *    none for `orchids` (below the floor in every destination);
 *  - **no date and no price literal** anywhere in the two components or their two namespaces.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  type ListingView,
  HubCardViewSchema,
  ListingViewSchema,
  listingPages,
  listingView,
} from "../../src/modules/catalog";
import { CategoryHubPage } from "../../src/modules/catalog/ui/CategoryHubPage.tsx";
import { OccasionHubPage } from "../../src/modules/catalog/ui/OccasionHubPage.tsx";
import { loadMessages } from "../../src/modules/i18n";
import {
  expectedPreloads,
  firstCardPhotograph,
  lcpNominations,
  nominatedImageCard,
} from "../support/lcp-nomination.ts";
import { listingHonestyViolations, textOf } from "../support/listing-honesty";

/** A fixed window start, so a rendered date is assertable without freezing a clock. */
const FROM = "2026-10-01";

/** Every namespace a hub document resolves. */
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

/**
 * Money, in any shape the four launch locales can print it. A hub that rendered one of these in
 * its `<main>` would be the failure AC-7 exists to catch.
 */
const MONEY = /[€£]|\bPLN\b|\bEUR\b|\bGBP\b|zł/u;

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

async function hubView(
  pageType: "categoryHub" | "occasionHub",
  entity: string,
  locale = "en",
): Promise<ListingView> {
  const view = await listingView({ locale, pageType, entity }, { from: FROM });
  if (view === undefined) {
    throw new Error(`the ${locale} ${pageType} ${entity} must exist`);
  }
  return view;
}

const roses = await hubView("categoryHub", "roses");
const orchids = await hubView("categoryHub", "orchids");
const mothersDay = await hubView("occasionHub", "mothers-day");
const birthday = await hubView("occasionHub", "birthday");
const allSaints = await hubView("occasionHub", "all-saints-day");

describe("a hub carries no money, and the type is what says so (AC-7, §14 A3)", () => {
  it("reads `hubItems` and never `items`, on every hub in the existence set", async () => {
    const hubs = (await listingPages("en")).filter(
      (page) =>
        page.pageType === "categoryHub" || page.pageType === "occasionHub",
    );
    expect(hubs.length).toBeGreaterThan(0);
    for (const page of hubs) {
      const view = await hubView(
        page.pageType === "categoryHub" ? "categoryHub" : "occasionHub",
        page.slug ?? "",
      );
      expect(view.items, page.path).toEqual([]);
      for (const card of view.hubItems) {
        expect(Object.keys(card), page.path).not.toContain("price");
        expect(Object.keys(card), page.path).not.toContain("priceLabelKey");
      }
    }
  });

  it("refuses a view that carries both arrays — the xor at the one parse exit", () => {
    const priced = {
      productId: "FO-TEST-1",
      name: "A bouquet",
      photo: { kind: "placeholder", slot: "grid" },
      price: { amountMinor: 1000, currency: "EUR" },
      priceLabelKey: "catalog.price.inclusive",
      provenance: "ai",
    };
    const both = { ...roses, items: [priced] };
    const parsed = ListingViewSchema.safeParse(both);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toMatch(/never both/u);
    // …and the same view with only `hubItems` is the one that parses.
    expect(ListingViewSchema.safeParse(roses).success).toBe(true);
  });

  it("refuses a hub card that grew a price", () => {
    const card = { ...roses.hubItems[0] };
    expect(HubCardViewSchema.safeParse(card).success).toBe(true);
    expect(
      HubCardViewSchema.safeParse({
        ...card,
        price: { amountMinor: 1000, currency: "EUR" },
      }).success,
    ).toBe(false);
  });

  for (const [name, view, Page] of [
    ["category hub", roses, CategoryHubPage],
    ["occasion hub", mothersDay, OccasionHubPage],
  ] as const) {
    it(`${name}: renders no currency symbol and does render the explanation`, () => {
      const html = render(<Page view={view} />, "en");
      const text = textOf(html);
      expect(text).not.toMatch(MONEY);
      expect(text).toContain("We show no price on this page");
      expect(text).toContain("the price depends on the destination");
      // Every card on the page is on the priceless branch, and there are cards.
      const cards = html.match(/data-fo-product-card-money="none"/gu) ?? [];
      expect(cards).toHaveLength(view.hubItems.length);
      expect(cards.length).toBeGreaterThan(0);
      expect(html).not.toContain('data-fo-product-card-money="priced"');
      expect(text).not.toContain("Includes VAT and delivery");
    });
  }

  for (const locale of ["en", "en-gb"] as const) {
    it(`${locale}: neither hub makes a claim we cannot evidence (AC-6)`, async () => {
      for (const [view, Page] of [
        [await hubView("categoryHub", "roses", locale), CategoryHubPage],
        [await hubView("occasionHub", "mothers-day", locale), OccasionHubPage],
      ] as const) {
        const html = render(<Page view={view} />, locale);
        expect(listingHonestyViolations({ text: textOf(html), html })).toEqual(
          [],
        );
      }
    });
  }
});

describe("AC-24's nomination on a hub (spec 008 §14 **A11**)", () => {
  /**
   * A11, applied to the two page types it names: **on a page whose first card carries no
   * photograph the page nominates nothing, and zero is asserted as a positive claim.** The three
   * shapes below are all real views of the committed corpus rather than fabrications, which is
   * what keeps the zero falsifiable — `expectedPreloads(firstCardPhotograph(html))` fails on a
   * preload of a placeholder, of an unrendered asset, or of a photograph further down the grid,
   * because it is compared against the **first card's own** `<source>` and nothing else.
   *
   * `tests/support/lcp-nomination.ts` is TASK-110/111's helper, reused rather than restated: one
   * idiom for this assertion across every listing page type is the point of A11's implementation
   * note.
   */
  it("nominates the first card's photograph, exactly once, when it has one", () => {
    // `/en/flowers/roses`: twelve cards, three of them photographs, the first of them the first
    // card. The numbers are the corpus's and are written here deliberately — a media flip that
    // changes them makes this case red rather than silently moving the nomination.
    expect(roses.hubItems[0]?.photo.kind).toBe("asset");
    const html = render(<CategoryHubPage view={roses} />, "en");
    const nominated = lcpNominations(html);
    expect(nominated.images).toBe(3);
    expect(nominated.eager).toBe(1);
    expect(nominated.high).toBe(1);
    expect(nominated.preloaded).toEqual(
      expectedPreloads(firstCardPhotograph(html)),
    );
    expect(nominatedImageCard(html)).toBe(0);
  });

  it("nominates nothing at all on a hub whose cards are all placeholders", () => {
    // `/en/occasions/mothers-day`: A11's founding case. No Mother's Day SKU has an approved
    // asset, so the grid renders seven captioned boxes and **no `<img>`** — the quantifier of
    // AC-24 has no subject, and the honest answer is zero. Asserted as four positive numbers,
    // not as the absence of an assertion.
    expect(
      mothersDay.hubItems.every((card) => card.photo.kind !== "asset"),
    ).toBe(true);
    const html = render(<OccasionHubPage view={mothersDay} />, "en");
    const nominated = lcpNominations(html);
    expect(nominated.images).toBe(0);
    expect(nominated.eager).toBe(0);
    expect(nominated.high).toBe(0);
    expect(firstCardPhotograph(html)).toBeUndefined();
    expect(nominated.preloaded).toEqual(expectedPreloads(undefined));
  });

  it("promotes no lower photograph when the first card is a placeholder", () => {
    // `/en/flowers/orchids` and `/en/occasions/all-saints-day` both render a photograph on their
    // **second** card. Preloading it would spend the LCP budget on a resource the LCP element —
    // the first card's fixed 4∶5 box — never uses, which is the half of A11 a 0-vs-0 comparison
    // cannot see: the page renders an image and still must nominate none.
    for (const [name, html] of [
      ["orchids", render(<CategoryHubPage view={orchids} />, "en")],
      ["all-saints-day", render(<OccasionHubPage view={allSaints} />, "en")],
    ] as const) {
      const nominated = lcpNominations(html);
      expect(nominated.images, name).toBe(1);
      expect(firstCardPhotograph(html), name).toBeUndefined();
      expect(nominated.preloaded, name).toEqual(expectedPreloads(undefined));
      expect(nominated.eager, name).toBe(0);
      expect(nominated.high, name).toBe(0);
      expect(nominatedImageCard(html), name).toBeUndefined();
    }
  });
});

describe("the category hub (§5.3 row 3, §13 Q4)", () => {
  const html = render(<CategoryHubPage view={roses} />, "en");
  const text = textOf(html);

  it("renders one `<h1>` and the authored intro under it", () => {
    expect(html.match(/<h1/gu)).toHaveLength(1);
    expect(text).toContain("Sending Roses");
    expect(roses.intro).toBeDefined();
    expect(text).toContain("Roses in red, pink, white");
  });

  it("puts the destinations before the products (§13 Q4: countries first)", () => {
    const destinations = html.indexOf("data-fo-hub-destinations");
    const products = html.indexOf("data-fo-hub-products");
    expect(destinations).toBeGreaterThan(-1);
    expect(destinations).toBeLessThan(products);
  });

  it("names every published destination, in `collator(locale)` order", () => {
    // **The stated list, read off the destination elements themselves** (TASK-143). This case
    // used to compare the count of rendered destinations to `roses.links.destinations.length` —
    // the view against its own page, so a view that named no destination (or only Poland) passed
    // as zero-vs-zero, and the "sorted" check ran over country names scraped from the whole page
    // text, which "See them with prices for Poland" satisfies on its own. Pinned to the committed
    // corpus: all seven published destinations, in English collation. A destination published or
    // withdrawn turns this red, and the new list is written here deliberately.
    const order = [
      ...html.matchAll(/data-fo-hub-destination="([A-Z]{2})"/gu),
    ].map((match) => match[1]);
    expect(order).toEqual(["FR", "DE", "IT", "NL", "PL", "RO", "ES"]);
  });

  it("links a destination only where its country page exists (spec 004 AC-14)", () => {
    for (const destination of roses.links.destinations) {
      expect(destination.href, destination.iso2).toBeDefined();
      expect(html, destination.iso2).toContain(
        `href="${destination.href ?? ""}"`,
      );
    }
    expect(html).toContain('data-fo-hub-destination-kind="link"');
    expect(text).toContain("See them with prices for Poland");
    expect(text).toContain("We can make 15 of them there.");
  });

  it("names a destination in words where it has no page, and links nothing", () => {
    // `orchids` is below the six-product floor in every destination, so its hub has no country
    // page to link at anywhere — the artboard's "text, not links" state, over the real corpus.
    const orchidsHtml = render(<CategoryHubPage view={orchids} />, "en");
    expect(orchids.links.destinations.every((d) => d.href === undefined)).toBe(
      true,
    );
    expect(orchidsHtml).not.toContain('data-fo-hub-destination-kind="link"');
    expect(
      orchidsHtml.match(/data-fo-hub-destination-kind="text"/gu),
    ).toHaveLength(orchids.links.destinations.length);
    expect(textOf(orchidsHtml)).toContain("No page yet.");
    // A picker with no link is still a list of the destinations we serve, and still no money.
    expect(textOf(orchidsHtml)).not.toMatch(MONEY);
  });

  it("is a breadcrumb of three crumbs whose middle one is text (§13 Q4)", () => {
    expect(roses.breadcrumb.map((crumb) => crumb.labelKey)).toEqual([
      "common.homeLink",
      "breadcrumb.shopRoot",
      "breadcrumb.entity",
    ]);
    // `/en/flowers` is a 404, so the crumb that would point at it is not a link.
    expect(roses.breadcrumb[1]?.href).toBeUndefined();
    expect(html).toContain('aria-current="page"');
  });

  it("adds no client island, no inline script and no form", () => {
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toMatch(/<form/iu);
    expect(html).not.toMatch(/<button/iu);
  });
});

describe("the occasion hub's date table (AC-11, §14 A1, A10, design-round Q6)", () => {
  const html = render(<OccasionHubPage view={mothersDay} />, "en");
  const text = textOf(html);

  it("prints a computed date for every destination that keeps the occasion", () => {
    const rows = html.match(/data-fo-hub-date="[A-Z]{2}"/gu) ?? [];
    expect(rows).toHaveLength(7);
    // Seven countries, seven rules, four different dates — none of them typed.
    expect(text).toContain("26 May 2027");
    expect(text).toContain("9 May 2027");
    expect(text).toContain("30 May 2027");
    expect(html).toContain("<caption");
    expect(html).toContain('scope="row"');
    expect(html).toContain('scope="col"');
  });

  it("has two columns: the third is TASK-111's (§14 A10)", () => {
    expect(html.match(/scope="col"/gu)).toHaveLength(2);
    expect(text).not.toContain("Our page");
  });

  it("omits a destination that does not keep the occasion, rather than blanking it", () => {
    // The Netherlands keeps no All Saints' Day: that is not a missing date, it is not a row.
    const absent = render(<OccasionHubPage view={allSaints} />, "en");
    expect(allSaints.occasionDates?.length).toBe(7);
    expect(allSaints.occasionDates?.filter((row) => row.observed)).toHaveLength(
      6,
    );
    expect(absent.match(/data-fo-hub-date="[A-Z]{2}"/gu)).toHaveLength(6);
    expect(absent).not.toContain('data-fo-hub-date="NL"');
  });

  it("renders no table at all for an evergreen occasion (§14 A1)", () => {
    // Birthday has no `occasion_country` row anywhere by design, so a table would be seven blank
    // rows — a column that could only ever say "no" is not information.
    const evergreen = render(<OccasionHubPage view={birthday} />, "en");
    expect(birthday.occasionDates?.every((row) => !row.observed)).toBe(true);
    expect(evergreen).not.toContain("data-fo-hub-dates");
    expect(evergreen).not.toContain("<table");
    // …and the page is still a page: heading, intro, sentence and cards.
    expect(evergreen.match(/<h1/gu)).toHaveLength(1);
    expect(evergreen).toContain("data-fo-listing-grid");
  });

  it("says a date is omitted where the rule cannot compute one (design-round Q6)", () => {
    // No committed rule returns `null` for an observed destination today — Romania's Orthodox
    // Easter arrives with `plan/13` B15 — so the branch is proved on a view with that one field
    // changed and everything else the shipped view's.
    const unknown: ListingView = {
      ...allSaints,
      occasionDates: (allSaints.occasionDates ?? []).map((row) =>
        row.iso2 === "RO" ? { ...row, date: null } : row,
      ),
    };
    const rendered = textOf(render(<OccasionHubPage view={unknown} />, "en"));
    expect(rendered).toContain("Omitted — we cannot compute this country");
    // Never a guess and never a neighbour's date reused.
    expect(ListingViewSchema.safeParse(unknown).success).toBe(true);
  });

  it("links the country pages that exist, and renders no such block when none does", () => {
    for (const destination of mothersDay.links.destinations) {
      expect(html, destination.iso2).toContain(
        `href="${destination.href ?? ""}"`,
      );
    }
    expect(text).toContain("flowers for Poland");
    // Birthday is observed nowhere, so no destination has a country-occasion page and the block
    // is absent rather than empty (§5.2: a block whose data is missing renders nothing).
    const evergreen = render(<OccasionHubPage view={birthday} />, "en");
    expect(birthday.links.destinations.every((d) => d.href === undefined)).toBe(
      true,
    );
    expect(evergreen).not.toContain("data-fo-hub-destinations");
  });

  it("formats every date through `formatDate`, in the locale's own shape", async () => {
    const gb = render(
      <OccasionHubPage
        view={await hubView("occasionHub", "mothers-day", "en-gb")}
      />,
      "en-gb",
    );
    expect(textOf(gb)).toMatch(/\d{1,2} [A-Z][a-z]+ 20\d\d/u);
  });
});

describe("no date and no price literal reaches a hub (AC-11's grep)", () => {
  it("neither component composes a date or a currency", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of ["CategoryHubPage.tsx", "OccasionHubPage.tsx"]) {
      const source = readFileSync(
        new URL(`../../src/modules/catalog/ui/${file}`, import.meta.url),
        "utf8",
      );
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // A month name, a `YYYY-MM-DD`, a bare year, or a currency symbol in code.
      expect(code, file).not.toMatch(
        /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/u,
      );
      expect(code, file).not.toMatch(/\b20\d\d-\d\d-\d\d\b/u);
      expect(code, file).not.toMatch(/[€£]|\bPLN\b|\bEUR\b/u);
      // `formatDate` and `formatMoney`: the first is the only way a date is printed here, and the
      // second never appears at all — a hub has nothing to format.
      expect(source, file).not.toContain("formatMoney");
    }
  });

  it("neither namespace carries a date or a price literal", () => {
    for (const locale of ["en", "en-gb", "de", "pl"] as const) {
      const messages = loadMessages(locale, ["categoryHub", "occasionHub"]);
      const values = JSON.stringify(messages);
      expect(values, locale).not.toMatch(
        /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/u,
      );
      expect(values, locale).not.toMatch(/\b20\d\d\b/u);
      expect(values, locale).not.toMatch(/[€£]|\bPLN\b|zł/u);
    }
  });
});
