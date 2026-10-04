/**
 * The equivalents line as the listing pages render it (spec 004 §14 A21 clause 6 (b)–(e); spec 008
 * T-06's equivalents case; TASK-178, `/break` round 1 hole 2 on PR 169).
 *
 * `tests/unit/catalog-listing-equivalents.test.ts` proves the view model carries the amounts, and
 * `tests/unit/ui-shop-equivalents.test.ts` proves the card prints them. Neither renders a *page*,
 * and CI serves a snapshot that is always stale, so no browser test sees a line either: a page that
 * dropped `equivalents` between the view and the card would pass everything. Here every
 * country-scoped page type is rendered from `listingView()` with one fixed clock inside the
 * committed snapshot's window (`fx.data.ts`, `as_of` 2026-09-08) and the real messages, and the
 * markup must carry **exactly one** line per priced card — none on a destination-less hub, which
 * has no price. The same pages past the age bound carry no line and say which currency they quote.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type ListingView, listingView } from "../../src/modules/catalog";
import { CategoryHubPage } from "../../src/modules/catalog/ui/CategoryHubPage.tsx";
import { CountryCategoryPage } from "../../src/modules/catalog/ui/CountryCategoryPage.tsx";
import { CountryOccasionPage } from "../../src/modules/catalog/ui/CountryOccasionPage.tsx";
import { CountryShopRootPage } from "../../src/modules/catalog/ui/CountryShopRootPage.tsx";
import { OccasionHubPage } from "../../src/modules/catalog/ui/OccasionHubPage.tsx";
import { loadMessages } from "../../src/modules/i18n";

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

/** Every country-scoped page type, as `/en` renders it for Poland. */
const COUNTRY_PAGES = [
  {
    name: "the shop root",
    identity: { locale: "en", pageType: "countryShopRoot", country: "poland" },
    page: (v: ListingView) => <CountryShopRootPage view={v} />,
  },
  {
    name: "the country category",
    identity: {
      locale: "en",
      pageType: "countryCategory",
      country: "poland",
      entity: "roses",
    },
    page: (v: ListingView) => <CountryCategoryPage view={v} />,
  },
  {
    name: "the country occasion",
    identity: {
      locale: "en",
      pageType: "countryOccasion",
      country: "poland",
      entity: "mothers-day",
    },
    page: (v: ListingView) => <CountryOccasionPage view={v} />,
  },
] as const;

describe("a fresh rate: exactly one equivalents line per priced card (A21 clause 6 (b), (c))", () => {
  it.each(COUNTRY_PAGES)("$name", async ({ identity, page }) => {
    const v = await view(identity as Identity, FRESH);
    const html = render(page(v), "en");
    const rendered = cards(html);
    expect(rendered).toHaveLength(v.items.length);
    expect(rendered.length).toBeGreaterThan(0);
    for (const card of rendered) {
      expect(card).toContain('data-fo-product-card-money="priced"');
      expect(occurrences(card, LINE)).toBe(1);
    }
    expect(occurrences(html, LINE)).toBe(v.items.length);
    // The line is the approximate one, at the snapshot's date, and never the charged amount
    // restated: the first card's line names the other three currencies of the set.
    const first = rendered[0]!;
    const line = first.slice(first.indexOf(LINE));
    expect(line).toMatch(/about .*£.*PLN.*US\$.* at the rate of 8 September/su);
    expect(html).not.toContain("data-fo-fx-fallback");
  });
});

describe("a destination-less hub: no price, so no line (A21 clause 6 (e), spec 008 AC-7)", () => {
  it.each([
    {
      name: "the category hub",
      identity: { locale: "en", pageType: "categoryHub", entity: "roses" },
      page: (v: ListingView) => <CategoryHubPage view={v} />,
    },
    {
      name: "the occasion hub",
      identity: {
        locale: "en",
        pageType: "occasionHub",
        entity: "mothers-day",
      },
      page: (v: ListingView) => <OccasionHubPage view={v} />,
    },
  ] as const)("$name", async ({ identity, page }) => {
    const v = await view(identity as Identity, FRESH);
    const html = render(page(v), "en");
    expect(cards(html).length).toBeGreaterThan(0);
    expect(occurrences(html, LINE)).toBe(0);
  });
});

describe("a stale rate: no line, and the page says which currency it quotes (A21 clause 6 (d))", () => {
  it.each(COUNTRY_PAGES)("$name", async ({ identity, page }) => {
    const v = await view(identity as Identity, STALE);
    const html = render(page(v), "en");
    expect(cards(html).length).toBeGreaterThan(0);
    expect(occurrences(html, LINE)).toBe(0);
    expect(occurrences(html, "data-fo-fx-fallback")).toBe(1);
  });
});
