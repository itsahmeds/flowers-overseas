/**
 * **Poland reads "Ordering opens soon"** — the unit halves of spec 007 §14 A-founder-2026-10-14c
 * (founder ruling D2 A, 2026-10-14; TASK-239): T-34 (AC-33), T-35 (AC-34) and T-36 (AC-35).
 *
 * The site test of 2026-10-14 found Poland `live` in the registry while every page said "not
 * delivering yet", a Warsaw cutoff still printed in places, and "not yet" said four ways a page.
 * This file pins the three halves of the fix against the committed data and against two fixtures
 * (`tests/fixtures/poland-registry.ts`):
 *
 *  - **registry-live** — Poland `status: "live"` with nobody to make the flowers. It is the
 *    disagreement AC-35 forbids, and the grid must still not say "Delivering now" over it: that is
 *    the mutation T-34 names (the grid reading `country.status` again).
 *  - **Poland-open** — its committed `operations` block, an active florist and `status: "live"`:
 *    Poland's live state and cutoff render, and only Poland's.
 *
 * The e2e halves (the served documents of every guide, listing and product page in four locales)
 * are `tests/e2e/ordering-state.spec.ts`.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  COUNTRIES,
  type CountryConfig,
  countryConfig,
  deliveryDatesOpen,
  statusDisagreements,
} from "../../src/config/countries.ts";
import {
  ListingBreadcrumb,
  type ProductView,
  productView,
} from "../../src/modules/catalog";
import { availability } from "../../src/modules/catalog/availability.ts";
import { catalogAvailabilityKeys } from "../../src/modules/catalog/types.ts";
import {
  corridorStateKey,
  corridorView,
} from "../../src/modules/geo/corridor.ts";
import { withActivePartnersProvider } from "../../src/modules/geo/partners.ts";
import { CorridorFacts } from "../../src/modules/geo/ui/CorridorFacts.tsx";
import { DestinationsHubPage } from "../../src/modules/geo/ui/DestinationsHubPage.tsx";
import { loadMessages } from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import { DestinationsGrid } from "../../src/modules/ui/home/DestinationsGrid.tsx";
import { HomeFaq } from "../../src/modules/ui/home/HomeFaq.tsx";
import {
  destinationStatusProviderOf,
  withDestinationStatusProvider,
} from "../../src/modules/ui/home/destination-status-provider.ts";
import { SiteHeader } from "../../src/modules/ui/layout/SiteHeader.tsx";
import { ProductPage } from "../../src/modules/ui/product/ProductPage.tsx";
import { POLAND_PARTNERS } from "../fixtures/poland-registry.ts";

/** The approved words (D2 A), in `en` and `en-gb`. */
const SOON = "Ordering opens soon";
const DELIVERING = "Delivering now";
/** AC-33's four old phrasings, none of which may render with today's data. */
const OLD = [
  "not delivering yet",
  "Guide · not delivering yet",
  DELIVERING,
  "Ordering is not open yet",
] as const;
const ENGLISH = ["en", "en-gb"] as const;
const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/** Poland's row with `status: "live"`, the rest as committed. */
const POLAND_LIVE: readonly CountryConfig[] = COUNTRIES.map((country) =>
  country.iso2 === "PL" ? { ...country, status: "live" as const } : country,
);

function render(node: ReactElement, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, MESSAGE_NAMESPACES)}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

