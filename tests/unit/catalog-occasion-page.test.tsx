/**
 * The country occasion as markup (spec 008 §5.3 row 2, **AC-1**, AC-6, the country half of
 * **AC-11**; T-11, T-30; TASK-111).
 *
 * `tests/unit/catalog-shop-page.test.tsx`'s pattern: `react-dom/server` over the **real**
 * `messages/*.json` and the **real** view model, so the asserted copy is the shipped copy, the
 * asserted prices are the seeded catalogue's own and the asserted date is the one
 * `occasionDate(rule, year)` produced for that destination.
 *
 * What only this layer proves:
 *
 *  - the **dated line** is rendered by `formatDate` from the view model's ISO date, in each
 *    locale's own format, and **no component or message string contains a date literal** (AC-11's
 *    last clause, checked by a grep over `src/` and `messages/`);
 *  - the **honest blank** of §14 design round **Q6** — a row with `date: null` prints the sentence
 *    that says we are not printing a date, and never a guessed one;
 *  - the page **claims nothing** (AC-6) — the shared patterns of `tests/support/listing-honesty.ts`
 *    over the rendered text and markup.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type ListingView, listingView } from "../../src/modules/catalog";
import { CountryOccasionPage } from "../../src/modules/catalog/ui/CountryOccasionPage.tsx";
import { loadMessages } from "../../src/modules/i18n";
import { listingHonestyViolations, textOf } from "../support/listing-honesty";

/** A fixed window start, so the rendered date is assertable without freezing a clock. */
const FROM = "2026-09-15";

/** Every namespace a country-occasion document resolves. */
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

/**
 * `textOf()` strips tags but leaves HTML entities as React escaped them, and every occasion name
 * in this corpus carries an apostrophe. Decoding the three entities React emits keeps the
 * assertions written in the words a reader sees.
 */
function readable(html: string): string {
  return textOf(html)
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

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
    { locale, pageType: "countryOccasion", country, entity: "mothers-day" },
    { from: FROM },
  );
  if (view === undefined) {
    throw new Error(`the ${locale} ${country} occasion page must exist`);
  }
  return view;
}

const en = await viewFor("en", "poland");

