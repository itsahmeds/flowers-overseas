/**
 * The locale home's model, products first (spec 004 §14 A-founder-2026-10-24a item 4; TASK-386,
 * TASK-387): AC-95 (the whole core range, and nothing else), AC-96's unit half (sections, counts,
 * orders, the word-label bands, "Coming up" over every shop country), AC-98 (the dedupe rule,
 * T-104) and the home's half of AC-73 (no country named in its code).
 *
 * Read against the committed registries and catalogue, plus a `HomeData` fixture where the case
 * needs a calendar or a coverage the committed data does not have. No module is mocked.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HOME_COMING_UP,
  HOME_OCCASION_TABS,
  HOME_SECTION_MIN_PRODUCTS,
  HOME_TAB_CARDS,
} from "../../src/config/commerce.ts";
import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";
import { OCCASIONS } from "../../src/config/catalogue/occasions.data.ts";
import {
  type HomeData,
  committedHomeData,
  dedupeSection,
  homeView,
} from "../../src/modules/catalog/home.ts";
import { coreRange } from "../../src/modules/catalog/shop.ts";

const NOW = new Date("2026-10-25T09:00:00Z");

describe("dedupeSection(): the dedupe rule (AC-98, T-104)", () => {
  it("skips a product shown above while enough fresh ones remain to fill the slots", () => {
    expect(
      dedupeSection(["a", "b", "c", "d", "e"], new Set(["a", "b"]), 3),
    ).toStrictEqual(["c", "d", "e"]);
    expect(
      dedupeSection(["a", "b", "c", "d"], new Set(["a"]), 3),
    ).toStrictEqual(["b", "c", "d"]);
  });

  it("repeats a shown product, in its own order, only when the fresh ones cannot fill the slots", () => {
    expect(
      dedupeSection(["a", "b", "c"], new Set(["a", "b"]), 3),
    ).toStrictEqual(["a", "b", "c"]);
    // One fresh product (d) for two slots: one repeat, the first in the section's own order.
    expect(
      dedupeSection(["a", "b", "c", "d"], new Set(["a", "b", "c"]), 2),
    ).toStrictEqual(["a", "d"]);
    // Everything shown: the section repeats its own first products.
    expect(
      dedupeSection(["a", "b", "c"], new Set(["a", "b", "c"]), 2),
    ).toStrictEqual(["a", "b"]);
  });

  it("takes fewer only when its own order is shorter, and is the same on every run", () => {
    expect(dedupeSection(["a"], new Set(), 4)).toStrictEqual(["a"]);
    const order = ["d", "a", "c", "b", "e", "f"];
    const shown = new Set(["a", "e"]);
    const first = dedupeSection(order, shown, 4);
    expect(first).toStrictEqual(["d", "c", "b", "f"]);
    for (let run = 0; run < 5; run += 1) {
      expect(dedupeSection(order, shown, 4)).toStrictEqual(first);
    }
  });
});

describe("Our selection: the whole core range, and nothing else (AC-95)", () => {
  it.each(["en", "en-gb"] as const)(
    "%s: every core product once, in rank order",
    async (locale) => {
      const view = await homeView(locale, { now: NOW });
      const range = await coreRange(locale);
      expect(range.length).toBeGreaterThanOrEqual(8);
      expect(view.selection.cards.map((card) => card.productId)).toStrictEqual(
        range.map((entry) => entry.sku),
      );
    },
  );

  it("shows no product outside the core range in any section", async () => {
    const view = await homeView("en", { now: NOW });
    const core = new Set((await coreRange("en")).map((entry) => entry.sku));
    const every = [
      ...view.selection.cards,
      ...view.occasions.flatMap((occasion) => occasion.cards),
      ...view.comingUp.flatMap((occasion) => occasion.cards),
    ];
    expect(every.length).toBeGreaterThan(view.selection.cards.length);
    for (const card of every)
      expect(core, card.productId).toContain(card.productId);
  });

  it("links every card through the chooser to its product, and the section's See all to the chooser", async () => {
    const view = await homeView("en", { now: NOW });
    for (const card of view.selection.cards) {
      expect(card.href, card.productId).toMatch(
        /^\/en\/choose-country\/product\/[a-z0-9]+(?:-[a-z0-9]+)*$/u,
      );
    }
    expect(view.selection.seeAllHref).toBe("/en/choose-country");
  });

  it("carries no money in the view: no field for a price, a currency or a slot", async () => {
    const view = await homeView("en", { now: NOW });
    const serialised = JSON.stringify(view);
    for (const field of [
      "price",
      "amountMinor",
      "currency",
      "equivalents",
      "slots",
    ]) {
      expect(serialised, field).not.toContain(`"${field}"`);
    }
  });
});

describe("the sections' model (AC-96's unit half)", () => {
  it("draws a tab for each `HOME_OCCASION_TABS` key at least two core products carry, in config order", async () => {
    const view = await homeView("en", { now: NOW });
    const core = new Set((await coreRange("en")).map((entry) => entry.sku));
    const carriers = (key: string): number =>
      PRODUCTS.filter(
        (product) =>
          core.has(product.sku) &&
          (product.occasions as readonly string[]).includes(key),
      ).length;
    const expected = HOME_OCCASION_TABS.filter(
      (key) => carriers(key) >= HOME_SECTION_MIN_PRODUCTS,
    );
    expect(view.occasions.map((occasion) => occasion.key)).toStrictEqual(
      expected,
    );
    // Today's data: new baby has one core product, so its tab is absent.
    expect(expected).not.toContain("new_baby");
    expect(expected).toStrictEqual([
      "birthday",
      "sympathy",
      "thank_you",
      "anniversary",
      "get_well",
    ]);
    for (const occasion of view.occasions) {
      expect(occasion.cards.length, occasion.key).toBeLessThanOrEqual(
        HOME_TAB_CARDS,
      );
      expect(occasion.total, occasion.key).toBe(carriers(occasion.key));
    }
  });

  it("orders each panel in Our order, repeating because Our selection already shows every product", async () => {
    const view = await homeView("en", { now: NOW });
    const rank = (await coreRange("en")).map((entry) => entry.sku);
    const birthday = view.occasions.find(
      (occasion) => occasion.key === "birthday",
    );
    const carriesBirthday = new Set(
      PRODUCTS.filter((product) =>
        (product.occasions as readonly string[]).includes("birthday"),
      ).map((product) => product.sku),
    );
    expect(birthday?.cards.map((card) => card.productId)).toStrictEqual(
      rank.filter((sku) => carriesBirthday.has(sku)).slice(0, HOME_TAB_CARDS),
    );
  });

  it("links each panel's See all to its occasion hub, a plain country-less link", async () => {
    const view = await homeView("en", { now: NOW });
    const birthday = view.occasions.find(
      (occasion) => occasion.key === "birthday",
    );
    expect(birthday?.hubHref).toBe("/en/occasions/birthday");
  });

  it("offers the three price bands as word labels and chooser links, with no amount", async () => {
    const view = await homeView("en-gb", { now: NOW });
    expect(view.priceBands).toStrictEqual([
      { band: "low", href: "/en-gb/choose-country/price/low" },
      { band: "mid", href: "/en-gb/choose-country/price/mid" },
      { band: "high", href: "/en-gb/choose-country/price/high" },
    ]);
  });

  it("fills the picker from the shop set: the chooser's form with an empty next", async () => {
    const view = await homeView("en", { now: NOW });
    expect(view.picker.action).toBe("/api/choose/en");
    expect(view.picker.chips.length).toBeGreaterThan(0);
    expect(view.picker.chips.length).toBeLessThanOrEqual(6);
    for (const chip of view.picker.chips)
      expect(chip.code).toMatch(/^[a-z]{2}$/u);
  });

  it("states that ordering is not open while no destination takes orders", async () => {
    expect((await homeView("en", { now: NOW })).notOpen).toBe(true);
    const open: HomeData = { ...committedHomeData, anyOpen: () => true };
    expect((await homeView("en", { now: NOW, data: open })).notOpen).toBe(
      false,
    );
  });
});

describe("Coming up over every shop country (AC-96, item 4.6)", () => {
  /** A calendar fixture: three countries, four dated occasions, one carried by too few products. */
  const calendar: Record<
    string,
    readonly { occasionKey: string; date: string }[]
  > = {
    DE: [
      { occasionKey: "christmas", date: "2026-12-25" },
      { occasionKey: "valentines", date: "2027-02-14" },
    ],
    FR: [
      { occasionKey: "all_saints", date: "2026-11-01" },
      { occasionKey: "christmas", date: "2026-12-25" },
      { occasionKey: "valentines", date: "2027-02-14" },
    ],
    IT: [
      { occasionKey: "christmas", date: "2026-12-24" },
      { occasionKey: "valentines", date: "2027-02-14" },
      { occasionKey: "fathers_day", date: "2027-03-19" },
    ],
  };
  const data: HomeData = {
    ...committedHomeData,
    datedOccasions: (iso2) =>
      (calendar[iso2] ?? []).map((row) => ({
        ...row,
        countryIso2: iso2,
        promoStartOffsetDays: 0,
        indexableOverride: null,
      })),
  };

  it("lists the qualifying occasions at their earliest date, with the countries keeping it then", async () => {
    const view = await homeView("en", { now: NOW, data });
    expect(view.comingUp.length).toBeLessThanOrEqual(HOME_COMING_UP.occasions);
    // All Saints' Day: no core product carries it, so it is skipped though it is first.
    expect(view.comingUp.map((occasion) => occasion.key)).toStrictEqual([
      "christmas",
      "valentines",
    ]);
    const christmas = view.comingUp[0];
    // Its earliest date is Italy's 24th, and only Italy keeps it then.
    expect(christmas?.dateIso).toBe("2026-12-24");
    expect(christmas?.countries).toBe("Italy");
    expect(christmas?.more).toBe(0);
    const valentines = view.comingUp[1];
    expect(valentines?.dateIso).toBe("2027-02-14");
    // Three countries keep it: two names in the one country order, then "and 1 more".
    expect(valentines?.countries).toBe("France, Germany");
    expect(valentines?.more).toBe(1);
    for (const occasion of view.comingUp) {
      expect(occasion.cards.length).toBeLessThanOrEqual(HOME_COMING_UP.cards);
      expect(occasion.cards.length).toBeGreaterThanOrEqual(
        HOME_SECTION_MIN_PRODUCTS,
      );
    }
  });

  it("formats two names with the locale's conjunction", async () => {
    const two: HomeData = {
      ...data,
      datedOccasions: (iso2) =>
        iso2 === "DE" || iso2 === "FR"
          ? [
              {
                occasionKey: "valentines",
                date: "2027-02-14",
                countryIso2: iso2,
                promoStartOffsetDays: 0,
                indexableOverride: null,
              },
            ]
          : [],
    };
    const view = await homeView("en", { now: NOW, data: two });
    expect(view.comingUp[0]?.countries).toBe("France and Germany");
    expect(view.comingUp[0]?.more).toBe(0);
  });

  it("is absent with no dated occasion enough core products carry", async () => {
    const none: HomeData = { ...committedHomeData, datedOccasions: () => [] };
    expect(
      (await homeView("en", { now: NOW, data: none })).comingUp,
    ).toStrictEqual([]);
  });
});

