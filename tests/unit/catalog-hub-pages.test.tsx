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
import { atWidth, pictures } from "../support/per-width-priority.ts";
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
      expect(text).toContain("The price depends on the destination.");
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

describe("the priority image per width on a hub (spec 004 §14 A24 clause 5, AC-36; spec 008 §14 A11)", () => {
  /**
   * A24 clause 5 rebinds AC-24's "exactly one" per width: **from `md` up** the one priority image
   * is R2's lead figure, and **below `md`** it is the first grid card's photograph; each width has
   * exactly one displayed `fetchpriority="high"` image and exactly one preload whose `media`
   * matches it, naming that image's own ladder. The lead figure is never downloaded below `md`
   * (its `<picture>` selects a blank source there). A11's zero holds per width: a width whose
   * candidate is a placeholder nominates nothing, and no lower photograph is promoted.
   */
  /** A real hub view with the named cards' photographs (and optionally the lead's) withdrawn. */
  function withPlaceholderAt(
    view: ListingView,
    indices: readonly number[],
    lead = false,
  ): ListingView {
    return {
      ...view,
      ...(lead && view.hubLead !== undefined
        ? {
            hubLead: {
              ...view.hubLead,
              photo: { kind: "placeholder", slot: "grid" } as const,
            },
          }
        : {}),
      hubItems: view.hubItems.map((card, index) =>
        indices.includes(index)
          ? { ...card, photo: { kind: "placeholder", slot: "grid" } as const }
          : card,
      ),
    };
  }

  /** The `<picture>` inside the lead figure, and the first one inside the grid's first card. */
  function subjects(html: string): {
    readonly lead: number | undefined;
    readonly firstCard: number | undefined;
  } {
    const leadAt = html.indexOf("data-fo-hub-lead=");
    const cardAt = html.indexOf("data-fo-product-card=");
    const nextCard = html.indexOf("data-fo-product-card=", cardAt + 1);
    const all = pictures(html);
    const inside = (from: number, to: number): number | undefined =>
      all.find((picture) => picture.index > from && picture.index < to)?.index;
    return {
      lead:
        leadAt === -1
          ? undefined
          : inside(leadAt, cardAt === -1 ? html.length : cardAt),
      firstCard:
        cardAt === -1
          ? undefined
          : inside(cardAt, nextCard === -1 ? html.length : nextCard),
    };
  }

  for (const [name, view, Page] of [
    ["category hub (roses)", roses, CategoryHubPage],
    ["occasion hub (Birthday)", birthday, OccasionHubPage],
    ["occasion hub (Mother's Day)", mothersDay, OccasionHubPage],
  ] as const) {
    it(`${name}: the lead from \`md\` up and the first card below \`md\`, one each`, () => {
      expect(view.hubLead?.photo.kind).toBe("asset");
      expect(view.hubItems[0]?.photo.kind).toBe("asset");
      const html = render(<Page view={view} />, "en");
      const at = subjects(html);
      const desktop = atWidth(html, "md-up");
      const phone = atWidth(html, "below-md");

      expect(desktop.high).toHaveLength(1);
      expect(desktop.high[0]?.index).toBe(at.lead);
      expect(desktop.preloads).toHaveLength(1);
      expect(desktop.preloads[0]?.srcset).toBe(desktop.high[0]?.srcset);
      expect(desktop.preloads[0]?.sizes).toBe(desktop.high[0]?.sizes);
      expect(desktop.eager).toHaveLength(1);

      expect(phone.high).toHaveLength(1);
      expect(phone.high[0]?.index).toBe(at.firstCard);
      expect(phone.preloads).toHaveLength(1);
      expect(phone.preloads[0]?.srcset).toBe(phone.high[0]?.srcset);
      expect(phone.preloads[0]?.sizes).toBe(phone.high[0]?.sizes);
      expect(phone.eager).toHaveLength(1);

      // The lead figure is never downloaded below `md`: its picture is displayed from `md` only.
      expect(
        pictures(html).find((picture) => picture.index === at.lead)
          ?.displayedAt,
      ).toBe("md-up");
    });
  }

  it("is the registry's `leadSku`, outside the grid's order and not an `ItemList` element (R2)", () => {
    expect(birthday.hubLead?.productId).toBe("FO-BQ-023");
    expect(roses.hubLead?.productId).toBe("FO-BQ-002");
    expect(mothersDay.hubLead?.productId).toBe("FO-BQ-007");
    const html = render(<OccasionHubPage view={birthday} />, "en");
    // The figure is a figure: no link, no card, no list item.
    const figure =
      /<figure[^>]*data-fo-hub-lead[\s\S]*?<\/figure>/u.exec(html)?.[0] ?? "";
    expect(figure).not.toBe("");
    expect(figure).not.toContain("<a ");
    expect(figure).not.toContain("data-fo-product-card");
  });

  it("nominates nothing at all where every photograph is a placeholder", () => {
    const allPlaceholders = withPlaceholderAt(
      mothersDay,
      mothersDay.hubItems.map((_card, index) => index),
      true,
    );
    const html = render(<OccasionHubPage view={allPlaceholders} />, "en");
    for (const width of ["md-up", "below-md"] as const) {
      const at = atWidth(html, width);
      expect(at.high, width).toHaveLength(0);
      expect(at.eager, width).toHaveLength(0);
      expect(at.preloads, width).toHaveLength(0);
    }
    expect(pictures(html)).toHaveLength(0);
  });

  it("promotes no lower photograph below `md` when the first card is a placeholder", () => {
    for (const [name, html] of [
      [
        "orchids",
        render(
          <CategoryHubPage view={withPlaceholderAt(orchids, [0])} />,
          "en",
        ),
      ],
      [
        "all-saints-day",
        render(
          <OccasionHubPage view={withPlaceholderAt(allSaints, [0])} />,
          "en",
        ),
      ],
    ] as const) {
      const phone = atWidth(html, "below-md");
      expect(phone.high, name).toHaveLength(0);
      expect(phone.eager, name).toHaveLength(0);
      expect(phone.preloads, name).toHaveLength(0);
      // From `md` up the lead figure is still the one image (its own photograph).
      expect(atWidth(html, "md-up").high, name).toHaveLength(1);
    }
  });
});

