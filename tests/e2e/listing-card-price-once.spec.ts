/**
 * The listing card says its price once, and the grid says "Example arrangement" once (spec 004 §14
 * A-founder-2026-10-19b clauses 1 to 4; spec 008 T-06 and T-07 as amended there; TASK-285).
 *
 * On the shop root, a country category, a country occasion and a category hub, in four locales, at
 * 1440 × 900 and 390 × 844, as a browser lays them out. Each probe and what it goes red on:
 *
 * - every priced card's words beside its amount are the locale's resolved `catalog.price.inclusive`
 *   (red with `catalog.price.allIn` put back on the card);
 * - no card carries an equivalents line (red with the line restored on a card);
 * - a hub card has no price element and no per-card "no price" line (T-07; red with it restored);
 * - in an all-example grid exactly one displayed element inside the grid's region holds the
 *   resolved `media.provenance.aiExample`, its box above the first card's top edge, while every
 *   `ai` card's own label is in the JavaScript-off HTML (red with the per-card labels displayed
 *   at 1440, and red with them removed from the HTML);
 * - the country occasion's lead figure displays its own label at 1440 beside the grid's one label,
 *   and at 390 is the grid's first card and displays none (red with the lead's label hidden at
 *   1440). The spec names `/en-gb/poland/occasions/birthday`, which the committed data does not
 *   publish; Mother's Day is the Poland occasion with a page, so it stands in;
 * - a mixed grid (the dev gallery's fixture, A8 (b)'s choice, recorded in the brief): one label
 *   per `ai` card at 1440 and exactly one for the grid at 390 (red with the mixed grid's per-card
 *   labels hidden at 1440).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type Locator, type Page, expect, test } from "@playwright/test";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;
type Locale = (typeof LOCALES)[number];

/** Each page type's URL in each locale (the committed slugs). */
const PAGES: Readonly<
  Record<
    Locale,
    { shop: string; category: string; occasion: string; hub: string }
  >
> = {
  en: {
    shop: "/en/poland/flowers",
    category: "/en/poland/flowers/roses",
    occasion: "/en/poland/occasions/mothers-day",
    hub: "/en/flowers/roses",
  },
  "en-gb": {
    shop: "/en-gb/poland/flowers",
    category: "/en-gb/poland/flowers/roses",
    occasion: "/en-gb/poland/occasions/mothers-day",
    hub: "/en-gb/flowers/roses",
  },
  de: {
    shop: "/de/polen/blumen",
    category: "/de/polen/blumen/rosen",
    occasion: "/de/polen/anlaesse/muttertag",
    hub: "/de/blumen/rosen",
  },
  pl: {
    shop: "/pl/polska/kwiaty",
    category: "/pl/polska/kwiaty/roze",
    occasion: "/pl/polska/okazje/dzien-matki",
    hub: "/pl/kwiaty/roze",
  },
};

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

interface Catalogue {
  catalog: { price: { inclusive: string; equivalents: string } };
  media: { provenance: { aiExample: string } };
}

/** The catalogue a locale renders from (`en-gb` falls back to `en` key by key). */
function messages(locale: Locale): Catalogue {
  const read = (code: string): Partial<Catalogue> =>
    JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, `../../messages/${code}.json`),
        "utf8",
      ),
    ) as Partial<Catalogue>;
  const base = read("en") as Catalogue;
  if (locale === "en" || locale === "en-gb") return base;
  const own = read(locale);
  return {
    catalog: {
      price: { ...base.catalog.price, ...own.catalog?.price },
    },
    media: {
      provenance: { ...base.media.provenance, ...own.media?.provenance },
    },
  };
}

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "viewport-explicit geometry; measured once, in e2e-desktop",
  );
});

async function open(
  page: Page,
  url: string,
  size: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(size);
  const response = await page.goto(url);
  expect(response?.status(), url).toBe(200);
}

/** The labels inside `region` that are displayed (a box), excluding the lead figure's. */
async function displayedGridLabels(
  region: Locator,
): Promise<{ text: string; bottom: number }[]> {
  return region.evaluate((root) =>
    Array.from(root.querySelectorAll("[data-fo-media-provenance]"))
      .filter((label) => label.closest("[data-fo-lead-item]") === null)
      .filter((label) => label.getClientRects().length > 0)
      .map((label) => ({
        text: (label as HTMLElement).innerText.trim(),
        bottom: label.getBoundingClientRect().bottom,
      })),
  );
}

async function firstCardTop(region: Locator): Promise<number> {
  return region.evaluate(
    (root) =>
      Array.from(
        root.querySelectorAll(
          "[data-fo-listing-grid] > li:not([data-fo-lead-item])",
        ),
      )[0]?.getBoundingClientRect().top ?? Number.NaN,
  );
}