describe("no country in the home's code (AC-73's home half)", () => {
  const files = [
    "src/modules/catalog/home.ts",
    "src/app/[locale]/page.tsx",
    ...readdirSync("src/modules/ui/home").map((name) =>
      join("src/modules/ui/home", name),
    ),
  ];
  const countryNames = [
    "Poland",
    "Polska",
    "Germany",
    "France",
    "Italy",
    "Spain",
  ];

  it("names no destination code or country in the home's files", () => {
    for (const path of files) {
      // The sentence picker's files are retired with their own clean-up (TASK-386 carry-forward).
      if (/Sentence|sentence-model|trending-provider/u.test(path)) continue;
      const source = readFileSync(path, "utf8");
      const code = source.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, "");
      expect(code, path).not.toMatch(/["'](?:PL|DE|FR|IT|NL|RO|ES)["']/u);
      for (const name of countryNames)
        expect(code, `${path}: ${name}`).not.toContain(name);
    }
  });

  it("keeps neither the demo destination nor the dated destination constant on the home", () => {
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toContain("DATED_DESTINATION");
      expect(source, path).not.toContain("DEMO_DESTINATION_ISO2");
    }
  });

  it("has an occasion row for every tab key", () => {
    const keys = new Set(OCCASIONS.map((row) => row.key as string));
    for (const key of HOME_OCCASION_TABS) expect(keys, key).toContain(key);
  });
});
