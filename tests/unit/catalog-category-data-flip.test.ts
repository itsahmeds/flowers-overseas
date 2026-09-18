/**
 * **AC-5 — the data-flip proof** (spec 008 §9 L257; T-05; TASK-110).
 *
 * "Raising a fixture country's product coverage so a category crosses the floor adds its URL, its
 * links from the shop root and the corridor, and (when the country is live) its sitemap row and
 * hreflang entry — with **no change under `src/app/`** and no template edit."
 *
 * Orchids is the fixture: three products in Poland against a `PRODUCT_COUNT_FLOOR` of six, an
 * authored `en` slug, and therefore no URL anywhere today (the artboard's own example). This file
 * raises its coverage the only way a page-count rule can be raised — through the count spec 005
 * supplies — and then asks every consumer of the existence set the same question it asked before.
 *
 * The mock is on `read.ts`'s `countProductsIn`, which is the function `plan/02` §4.1's "≥6
 * products" condition is *made of*: spec 005 supplies the counts and spec 008 enforces the
 * threshold in **one** predicate (§2). Mocking anything further up would be mocking the rule
 * rather than the data, and would prove nothing about whether the rule is data-driven.
 *
 * The "no change under `src/app/`" half cannot be proved by running the flip — a test cannot take
 * a diff of a file it did not write — so it is proved structurally instead: the last describe
 * block reads every route under `src/app/` and asserts that none of them names a category, a
 * catalogue key, a slug, a destination or the floor. A route file that cannot spell "orchids"
 * cannot need editing when orchids gains a page.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

/** A category that sits **below** the six-product floor in every destination (`en` slug: orchids). */
const KEY = "orchids";
const SLUG = "orchids";
/** A category that sits above it, whose page is the sibling row we watch the new chip appear in. */
const SIBLING = "roses";

const real = await import("../../src/modules/catalog/read.ts");

/** The baseline answers, taken from the **unmocked** module before the flip. */
const before = await (async () => {
  const listing = await import("../../src/modules/catalog/listing.ts");
  const routes = await import("../../src/modules/catalog/routes.ts");
  return {
    count: await real.countProductsIn(KEY, "PL"),
    exists: await listing.listingExists({
      pageType: "countryCategory",
      locale: "en",
      countryIso: "PL",
      entityKey: KEY,
    }),
    paths: (await listing.listingPages("en")).map((page) => page.path),
    tiles: (
      await listing.listingView(
        { locale: "en", pageType: "countryShopRoot", country: "poland" },
        { from: "2026-09-15" },
      )
    )?.tiles.map((tile) => tile.key),
    chips: (
      await listing.listingView(
        {
          locale: "en",
          pageType: "countryCategory",
          country: "poland",
          entity: SIBLING,
        },
        { from: "2026-09-15" },
      )
    )?.links.chips.map((chip) => chip.key),
    alternates: await listing.listingAlternatePaths({
      pageType: "countryCategory",
      locale: "en",
      countryIso: "PL",
      entityKey: KEY,
    }),
    resolved: (
      await routes.resolveLocalePath("en", ["poland", "flowers", SLUG])
    ).kind,
  };
})();

describe("before the flip: the category is below the floor and has no page", () => {
  it("has fewer products than the floor", () => {
    expect(before.count).toBeGreaterThan(0);
    expect(before.count).toBeLessThan(6);
  });

  it("has no URL, no tile, no chip, no alternate and no route", () => {
    expect(before.exists).toBe(false);
    expect(before.paths).not.toContain(`/en/poland/flowers/${SLUG}`);
    expect(before.tiles).not.toContain(KEY);
    expect(before.chips).not.toContain(KEY);
    expect(Object.keys(before.alternates)).toEqual([]);
    expect(before.resolved).toBe("notFound");
  });
});

/**
 * The flip. Nothing but the count changes: the same dataset, the same slugs, the same registry,
 * the same components — the fixture country's coverage of one category crosses the floor.
 */
vi.doMock("../../src/modules/catalog/read.ts", () => ({
  ...real,
  countProductsIn: async (categoryKey: string, iso2: string) =>
    categoryKey === KEY && iso2 === "PL"
      ? 7
      : real.countProductsIn(categoryKey, iso2 as never),
}));
vi.resetModules();

const listing = await import("../../src/modules/catalog/listing.ts");
const routes = await import("../../src/modules/catalog/routes.ts");