describe("the country occasion page (§5.3 row 2)", () => {
  const html = render(<CountryOccasionPage view={en} />, "en");
  const text = readable(html);

  it("renders one `<h1>`, and it names the occasion and the destination", () => {
    expect(html.match(/<h1/gu)).toHaveLength(1);
    expect(text).toContain("Mother's Day flowers for Poland");
  });

  it("prints the destination's own date, formatted and never typed", () => {
    // 26 May is Poland's fixed rule; the window starts in September 2026, so the next one is 2027.
    expect(en.occasionDates?.[0]?.date).toBe("2027-05-26");
    expect(text).toContain("Mother's Day in Poland is Wednesday, 26 May 2027.");
    expect(html).toContain('data-fo-occasion-date="2027-05-26"');
    expect(text).toContain("That is the date Poland keeps for it");
  });

  it("opens with the dated line and the grid, before the links out", () => {
    const dated = html.indexOf("data-fo-occasion-date");
    const grid = html.indexOf("data-fo-listing-grid");
    const links = html.indexOf("occasion-siblings");
    expect(dated).toBeGreaterThan(-1);
    expect(dated).toBeLessThan(grid);
    expect(grid).toBeLessThan(links);
  });

  it("carries the demo sentence and no purchase affordance (§13 Q8)", () => {
    expect(text).toContain("You cannot order yet");
    expect(html).not.toMatch(/<button/iu);
    // The toolbar's sort form and the pagination nav are TASK-114's (§14 A8 (c)).
    expect(html).not.toMatch(/<form/iu);
    expect(html).not.toContain("data-fo-pagination");
  });

  it("prices every card, with the inclusive wording and the stale-FX sentence", () => {
    const cards = html.match(/data-fo-product-card="/gu) ?? [];
    expect(cards.length).toBe(en.items.length);
    expect(cards.length).toBeGreaterThanOrEqual(6);
    expect(text).toContain("Includes VAT and delivery");
    expect(en.fxFallback).toBe(true);
    expect(text).toContain("currency of the delivery country");
  });

  it("is a breadcrumb through the shop root and the occasions, with the leaf marked", () => {
    expect(en.breadcrumb.map((crumb) => crumb.labelKey)).toEqual([
      "common.homeLink",
      "breadcrumb.destinations",
      "destinations.pl.name",
      "breadcrumb.shopRoot",
      "breadcrumb.occasions",
      "breadcrumb.entity",
    ]);
    expect(html).toContain('aria-current="page"');
    // The occasions crumb is **text** while TASK-113 has not published its link id: a crumb is
    // never a link to a 404 (spec 004 AC-14).
    expect(html).not.toContain('href="/en/occasions"');
    expect(readable(html.slice(0, html.indexOf("</nav>")))).toContain(
      "Mother's Day",
    );
  });

  it("links out to the shop root and to no page that does not exist", () => {
    expect(html).toContain('href="/en/poland/flowers"');
    expect(text).toContain("Flowers for Poland");
    // The other Polish occasions are all below the floor, so none of them is a chip.
    for (const href of html.match(/href="\/en\/poland\/occasions\/[^"]+"/gu) ??
      []) {
      expect(href).toBe('href="/en/poland/occasions/mothers-day"');
    }
  });

  it("nominates at most one LCP candidate and adds no script (§5.4, AC-24)", () => {
    const priority = en.items.filter(
      (card, index) => index === 0 && card.photo.kind === "asset",
    );
    expect(html.match(/fetchpriority="high"/gu) ?? []).toHaveLength(
      priority.length,
    );
    expect(html.match(/loading="eager"/gu) ?? []).toHaveLength(0);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });
});

describe("the honest blank (§14 design round Q6)", () => {
  /**
   * An occasion the destination observes with rule `none` — Poland's name day, and Romania's
   * Orthodox Easter until TASK-122 dated it. No such page exists on the committed corpus (none of
   * them clears the six-product floor), so the state is fabricated from the real view with its
   * date removed. Everything else is the shipped view.
   */
  const undated: ListingView = {
    ...en,
    occasionDates: [
      { ...(en.occasionDates?.[0] ?? { iso2: "PL", nameKey: "" }), date: null },
    ],
  };
  const html = render(<CountryOccasionPage view={undated} />, "en");
  const text = readable(html);

  it("says that it is not printing a date, and prints none", () => {
    expect(text).toContain(
      "We are not printing a date for Mother's Day in Poland",
    );
    expect(text).not.toMatch(/\d{1,2} May 20\d\d/u);
    expect(html).toContain('data-fo-occasion-date=""');
  });

  it("drops the note that explains a date it does not have", () => {
    expect(text).not.toContain("That is the date Poland keeps for it");
  });
});

describe("every locale that has the page (AC-6, T-30)", () => {
  for (const [locale, country] of [
    ["en", "poland"],
    ["en", "france"],
    ["en-gb", "poland"],
  ] as const) {
    it(`${locale} ${country}: no rating, badge, countdown, old price or basket`, async () => {
      const view = await viewFor(locale, country);
      const html = render(<CountryOccasionPage view={view} />, locale);
      expect(listingHonestyViolations({ text: textOf(html), html })).toEqual(
        [],
      );
    });
  }

  it("`en-gb` formats the date in its own locale's shape", async () => {
    const view = await viewFor("en-gb", "germany");
    const html = render(<CountryOccasionPage view={view} />, "en-gb");
    expect(view.occasionDates?.[0]?.date).toBe("2027-05-09");
    expect(readable(html)).toContain(
      "Mother's Day in Germany is Sunday, 9 May 2027.",
    );
  });
});

describe("no date literal anywhere it could be typed (AC-11)", () => {
  const repoRoot = resolve(__dirname, "../..");

  /** A day-and-month or an ISO date written into copy or into a component. */
  const DATE_LITERAL =
    /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/u;

  it("no shipped message value contains one", () => {
    for (const file of ["en.json", "en-gb.json", "de.json", "pl.json"]) {
      const flat = JSON.stringify(
        JSON.parse(readFileSync(resolve(repoRoot, "messages", file), "utf8")),
      );
      expect(DATE_LITERAL.test(flat), file).toBe(false);
    }
  });

  it("no listing component contains one", () => {
    const dir = resolve(repoRoot, "src/modules/catalog/ui");
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), "utf8");
      // The `T12:00:00Z` instant is a *time*, not a date: it is what makes one ISO date the same
      // calendar day in every European zone. Nothing here names a month or a year.
      expect(DATE_LITERAL.test(source), file).toBe(false);
    }
  });
});
