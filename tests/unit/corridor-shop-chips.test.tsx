/**
 * The corridor page's **state-B chip row** (spec 007 §2 "Internal links", §14 A9 and **A10**;
 * spec 008 AC-20; TASK-147).
 *
 * State B draws the shop entry as the shop-root link **plus** up to six country categories and
 * the country occasions that exist. State A stays the reviewed shop-root link alone (A9), which
 * `tests/unit/corridor-page.test.tsx` pins on all fourteen guide pages and which this file leaves
 * alone; here the guide state is asked only the one new question — does a chip ever reach it?
 *
 * Three things are proved, each against its subject:
 *
 *  1. **Every chip is a page that exists.** The hrefs are members of `listingPages()`, the set
 *     `generateStaticParams` emits, in every listing locale, so no chip links at a 404.
 *  2. **Every family is gated by its own link id**, one mutation case per family: withdrawing
 *     `country-category` removes the category chips and only those, `country-occasion` the
 *     occasion chips and only those, `country-shop-root` the whole entry (the section renders
 *     nothing at all, spec 004 AC-14). A test that only ran the happy path would pass with the
 *     gate deleted.
 *  3. **State A renders no chip**, whatever it is handed: `corridorView()` drops the chips from a
 *     guide view and `CorridorPage` refuses them again if a hand-built view carries them.
 *
 * The state-B view is a fixture, as `corridor-page.test.tsx`'s is: no `live` content file exists
 * and no florist has been signed (spec 007 §13 Q3), so `corridorState()` answers `guide` for every
 * real destination. The chips themselves come from the real catalogue through the real
 * `corridorShopEntry()`.
 */
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type ListingLinkPageType,
  isPublished,
  listingLinkId,
} from "../../src/config/site-links.ts";

vi.mock("../../src/config/site-links.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/config/site-links.ts")>();
  return { ...actual, isPublished: vi.fn(actual.isPublished) };
});

const { corridorShopEntry } =
  await import("../../src/modules/catalog/shop-entry.ts");
const { listingLocales, listingPages } =
  await import("../../src/modules/catalog/listing.ts");
const { corridorView } = await import("../../src/modules/geo/index.ts");
const { CorridorPage } =
  await import("../../src/modules/geo/ui/CorridorPage.tsx");
const { loadMessages } = await import("../../src/modules/i18n/index.ts");
const { withActivePartnersProvider } =
  await import("../../src/modules/geo/partners.ts");

type CorridorView = NonNullable<ReturnType<typeof corridorView>>;

const actual = await vi.importActual<
  typeof import("../../src/config/site-links.ts")
>("../../src/config/site-links.ts");
const publishedMock = vi.mocked(isPublished);

afterEach(() => {
  publishedMock.mockImplementation(actual.isPublished);
});