/** Visible text: tags stripped, the entities React writes decoded, spaces collapsed. */
function text(html: string): string {
  return html
    .replaceAll(/<[^>]*>/gu, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

/** One chip of the home's destinations grid, as text. */
function chip(html: string, iso2: string): string {
  const start = html.indexOf(`data-fo-destination="${iso2}"`);
  expect(start, iso2).toBeGreaterThan(-1);
  return text(html.slice(start, html.indexOf("</li>", start)));
}

/** A catalogue value by dotted key, in one locale. */
function value(locale: string, key: string): string {
  const [namespace, ...path] = key.split(".");
  let node: unknown = loadMessages(locale, MESSAGE_NAMESPACES)[
    namespace as (typeof MESSAGE_NAMESPACES)[number]
  ];
  for (const part of path) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof node !== "string") throw new Error(`${locale}: no \`${key}\``);
  return node;
}

/* -------------------------------------------------------------------------- */
/* T-36 / AC-35: `status` agrees with the pages.                              */
/* -------------------------------------------------------------------------- */

describe("AC-35 (T-36): `status` is `live` if and only if ordering is open", () => {
  it("holds over the committed registry with the Phase 0 provider: every country `demo`, Poland with no cities", () => {
    expect(statusDisagreements(COUNTRIES, deliveryDatesOpen)).toEqual([]);
    for (const country of COUNTRIES) {
      expect(country.status, country.iso2).toBe("demo");
      expect(deliveryDatesOpen(country.iso2), country.iso2).toBe(false);
    }
    expect(countryConfig("PL").status).toBe("demo");
    expect(countryConfig("PL").citiesKey).toBeUndefined();
  });

  it("fails, naming `PL`, on a registry with Poland `live` and no florist", () => {
    const problems = statusDisagreements(POLAND_LIVE, deliveryDatesOpen);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /^`PL` is `status: "live"` while ordering is not open/u,
    );
  });

  it("fails, naming `PL`, when a florist opens Poland while its status still says `demo`", async () => {
    const problems = await withActivePartnersProvider(POLAND_PARTNERS, () =>
      statusDisagreements(COUNTRIES, deliveryDatesOpen),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^`PL` takes orders .* status is `demo`/u);
  });

  it("holds on the Poland-open fixture: operations, an active florist and `live`, together", async () => {
    await expect(
      withActivePartnersProvider(POLAND_PARTNERS, () =>
        statusDisagreements(POLAND_LIVE, deliveryDatesOpen),
      ),
    ).resolves.toEqual([]);
  });

  it("puts Poland in spec 005's `country.demo` availability state (§14 A4)", async () => {
    await expect(
      availability({ productId: "FO-BQ-001", countryIso: "PL" }),
    ).resolves.toEqual({
      schemaAvailability: "OutOfStock",
      reasonKey: catalogAvailabilityKeys.countryDemo,
      saleable: false,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* T-34 / AC-33: one not-open text, "Ordering opens soon".                    */
/* -------------------------------------------------------------------------- */

describe('AC-33 (T-34): every not-open state line reads "Ordering opens soon"', () => {
  it.each(ENGLISH)(
    "%s: the state key, the product page's status and the finder's mark carry the approved words",
    (locale) => {
      expect(value(locale, "destinations.state.guideNotDelivering")).toBe(SOON);
      expect(value(locale, "product.demo.heading")).toBe(SOON);
      expect(value(locale, "home.sentence.notYet")).toBe("{country} (soon)");
      // The guide's state line is the corridor's chip, from the same key.
      expect(corridorStateKey("guide")).toBe(
        "destinations.state.guideNotDelivering",
      );
    },
  );

  it.each(LOCALES)(
    "%s: the home grid prints the not-open state on all seven, and no old phrasing",
    (locale) => {
      const html = render(<DestinationsGrid locale={locale} />, locale);
      for (const country of COUNTRIES) {
        expect(chip(html, country.iso2), country.iso2).toContain(
          value(locale, "destinations.state.guideNotDelivering"),
        );
      }
      if (locale === "en" || locale === "en-gb") {
        for (const phrase of OLD)
          expect(text(html), phrase).not.toContain(phrase);
      }
    },
  );

  it('never says "Delivering now" from `status` alone: Poland `live` in the registry, nobody to order from', async () => {
    // The mutation T-34 names: a grid that read `country.status` again would print it here.
    const html = await withDestinationStatusProvider(
      destinationStatusProviderOf(POLAND_LIVE),
      () => render(<DestinationsGrid locale="en" />, "en"),
    );
    expect(chip(html, "PL")).toContain(SOON);
    expect(text(html)).not.toContain(DELIVERING);
  });

  it("gives Poland its live state on the Poland-open fixture, and the other six still read the not-open text", async () => {
    const html = await withActivePartnersProvider(POLAND_PARTNERS, () =>
      withDestinationStatusProvider(
        destinationStatusProviderOf(POLAND_LIVE),
        () => render(<DestinationsGrid locale="en-gb" />, "en-gb"),
      ),
    );
    expect(chip(html, "PL")).toContain(DELIVERING);
    expect(chip(html, "PL")).not.toContain(SOON);
    const others = COUNTRIES.filter((country) => country.iso2 !== "PL");
    expect(others).toHaveLength(6);
    for (const country of others) {
      expect(chip(html, country.iso2), country.iso2).toContain(SOON);
    }
  });

  it.each(ENGLISH)(
    "%s: the destinations hub prints the not-open state on every row, and no old phrasing",
    (locale) => {
      const html = render(<DestinationsHubPage locale={locale} />, locale);
      const rows =
        /data-fo-hub-phone-rows[\s\S]*?<\/ul>/u.exec(html)?.[0] ?? "";
      expect(text(rows).split(SOON)).toHaveLength(COUNTRIES.length + 1);
      for (const phrase of OLD)
        expect(text(html), phrase).not.toContain(phrase);
    },
  );

  async function productHtml(
    locale: string,
    countryIso: string,
  ): Promise<string> {
    const view: ProductView | undefined = await productView(
      { locale, countryIso, sku: "FO-BQ-001" },
      { parameterised: false, productLinks: true },
    );
    if (view === undefined) throw new Error(`${locale}/${countryIso}: no page`);
    return render(
      <ProductPage
        breadcrumb={<ListingBreadcrumb crumbs={view.breadcrumb} />}
        view={view}
      />,
      locale,
    );
  }

  it.each(
    ENGLISH.flatMap((locale) => [
      [locale, "PL"],
      [locale, "DE"],
    ]),
  )(
    "%s/%s: the product page's primary-action status reads the not-open text, and no old phrasing",
    async (locale, countryIso) => {
      const html = await productHtml(locale, countryIso);
      const status =
        /data-fo-pdp-status[^>]*>([\s\S]*?)<\/p>/u.exec(html)?.[1] ?? "";
      expect(text(status)).toBe(SOON);
      for (const phrase of OLD)
        expect(text(html), phrase).not.toContain(phrase);
    },
  );
});

/* -------------------------------------------------------------------------- */
/* T-35 / AC-34: no cutoff while no country is open.                          */
/* -------------------------------------------------------------------------- */

describe("AC-34 (T-35): cutoff text renders only for a country where ordering is open", () => {
  const CUTOFF_KEYS = [
    "nav.utility.cutoff",
    "nav.utility.cutoffShort",
    "faq.whoDelivers.answerCutoff",
  ] as const;

  function chrome(locale: string): string {
    return render(
      <>
        <SiteHeader locale={locale} listingHrefs={{}} />
        <HomeFaq />
      </>,
      locale,
    );
  }

  it.each(LOCALES)(
    '%s: with today\'s data the header and the FAQ print no cutoff value and no "Order by"',
    (locale) => {
      const html = text(chrome(locale));
      for (const key of CUTOFF_KEYS) {
        expect(html, key).not.toContain(value(locale, key));
      }
      expect(html).not.toMatch(/\border by\b/iu);
      expect(html).not.toMatch(/\b\d{1,2}[:.]\d{2}\s+(?:in\s+)?Warsaw/u);
    },
  );

  it.each(ENGLISH)(
    "%s: on the Poland-open fixture the header cutoff and Poland's FAQ cutoff render",
    async (locale) => {
      const html = await withActivePartnersProvider(POLAND_PARTNERS, () =>
        text(chrome(locale)),
      );
      expect(html).toContain(value(locale, "nav.utility.cutoff"));
      expect(html).toContain(value(locale, "nav.utility.cutoffShort"));
      expect(html).toContain(value(locale, "faq.whoDelivers.answerCutoff"));
    },
  );

  it('hides the guide\'s "Order by" row while Poland is not open, and shows it once it is (founder, 2026-10-20)', async () => {
    const view = corridorView("PL", "en", { from: "2026-10-20" });
    expect(view?.facts.known).toBe(false);
    if (view === undefined) throw new Error("Poland's guide must exist");
    const closed = text(render(<CorridorFacts view={view} />, "en"));
    expect(closed).not.toMatch(/\border by\b/iu);
    expect(closed).not.toContain(value("en", "corridor.facts.orderBy.none"));
    // Every other honest blank stays.
    expect(closed).toContain(value("en", "corridor.facts.deliveryDays.label"));
    const open = await withActivePartnersProvider(POLAND_PARTNERS, () =>
      text(render(<CorridorFacts view={view} />, "en")),
    );
    expect(open).toContain(
      `${value("en", "corridor.facts.orderBy.label")} ${value("en", "corridor.facts.orderBy.none")}`,
    );
  });

  it("keeps Poland's FAQ cutoff off while another country is the open one (`/break 293` hole 1)", async () => {
    // Germany open, Poland closed: `anyDeliveryDatesOpen()` is true, `deliveryDatesOpen("PL")` is
    // not. The FAQ's sentence names Warsaw, so only Poland's own predicate may print it.
    vi.resetModules();
    vi.doMock(
      "../../src/modules/geo/delivery/state.ts",
      async (importOriginal) => {
        const actual =
          await importOriginal<
            typeof import("../../src/modules/geo/delivery/state.ts")
          >();
        return {
          ...actual,
          pickerState: (iso2: Parameters<typeof actual.pickerState>[0]) =>
            iso2 === "DE" ? ("live" as const) : actual.pickerState(iso2),
        };
      },
    );
    try {
      const countries = await import("../../src/config/countries.ts");
      expect(countries.anyDeliveryDatesOpen()).toBe(true);
      expect(countries.deliveryDatesOpen("DE")).toBe(true);
      expect(countries.deliveryDatesOpen("PL")).toBe(false);
      const { HomeFaq: Faq } =
        await import("../../src/modules/ui/home/HomeFaq.tsx");
      const html = text(render(<Faq />, "en"));
      expect(html).toContain(value("en", "faq.whoDelivers.answer"));
      expect(html).not.toContain(value("en", "faq.whoDelivers.answerCutoff"));
      expect(html).not.toContain("Order by 14:00 in Warsaw");
    } finally {
      vi.doUnmock("../../src/modules/geo/delivery/state.ts");
      vi.resetModules();
    }
  });
});