for (const locale of LOCALES) {
  const words = messages(locale);
  const pages = PAGES[locale];
  for (const size of SIZES) {
    for (const [kind, url] of [
      ["shop", pages.shop],
      ["category", pages.category],
      ["occasion", pages.occasion],
    ] as const) {
      test(`${url} at ${String(size.width)}: one price with "${words.catalog.price.inclusive}", no equivalents, one grid label`, async ({
        page,
      }) => {
        await open(page, url, size);
        const cards = page.locator("main article[data-fo-product-card]");
        const count = await cards.count();
        expect(count).toBeGreaterThan(0);
        for (let index = 0; index < count; index += 1) {
          const card = cards.nth(index);
          await expect(card).toHaveAttribute(
            "data-fo-product-card-money",
            "priced",
          );
          // The words beside the amount: the second child of the price's first line.
          const qualifier = card
            .locator("[data-fo-price] > span > span")
            .nth(1);
          expect(
            (await qualifier.innerText()).trim(),
            `${url} card ${String(index)}`,
          ).toBe(words.catalog.price.inclusive);
          await expect(card.locator("[data-fo-price-equivalents]")).toHaveCount(
            0,
          );
        }
        await expect(
          page.locator("main [data-fo-price-equivalents]"),
        ).toHaveCount(0);

        // All-example grid (every committed photograph is an example): one displayed label in
        // the results region, above the first card, with the resolved words.
        const region = page.locator("main [data-fo-listing-results]");
        const labels = await displayedGridLabels(region);
        expect(labels, url).toHaveLength(1);
        expect(labels[0]?.text).toBe(words.media.provenance.aiExample);
        expect(labels[0]?.bottom ?? Infinity).toBeLessThanOrEqual(
          await firstCardTop(region),
        );
        // Every grid card's own label is in the server HTML (hidden by CSS).
        const own = await page
          .locator(
            "main [data-fo-listing-grid] > li:not([data-fo-lead-item]) [data-fo-card-provenance] [data-fo-media-provenance]",
          )
          .count();
        expect(own, url).toBe(count - (kind === "occasion" ? 1 : 0));

        // The country occasion's lead figure: its own label at 1440, none at 390.
        if (kind === "occasion") {
          const lead = page.locator(
            "main [data-fo-lead-item] [data-fo-media-provenance]",
          );
          await expect(lead).toHaveCount(1);
          if (size.width >= 768) await expect(lead).toBeVisible();
          else await expect(lead).toBeHidden();
        }
      });
    }

    test(`${pages.hub} at ${String(size.width)}: hub cards carry no price, one grid label`, async ({
      page,
    }) => {
      await open(page, pages.hub, size);
      const cards = page.locator("main article[data-fo-product-card]");
      expect(await cards.count()).toBeGreaterThan(0);
      await expect(page.locator("main [data-fo-price]")).toHaveCount(0);
      await expect(
        page.locator("main [data-fo-price-equivalents]"),
      ).toHaveCount(0);
      await expect(
        page.locator('main [data-fo-product-card-money="priced"]'),
      ).toHaveCount(0);
      expect(await page.locator("main").innerText()).not.toContain(
        "No price here. The price depends on the destination.",
      );
      const region = page.locator("main [data-fo-hub-products]");
      const labels = await displayedGridLabels(region);
      expect(labels).toHaveLength(1);
      expect(labels[0]?.text).toBe(words.media.provenance.aiExample);
      expect(labels[0]?.bottom ?? Infinity).toBeLessThanOrEqual(
        await firstCardTop(region),
      );
    });
  }
}

test.describe("JavaScript off: every `ai` card's own label is in the HTML", () => {
  test.use({ javaScriptEnabled: false });
  test("/en-gb/poland/flowers", async ({ page }) => {
    await open(page, PAGES["en-gb"].shop, SIZES[0]);
    const cards = await page
      .locator("main article[data-fo-product-card]")
      .count();
    expect(cards).toBeGreaterThan(0);
    await expect(
      page.locator(
        "main article[data-fo-product-card] [data-fo-card-provenance] [data-fo-media-provenance]",
      ),
    ).toHaveCount(cards);
  });
});

test.describe("a mixed grid (the dev gallery's fixture)", () => {
  for (const size of SIZES) {
    test(`at ${String(size.width)}: ${size.width >= 768 ? "one label per ai card" : "one label for the grid"}`, async ({
      page,
    }) => {
      await open(page, "/dev/components", size);
      const region = page.locator('[data-fo-listing-state="gridMixed"]');
      await expect(region).toHaveCount(1);
      const shown = await region.evaluate((root) =>
        Array.from(root.querySelectorAll("[data-fo-media-provenance]"))
          .filter((label) => label.getClientRects().length > 0)
          .map((label) =>
            label.closest("[data-fo-product-card]") === null ? "grid" : "card",
          ),
      );
      expect(shown).toEqual(size.width >= 768 ? ["card", "card"] : ["grid"]);
    });
  }
});
