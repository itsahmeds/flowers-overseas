/**
 * The depth-4 resolver for the country category (spec 008 §2 row 7, §14 **A5**, **AC-1**, AC-3;
 * T-01; TASK-110).
 *
 * `resolveLocalePath()` is what `src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx` calls
 * and the only thing it calls, so every shape AC-1 requires to 404 is observable here without a
 * server: an unknown slug, a **below-floor category**, another locale's segment, another locale's
 * slug, an uppercase variant, an unpublished country and an unknown locale. The served half — the
 * status codes, the absent `Location` header and the trailing-slash 308 — is
 * `tests/e2e/country-category.spec.ts`.
 *
 * The set this file reads is `localeGrandchildParams()`, which is `listingPages()` filtered to one
 * page type: `generateStaticParams` emits exactly it and `dynamicParams = false`, so "everything
 * else is a 404" is a property of the router rather than of a branch someone could delete.
 */
import { describe, expect, it } from "vitest";

import {
  localeGrandchildParams,
  resolveLocalePath,
} from "../../src/modules/catalog";

const params = await localeGrandchildParams();

describe("the prebuilt set (AC-3)", () => {
  it("is non-empty and every row is a country category", () => {
    expect(params.length).toBeGreaterThan(0);
    for (const row of params) {
      expect(row.locale.length, JSON.stringify(row)).toBeGreaterThan(1);
      expect(row.segment.length, JSON.stringify(row)).toBeGreaterThan(0);
      expect(row.child.length, JSON.stringify(row)).toBeGreaterThan(0);
      expect(row.grandchild.length, JSON.stringify(row)).toBeGreaterThan(0);
    }
  });

  it("holds no duplicate URL", () => {
    const urls = params.map(
      (row) => `/${row.locale}/${row.segment}/${row.child}/${row.grandchild}`,
    );
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("resolves every row it emits to a `countryCategory`", async () => {
    // The whole set, not a sample: `dynamicParams = false` means this list *is* the 200 set, and a
    // row that resolved to `notFound` would be a prebuilt 404.
    for (const row of params) {
      const match = await resolveLocalePath(row.locale, [
        row.segment,
        row.child,
        row.grandchild,
      ]);
      expect(
        match.kind,
        `/${row.locale}/${row.segment}/${row.child}/${row.grandchild}`,
      ).toBe("countryCategory");
    }
  });

  it("carries the slugs the URL spells, not the catalogue keys", async () => {
    const match = await resolveLocalePath("en", ["poland", "flowers", "roses"]);
    expect(match).toEqual({
      kind: "countryCategory",
      locale: "en",
      iso2: "PL",
      countrySlug: "poland",
      categorySlug: "roses",
    });
  });
});

describe("every shape AC-1 requires to be a miss", () => {
  const MISSES: readonly (readonly [string, readonly string[], string])[] = [
    // A category below `PRODUCT_COUNT_FLOOR`: orchids has 3 products in Poland and sunflowers 4,
    // so neither has a URL in any locale (§13 Q7). This is the one 404 shape that is a *count*.
    ["en", ["poland", "flowers", "orchids"], "below the six-product floor"],
    ["en", ["poland", "flowers", "sunflowers"], "below the six-product floor"],
    ["en", ["poland", "flowers", "orchidee"], "an unknown category slug"],
    ["en", ["atlantis", "flowers", "roses"], "an unknown country slug"],
    ["en", ["belgium", "flowers", "roses"], "a country we do not serve"],
    ["en", ["poland", "blumen", "roses"], "another locale's page segment"],
    ["en", ["polska", "flowers", "roses"], "another locale's country slug"],
    ["pl", ["poland", "flowers", "roses"], "another locale's URL entirely"],
    ["en", ["poland", "Flowers", "roses"], "an uppercase segment"],
    ["en", ["poland", "flowers", "Roses"], "an uppercase slug"],
    ["en", ["Poland", "flowers", "roses"], "an uppercase country slug"],
    ["fr", ["poland", "flowers", "roses"], "an unknown locale"],
    ["en", ["send-flowers-to", "poland", "roses"], "the corridor, one deeper"],
    ["en", ["poland", "occasions", "womens-day"], "TASK-111's occasion URL"],
  ];

  for (const [locale, segments, why] of MISSES) {
    it(`/${locale}/${segments.join("/")} — ${why}`, async () => {
      const match = await resolveLocalePath(locale, segments);
      expect(match.kind).toBe("notFound");
    });
  }

  it("has no authored category slug in `de` or `pl`, so those URLs do not exist (§13 Q10)", async () => {
    // Not a defect: the ~31 category slugs are human-authored per locale and never machine-drafted
    // (TASK-106 authors them). A locale with no slug has no page there and contributes no
    // `hreflang` alternate — which is why the set below is empty rather than an English echo.
    expect(params.filter((row) => row.locale === "de")).toEqual([]);
    expect(params.filter((row) => row.locale === "pl")).toEqual([]);
    expect(
      (await resolveLocalePath("de", ["polen", "blumen", "rosen"])).kind,
    ).toBe("notFound");
  });
});