describe("the category hub (§5.3 row 3, §13 Q4)", () => {
  const html = render(<CategoryHubPage view={roses} />, "en");
  const text = textOf(html);

  it("renders one `<h1>` and the authored intro under it", () => {
    expect(html.match(/<h1/gu)).toHaveLength(1);
    expect(text).toContain("Roses to send abroad");
    expect(roses.intro).toBeDefined();
    expect(text).toContain("Roses in red, pink, white");
  });

  it("puts the destinations before the products (§13 Q4: countries first)", () => {
    const destinations = html.indexOf("data-fo-hub-pills");
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
    // R4: each pill is one link named by `categoryHub.destinationLink`, its visible text the
    // country and the count.
    expect(html).toContain('aria-label="See them with prices for Poland"');
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

  it("names the date section with its eyebrow and its `<h2>`", () => {
    // The visual baselines photograph this frame but not the dated rows (`tests/visual/dated-blocks.css`);
    // the heading text is pinned here as well, so a blanked `<h2>` fails a unit test too.
    const heading = /<h2[^>]*id="hub-dates-heading"[^>]*>([^<]*)<\/h2>/u.exec(
      html,
    );
    expect(heading?.[1]).toBe("When it falls, where we deliver");
    expect(text).toContain("The dates");
  });

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

  it("puts its chip row of destinations above the grid, and none after it (AC-33; TASK-241)", () => {
    // Spec 008 §14 A-founder-2026-10-14c: on a hub where a chip row renders, it precedes the grid.
    const chips = html.indexOf("data-fo-hub-destinations");
    const grid = html.indexOf("data-fo-listing-grid=");
    expect(chips).toBeGreaterThan(-1);
    expect(grid).toBeGreaterThan(-1);
    expect(chips).toBeLessThan(grid);
    expect(html.slice(grid)).not.toContain("data-fo-hub-destination");
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
    // Birthday is observed nowhere, so no destination has a country-occasion page: each country
    // links its category of the same key instead (`occasion-hub-desktop`: "Birthday flowers for
    // France" goes to `/france/flowers/birthday-flowers`), never a dead end (QA 2026-10-18 Q1-12).
    const evergreen = render(<OccasionHubPage view={birthday} />, "en");
    expect(birthday.links.destinations.map((d) => d.href)).toEqual([
      "/en/poland/flowers/birthday-flowers",
      "/en/germany/flowers/birthday-flowers",
      "/en/france/flowers/birthday-flowers",
      "/en/spain/flowers/birthday-flowers",
      "/en/italy/flowers/birthday-flowers",
      "/en/romania/flowers/birthday-flowers",
      "/en/netherlands/flowers/birthday-flowers",
    ]);
    expect(evergreen).toContain('aria-label="Birthday flowers for Poland"');
    expect(evergreen).toContain('href="/en/poland/flowers/birthday-flowers"');
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