describe("after the flip: the URL, the links and the alternates appear (AC-5)", () => {
  it("the one existence predicate now says yes", async () => {
    expect(
      await listing.listingExists({
        pageType: "countryCategory",
        locale: "en",
        countryIso: "PL",
        entityKey: KEY,
      }),
    ).toBe(true);
  });

  it("the existence set gains exactly that URL", async () => {
    const paths = (await listing.listingPages("en")).map((page) => page.path);
    expect(paths).toContain(`/en/poland/flowers/${SLUG}`);
    // Nothing else moved: the flip adds one page per locale that has the slug, and nothing is
    // removed. (`en` and `en-gb` have the authored slug; `de`/`pl` do not, §13 Q10.)
    expect(paths.length).toBe(before.paths.length + 1);
    for (const path of before.paths) expect(paths).toContain(path);
  });

  it("the shop root gains its tile", async () => {
    const view = await listing.listingView(
      { locale: "en", pageType: "countryShopRoot", country: "poland" },
      { from: "2026-09-15" },
    );
    expect(view?.tiles.map((tile) => tile.key)).toContain(KEY);
  });

  it("every sibling category gains its chip", async () => {
    const view = await listing.listingView(
      {
        locale: "en",
        pageType: "countryCategory",
        country: "poland",
        entity: SIBLING,
      },
      { from: "2026-09-15" },
    );
    const chips = view?.links.chips ?? [];
    const added = chips.find((chip) => chip.key === KEY);
    expect(added?.href).toBe(`/en/poland/flowers/${SLUG}`);
  });

  it("the hreflang cluster gains the locales that have the slug", async () => {
    const alternates = await listing.listingAlternatePaths({
      pageType: "countryCategory",
      locale: "en",
      countryIso: "PL",
      entityKey: KEY,
    });
    expect(alternates["en"]).toBe(`/en/poland/flowers/${SLUG}`);
    expect(alternates["en-gb"]).toBe(`/en-gb/poland/flowers/${SLUG}`);
    // A locale with no authored slug contributes no alternate, before or after (AC-16).
    expect(alternates["de"]).toBeUndefined();
    expect(alternates["pl"]).toBeUndefined();
  });

  it("the route resolver and the prebuilt set answer for it", async () => {
    const match = await routes.resolveLocalePath("en", [
      "poland",
      "flowers",
      SLUG,
    ]);
    expect(match.kind).toBe("countryCategory");
    const params = await routes.localeGrandchildParams();
    expect(
      params.some(
        (row) =>
          row.locale === "en" &&
          row.segment === "poland" &&
          row.child === "flowers" &&
          row.grandchild === SLUG,
      ),
    ).toBe(true);
  });
});

/**
 * **The sitemap row and the corridor's category links** are the two consumers AC-5 names that do
 * not exist yet: `sitemap/categories.xml` is TASK-115's and the five `site-links.ts` ids the
 * corridor renders them from are AC-20's owner's. Both read the same `listingPages()` /
 * `listingExists()` answers this file just watched change, which is the property that makes them
 * inherit the flip. Recorded here so the gap is visible rather than assumed.
 */
describe("what the flip reaches through, and what is not built yet", () => {
  it("both unbuilt consumers read the existence set this test flipped", async () => {
    const pages = await listing.listingPages("en");
    const page = pages.find((row) => row.path === `/en/poland/flowers/${SLUG}`);
    expect(page?.pageType).toBe("countryCategory");
    expect(page?.slug).toBe(SLUG);
    expect(page?.countrySlug).toBe("poland");
  });
});

/**
 * The "no change under `src/app/`" half, structurally (T-05's `git diff --stat src/app` empty).
 *
 * A test cannot take a diff of a change it did not make, so what is asserted instead is the
 * property that *makes* the diff empty: no route under `src/app/` can spell a category. Comments
 * are stripped before the scan — a doc comment that explains where the floor lives is exactly the
 * pointer a reader wants, and it is not code anyone would have to edit — and the component gallery
 * under `(dev)` is excluded, because it is a fixture bench behind `ENABLE_DEV_UI` rather than a
 * page type this spec serves, and naming a product for a drawing is its whole job.
 */
describe("`src/app/` cannot need editing when a category crosses the floor", () => {
  function filesUnder(dir: string): readonly string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.name === "(dev)") continue;
      if (entry.isDirectory()) found.push(...filesUnder(path));
      else if (/\.tsx?$/u.test(entry.name)) found.push(path);
    }
    return found;
  }

  /** Source with block and line comments removed: what a maintainer would actually have to edit. */
  function code(file: string): string {
    return readFileSync(file, "utf8")
      .replaceAll(/\/\*[\s\S]*?\*\//gu, " ")
      .replaceAll(/^\s*\/\/.*$/gmu, " ");
  }

  const files = filesUnder("src/app");

  it("finds route files to scan", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const forbidden of [
    // a category slug or a catalogue key
    /\borchids?\b/iu,
    /\broses\b/iu,
    /\bsunflowers\b/iu,
    /\bhand-tied-bouquets\b/iu,
    // the threshold itself, in any spelling a route could restate it in
    /PRODUCT_COUNT_FLOOR/u,
    /countProductsIn/u,
    // and the country, which is the other half of the same rule
    /\bpoland\b/iu,
  ]) {
    it(`no route under \`src/app/\` mentions ${forbidden.source}`, () => {
      for (const file of files) {
        expect(
          forbidden.test(code(file)),
          `${file} mentions ${forbidden.source}`,
        ).toBe(false);
      }
    });
  }
});