const FROM = "2026-09-15";
const NAMESPACES = [
  "corridor",
  "breadcrumb",
  "destinations",
  "catalog",
  "shop",
  "common",
  "a11y",
  "media",
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

function withdraw(family: ListingLinkPageType): void {
  const id = listingLinkId(family);
  publishedMock.mockImplementation((asked) =>
    asked === id ? false : actual.isPublished(asked),
  );
}

/** The state-B page for one destination: the fixture state, the real chips. */
async function stateB(locale: string, iso2: "PL"): Promise<CorridorView> {
  const guide = corridorView(iso2, locale, { from: FROM });
  if (guide === undefined)
    throw new Error(`the ${locale} ${iso2} guide exists`);
  return {
    ...guide,
    state: "live",
    h1: "Send flowers to Poland",
    stateKey: "destinations.state.deliveringNow",
    facts: {
      known: true,
      operations: {
        ianaZone: "Europe/Warsaw",
        sameDayCutoffLocal: "14:00",
        deliveryDays: [1, 2, 3, 4, 5, 6],
        sundayDelivery: "peak",
      },
      citiesKey: "destinations.pl.cities",
    },
    liveSlots: await corridorShopEntry(locale, iso2, { chips: true }),
  };
}

/** The chip row's `<nav>`, whole, or `undefined` when the page draws none. */
function chipRow(html: string): string | undefined {
  return /<nav[^>]*data-fo-corridor-shop-chips[^>]*>.*?<\/nav>/su.exec(
    html,
  )?.[0];
}

function hrefs(html: string | undefined): string[] {
  return [...(html ?? "").matchAll(/href="([^"]+)"/gu)].map((m) => m[1] ?? "");
}

describe("corridorShopEntry(…, { chips: true }) hands the chips the shop builds (A10)", () => {
  it("hands none unless asked: the home grid and the send route read the href alone", async () => {
    const entry = await corridorShopEntry("en", "PL");
    expect(entry.shopEntryHref).toBe("/en/poland/flowers");
    expect(entry.shopChips).toBeUndefined();
  });

  it("hands Poland six categories and its eleven observed occasions, each a page that exists, in every listing locale", async () => {
    for (const locale of listingLocales()) {
      const roots = new Set(
        (await listingPages(locale)).map((page) => page.path),
      );
      const { shopChips } = await corridorShopEntry(locale, "PL", {
        chips: true,
      });
      const categories = (shopChips ?? []).filter(
        (chip) => chip.family === "category",
      );
      const occasions = (shopChips ?? []).filter(
        (chip) => chip.family === "occasion",
      );
      expect(categories, `${locale} categories`).toHaveLength(6);
      // Since spec 008 A-founder-2026-10-21c (TASK-316) every occasion Poland observes clears the
      // six-product floor, so each has a page and a chip (§2 row 8 as written).
      expect(
        occasions.map((chip) => chip.key).sort(),
        `${locale} occasions`,
      ).toEqual([
        "all_saints",
        "christmas",
        "easter",
        "fathers_day",
        "grandparents_day",
        "mothers_day",
        "name_day",
        "new_year",
        "teachers_day",
        "valentines",
        "womens_day",
      ]);
      for (const chip of shopChips ?? []) {
        expect(roots.has(chip.href), `${locale} ${chip.href}`).toBe(true);
        expect(
          chip.name.length,
          `${locale} ${chip.key} is named`,
        ).toBeGreaterThan(0);
      }
      // Categories first, then occasions: the row's reading order.
      expect((shopChips ?? []).map((chip) => chip.family)).toEqual([
        ...categories.map(() => "category"),
        ...occasions.map(() => "occasion"),
      ]);
    }
  });

  // Which six, and in what order, is the row's whole content (TASK-147 `/break` holes 1 and 2).
  // Poland's category counts at the time of writing: mixed 50, bouquet 40, birthday 27, thank_you
  // 25, congratulations 19, get_well 17, sympathy 17, then the rest at 16 or fewer.
  it("hands Poland exactly the six categories with the most products, in the locale's collation", async () => {
    const { shopChips } = await corridorShopEntry("en", "PL", { chips: true });
    expect(
      (shopChips ?? [])
        .filter((chip) => chip.family === "category")
        .map((chip) => chip.key),
      "the six, collated by English name",
    ).toEqual([
      "birthday",
      "congratulations",
      "get_well",
      "bouquet",
      "mixed",
      "thank_you",
    ]);
  });

  it("breaks the 17-product tie between get_well and sympathy in corpus order", async () => {
    const keys = (
      (await corridorShopEntry("en", "PL", { chips: true })).shopChips ?? []
    ).map((chip) => chip.key);
    expect(keys).toContain("get_well");
    expect(keys).not.toContain("sympathy");
  });

  it("collates each family by the locale's own rules, in German and Polish", async () => {
    const expected = {
      de: [
        "thank_you", // Blumen zum Dank
        "get_well", // Blumen zur Genesung
        "congratulations", // Blumen zur Gratulation
        "bouquet", // Blumensträuße
        "birthday", // Geburtstagsblumen
        "mixed", // Gemischte Blumen
        "all_saints", // Allerheiligen
        "womens_day", // Frauentag
        "grandparents_day", // Großelterntag
        "teachers_day", // Lehrertag
        "mothers_day", // Muttertag
        "name_day", // Namenstag
        "new_year", // Neujahr
        "easter", // Ostern
        "valentines", // Valentinstag
        "fathers_day", // Vatertag
        "christmas", // Weihnachten
      ],
      pl: [
        "bouquet", // Bukiety
        "mixed", // Bukiety mieszane
        "thank_you", // Kwiaty na podziękowanie
        "get_well", // Kwiaty na powrót do zdrowia
        "birthday", // Kwiaty na urodziny
        "congratulations", // Kwiaty z gratulacjami
        "christmas", // Boże Narodzenie
        "grandparents_day", // Dzień Babci i Dziadka
        "womens_day", // Dzień Kobiet
        "mothers_day", // Dzień Matki
        "teachers_day", // Dzień Nauczyciela
        "fathers_day", // Dzień Ojca
        "name_day", // Imieniny
        "new_year", // Nowy Rok
        "valentines", // Walentynki
        "easter", // Wielkanoc
        "all_saints", // Wszystkich Świętych
      ],
    } as const;
    for (const locale of ["de", "pl"] as const) {
      const { shopChips } = await corridorShopEntry(locale, "PL", {
        chips: true,
      });
      expect(
        (shopChips ?? []).map((chip) => chip.key),
        locale,
      ).toEqual(expected[locale]);
    }
  });

  it("hands nothing for a country the registry does not know or a locale with no shop root", async () => {
    expect(await corridorShopEntry("en", "PT", { chips: true })).toEqual({});
    expect(await corridorShopEntry("fr", "PL", { chips: true })).toEqual({});
  });
});

describe("every chip family is gated by its own link id (A10: one mutation case per family)", () => {
  it("`country-category` withdrawn removes the category chips, and only those", async () => {
    const before = (await corridorShopEntry("en", "PL", { chips: true }))
      .shopChips;
    withdraw("countryCategory");
    const after = await corridorShopEntry("en", "PL", { chips: true });
    expect(publishedMock).toHaveBeenCalledWith("country-category");
    expect(after.shopEntryHref).toBe("/en/poland/flowers");
    expect(after.shopChips?.filter((c) => c.family === "category")).toEqual([]);
    expect(after.shopChips).toEqual(
      before?.filter((chip) => chip.family === "occasion"),
    );
    expect(after.shopChips).toHaveLength(11);
  });

  it("`country-occasion` withdrawn removes the occasion chips, and only those", async () => {
    const before = (await corridorShopEntry("en", "PL", { chips: true }))
      .shopChips;
    withdraw("countryOccasion");
    const after = await corridorShopEntry("en", "PL", { chips: true });
    expect(publishedMock).toHaveBeenCalledWith("country-occasion");
    expect(after.shopChips?.filter((c) => c.family === "occasion")).toEqual([]);
    expect(after.shopChips).toEqual(
      before?.filter((chip) => chip.family === "category"),
    );
    expect(after.shopChips).toHaveLength(6);
  });

  it("`country-shop-root` withdrawn removes the whole entry: no link, no chip, no section", async () => {
    withdraw("countryShopRoot");
    expect(await corridorShopEntry("en", "PL", { chips: true })).toEqual({});
    const view = await stateB("en", "PL");
    expect(view.liveSlots.shopEntryHref).toBeUndefined();
    expect(render(<CorridorPage view={view} />, "en")).not.toContain(
      "data-fo-corridor-shop",
    );
  });

  it("both chip families withdrawn leaves the shop-root link alone and no empty row", async () => {
    publishedMock.mockImplementation((asked) =>
      asked === "country-category" || asked === "country-occasion"
        ? false
        : actual.isPublished(asked),
    );
    const view = await stateB("en", "PL");
    const html = render(<CorridorPage view={view} />, "en");
    expect(view.liveSlots.shopEntryHref).toBe("/en/poland/flowers");
    expect(html).toContain('href="/en/poland/flowers"');
    expect(chipRow(html)).toBeUndefined();
  });
});

describe("the state-B page draws the chip row (A10)", () => {
  it("renders the shop-root link, then one named row of seventeen links", async () => {
    const view = await withActivePartnersProvider(
      { hasActivePartners: (iso2: string) => iso2 === "PL" },
      () => stateB("en", "PL"),
    );
    const html = render(<CorridorPage view={view} />, "en");
    const row = chipRow(html);
    expect(row, "the chip row renders").toBeDefined();
    // The row's own name is a reviewed key, resolved with the country: "Also for Poland".
    expect(row).toContain("Also for Poland");
    expect(row).toMatch(/aria-labelledby="corridor-shop-chips-heading"/u);
    expect(row).toContain('id="corridor-shop-chips-heading"');
    expect(hrefs(row)).toEqual(view.liveSlots.shopChips?.map((c) => c.href));
    // Six categories and Poland's eleven observed occasions (spec 008 A-founder-2026-10-21c).
    expect(hrefs(row)).toHaveLength(17);
    expect(hrefs(row)).toContain("/en/poland/occasions/mothers-day");
    expect(hrefs(row)).toContain("/en/poland/occasions/grandparents-day");
    // The row sits inside the shop entry's section, after the shop-root link.
    const section =
      /<section[^>]*data-fo-corridor-shop[^>]*>.*?<\/section>/su.exec(
        html,
      )?.[0] ?? "";
    expect(section.indexOf('href="/en/poland/flowers"')).toBeGreaterThan(-1);
    expect(section.indexOf('href="/en/poland/flowers"')).toBeLessThan(
      section.indexOf("data-fo-corridor-shop-chips"),
    );
    // Every chip's label is the shop's own name for it, never a slug.
    for (const chip of view.liveSlots.shopChips ?? []) {
      expect(row).toContain(`>${chip.name.replace("'", "&#x27;")}<`);
    }
  });

  it("hands German and Polish chips with that locale's own hrefs", async () => {
    for (const locale of ["de", "pl"] as const) {
      const { shopChips } = await corridorShopEntry(locale, "PL", {
        chips: true,
      });
      expect(shopChips, `${locale} chips`).toHaveLength(17);
      for (const chip of shopChips ?? []) {
        expect(chip.href.startsWith(`/${locale}/`), chip.href).toBe(true);
      }
    }
  });
});

describe("state A draws no chip (A9)", () => {
  it("corridorView() drops chips handed to a guide view", async () => {
    const slots = await corridorShopEntry("en", "PL", { chips: true });
    expect(slots.shopChips?.length).toBeGreaterThan(0);
    const guide = corridorView("PL", "en", { from: FROM, liveSlots: slots });
    expect(guide?.state).toBe("guide");
    expect(guide?.liveSlots.shopEntryHref).toBe("/en/poland/flowers");
    expect(guide?.liveSlots.shopChips).toBeUndefined();
  });

  it("CorridorPage renders none for a guide-state view that carries them anyway", async () => {
    const slots = await corridorShopEntry("en", "PL", { chips: true });
    const guide = corridorView("PL", "en", { from: FROM });
    if (guide === undefined) throw new Error("the en Poland guide exists");
    const html = render(
      <CorridorPage view={{ ...guide, liveSlots: slots }} />,
      "en",
    );
    expect(html).toContain("data-fo-corridor-shop");
    expect(chipRow(html)).toBeUndefined();
    expect(html).not.toContain("mothers-day");
    expect(html).not.toContain("Also for Poland");
  });
});
