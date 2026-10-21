/**
 * Both Polish Grandparents' Day dates, rendered (spec 008 §14 A-founder-2026-10-21c item 4,
 * **AC-76**; the unit (component) half of T-76; TASK-317).
 *
 * With the clock fixed at 2026-10-21, in `en`, `en-gb`, `de` and `pl`:
 *
 *  - the hub's dates table holds, in the Poland row, both days in order, joined the way
 *    `Intl.ListFormat` joins them; the Spanish row (26 July) and the Italian row (2 October) one
 *    date each;
 *  - the hub's first-screen Poland card holds both days the same way;
 *  - the Poland country occasion page's dated line holds both;
 *  - the corridor calendar for Poland, the occasions index's "next six" and the shop root's
 *    "Coming up" list `grandparents_day` once, by its primary date.
 *
 * The expectation is computed here with `formatDate` and a fresh `Intl.ListFormat`, not with the
 * helper the components call, so a renderer that dropped the second day, or put it in the wrong
 * row, fails against an independent string.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LocaleCode } from "../../src/config/locales.ts";
import {
  type ListingView,
  listingPages,
  listingView,
} from "../../src/modules/catalog";
import { CountryOccasionPage } from "../../src/modules/catalog/ui/CountryOccasionPage.tsx";
import { OccasionHubPage } from "../../src/modules/catalog/ui/OccasionHubPage.tsx";
import { corridorView } from "../../src/modules/geo/index.ts";
import { formatDate, loadMessages } from "../../src/modules/i18n";
import { textOf } from "../support/listing-honesty";

const FROM = "2026-10-21";
const NOW = new Date("2026-10-21T12:00:00Z");

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

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

/** React's three entities back to the characters a reader sees. */
function readable(html: string): string {
  return textOf(html)
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

/** One ISO day as the page formats it, at the hour that is that day in every European zone. */
function day(
  iso: string,
  locale: LocaleCode,
  style: "calendarDate" | "dayMonth",
): string {
  return formatDate(new Date(`${iso}T12:00:00Z`), locale, style, "UTC");
}

/** The two days joined as `Intl.ListFormat` joins them in that locale. */
function joined(
  isos: readonly string[],
  locale: LocaleCode,
  style: "calendarDate" | "dayMonth",
): string {
  const tag = locale === "en" ? "en-US" : locale === "en-gb" ? "en-GB" : locale;
  return new Intl.ListFormat(tag, {
    type: "conjunction",
    style: "long",
  }).format(isos.map((iso) => day(iso, locale, style)));
}

/** The element whose opening tag carries `attribute`, whole (one level of nesting is enough). */
function element(html: string, tag: string, attribute: string): string {
  const match = new RegExp(
    `<${tag}[^>]*${attribute}[^>]*>.*?</${tag}>`,
    "su",
  ).exec(html);
  return match?.[0] ?? "";
}

async function slugOf(
  locale: LocaleCode,
  pageType: "occasionHub" | "countryOccasion",
  iso2?: string,
): Promise<{ slug: string; country?: string }> {
  const page = (await listingPages(locale)).find(
    (candidate) =>
      candidate.pageType === pageType &&
      candidate.entityKey === "grandparents_day" &&
      (iso2 === undefined || candidate.countryIso === iso2),
  );
  if (page?.slug === undefined) {
    throw new Error(`no ${locale} ${pageType} for grandparents_day`);
  }
  return {
    slug: page.slug,
    ...(page.countrySlug === undefined ? {} : { country: page.countrySlug }),
  };
}

async function hubView(locale: LocaleCode): Promise<ListingView> {
  const { slug } = await slugOf(locale, "occasionHub");
  const view = await listingView(
    { locale, pageType: "occasionHub", entity: slug },
    { from: FROM, now: NOW },
  );
  if (view === undefined) throw new Error(`${locale} hub`);
  return view;
}

const POLAND = ["2027-01-21", "2027-01-22"] as const;

describe.each(LOCALES)("AC-76 in %s: the Grandparents' Day hub", (locale) => {
  it("carries both Polish days on the view model, and one elsewhere", async () => {
    const view = await hubView(locale);
    const rows = new Map(
      (view.occasionDates ?? []).map((row) => [row.iso2, row]),
    );
    expect(rows.get("PL")?.date).toBe("2027-01-21");
    expect(rows.get("PL")?.alsoDates).toEqual(["2027-01-22"]);
    expect(rows.get("ES")?.date).toBe("2027-07-26");
    expect(rows.get("ES")?.alsoDates).toBeUndefined();
    expect(rows.get("IT")?.date).toBe("2027-10-02");
    expect(rows.get("IT")?.alsoDates).toBeUndefined();
  });

  it("prints both Polish days in the table's Poland cell and the Poland card, Spain and Italy one", async () => {
    const html = render(
      <OccasionHubPage view={await hubView(locale)} />,
      locale,
    );

    const polandRow = readable(element(html, "tr", 'data-fo-hub-date="PL"'));
    expect(polandRow).toContain(joined(POLAND, locale, "calendarDate"));

    const polandCard = readable(
      element(html, "div", 'data-fo-hub-first-date="PL"') ||
        element(html, "a", 'data-fo-hub-first-date="PL"'),
    );
    expect(polandCard).toContain(joined(POLAND, locale, "dayMonth"));

    const spainRow = readable(element(html, "tr", 'data-fo-hub-date="ES"'));
    const spainDate = day("2027-07-26", locale, "calendarDate");
    expect(spainRow).toContain(spainDate);
    // One date only: the cell is the one value, no second day joined to it.
    expect(
      spainRow.slice(spainRow.indexOf(spainDate) + spainDate.length).trim(),
    ).toBe("");
    const italyRow = readable(element(html, "tr", 'data-fo-hub-date="IT"'));
    const italyDate = day("2027-10-02", locale, "calendarDate");
    expect(italyRow).toContain(italyDate);
    expect(
      italyRow.slice(italyRow.indexOf(italyDate) + italyDate.length).trim(),
    ).toBe("");
  });

  it("prints both Polish days on the Poland country occasion page's dated line", async () => {
    const { slug, country } = await slugOf(locale, "countryOccasion", "PL");
    const view = await listingView(
      { locale, pageType: "countryOccasion", country, entity: slug },
      { from: FROM, now: NOW },
    );
    expect(view?.occasionDates?.[0]?.alsoDates).toEqual(["2027-01-22"]);
    const html = render(<CountryOccasionPage view={view!} />, locale);
    const line = readable(element(html, "p", "data-fo-occasion-date="));
    expect(line).toContain(joined(POLAND, locale, "calendarDate"));
  });
});

describe("AC-76: the date-ordered lists list the occasion once", () => {
  it("in en, the Poland cell reads 21, January, 22, January in that order", async () => {
    const html = render(<OccasionHubPage view={await hubView("en")} />, "en");
    const polandRow = readable(element(html, "tr", 'data-fo-hub-date="PL"'));
    expect(polandRow).toMatch(/21\D*January.*\b22\D*January/u);
  });

  it.each(LOCALES)(
    "%s: the shop root's Coming up and the occasions index's next six hold one grandparents_day",
    async (locale) => {
      const pages = await listingPages(locale);
      const root = pages.find(
        (page) =>
          page.pageType === "countryShopRoot" && page.countryIso === "PL",
      );
      const shop = await listingView(
        { locale, pageType: "countryShopRoot", country: root?.countrySlug },
        { from: FROM, now: NOW },
      );
      const coming = (shop?.occasionDates ?? []).filter(
        (row) => row.nameKey === "catalog.facet.occasion.grandparentsDay",
      );
      expect(coming.map((row) => row.date)).toEqual(["2027-01-21"]);
      expect(coming[0]?.alsoDates).toBeUndefined();

      const index = await listingView(
        { locale, pageType: "occasionsIndex" },
        { from: FROM, now: NOW },
      );
      const next = (index?.nextOccasions ?? []).filter(
        (entry) => entry.key === "grandparents_day",
      );
      expect(next.map((entry) => entry.nextDate)).toEqual(["2027-01-21"]);
    },
  );

  it("the corridor calendar for Poland lists it once, on 21 January", () => {
    const view = corridorView("PL", "en", { from: FROM });
    const rows = (view?.occasions ?? []).filter(
      (row) => row.occasionKey === "grandparents_day",
    );
    expect(rows.map((row) => row.date)).toEqual(["2027-01-21"]);
  });
});
