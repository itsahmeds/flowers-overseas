/**
 * The shared per-depth route resolver (spec 008 §14 **A5**, §2, **AC-1**, **AC-3**, T-01, T-03;
 * spec 007 §14 A8, AC-5; TASK-109).
 *
 * `resolveLocalePath()` is the one function that decides which page a `/{locale}/…` path names,
 * because Next.js will not let the corridor page and the country shop root each own a route file.
 * Everything AC-1 requires to 404 is a *miss* here rather than a branch in `app/`, so this suite
 * is where the 404 matrix is proved without a browser: the e2e half (`tests/e2e/country-shop.spec.ts`)
 * then observes the same shapes over real responses.
 *
 * The two `generateStaticParams` sets are asserted to be exactly the union of the two existence
 * sets — AC-3's "emits exactly the existence set" — and, because the resolver is the same
 * predicate the router uses, every emitted param is checked to resolve back to the page it was
 * emitted for. A set that disagreed with the resolver would prebuild a URL the server then 404s.
 */
import { describe, expect, it } from "vitest";

import {
  listingPages,
  localeChildParams,
  localeSegmentParams,
  resolveLocalePath,
} from "../../src/modules/catalog";
import { listCorridorPages } from "../../src/modules/geo";

describe("resolveLocalePath: the pages that exist (AC-1)", () => {
  it("resolves the all-destinations hub in each launch locale's own segment", async () => {
    for (const [locale, segment] of [
      ["en", "send-flowers-to"],
      ["en-gb", "send-flowers-to"],
      ["de", "blumen-verschicken"],
      ["pl", "wyslij-kwiaty"],
    ] as const) {
      const match = await resolveLocalePath(locale, [segment]);
      expect(match.kind, `${locale}/${segment}`).toBe("destinationsHub");
    }
  });

  it("resolves the English Poland corridor page", async () => {
    const match = await resolveLocalePath("en", ["send-flowers-to", "poland"]);
    expect(match).toEqual({
      kind: "corridor",
      locale: "en",
      iso2: "PL",
      countrySlug: "poland",
    });
  });

  it("resolves the country shop root in every launch locale", async () => {
    for (const [locale, country, segment] of [
      ["en", "poland", "flowers"],
      ["en-gb", "poland", "flowers"],
      ["de", "polen", "blumen"],
      ["pl", "polska", "kwiaty"],
    ] as const) {
      const match = await resolveLocalePath(locale, [country, segment]);
      expect(match, `${locale}/${country}/${segment}`).toEqual({
        kind: "countryShopRoot",
        locale,
        iso2: "PL",
        countrySlug: country,
      });
    }
  });
});

describe("resolveLocalePath: everything else is `notFound` (AC-1)", () => {
  const misses: readonly (readonly [string, readonly string[]])[] = [
    // an unknown locale
    ["fr", ["poland", "flowers"]],
    ["fr", ["send-flowers-to"]],
    // a segment belonging to another locale
    ["en", ["polska", "kwiaty"]],
    ["pl", ["poland", "flowers"]],
    ["de", ["send-flowers-to", "polen"]],
    // an uppercase variant — nothing folds case (ADR-0006)
    ["en", ["Poland", "flowers"]],
    ["en", ["poland", "Flowers"]],
    ["en", ["SEND-FLOWERS-TO", "poland"]],
    // an unknown slug
    ["en", ["poland", "bouquets"]],
    ["en", ["atlantis", "flowers"]],
    ["en", ["send-flowers-to", "atlantis"]],
    // a destination that exists in another locale's spelling, and one that is not a destination
    ["en", ["rumaenien", "flowers"]],
    ["en", ["belgium", "flowers"]],
    // the category hub `/en/flowers/roses` and the bare `/en/flowers` (§13 Q4) — TASK-112/113's,
    // and a 404 until they exist
    ["en", ["flowers", "roses"]],
    ["en", ["flowers"]],
    ["en", ["occasions"]],
    // the wrong number of segments. `/en/poland/flowers/roses` was one of these until TASK-110
    // added the depth-4 branch; the shape that stays a miss at that depth is one segment deeper
    // still, and the country category's own 404 matrix is `tests/unit/catalog-routes-category.test.ts`.
    ["en", []],
    ["en", ["poland", "flowers", "roses", "red"]],
  ];

  for (const [locale, segments] of misses) {
    it(`404s /${locale}/${segments.join("/")}`, async () => {
      const match = await resolveLocalePath(locale, segments);
      expect(match.kind).toBe("notFound");
    });
  }
});

describe("generateStaticParams is the union of both existence sets (AC-3)", () => {
  it("emits the destinations hub for every routable locale, and nothing else", async () => {
    const params = localeSegmentParams();
    expect(params.length).toBeGreaterThan(0);
    for (const param of params) {
      const match = await resolveLocalePath(param.locale, [param.segment]);
      expect(match.kind, `${param.locale}/${param.segment}`).toBe(
        "destinationsHub",
      );
    }
  });

  it("emits every corridor page and every country shop root, and only those", async () => {
    const params = await localeChildParams();

    const corridors = listCorridorPages();
    const shopRoots = (await listingPages()).filter(
      (page) => page.pageType === "countryShopRoot",
    );
    expect(params).toHaveLength(corridors.length + shopRoots.length);

    const kinds = await Promise.all(
      params.map(async (param) =>
        resolveLocalePath(param.locale, [param.segment, param.child]),
      ),
    );
    // Every prebuilt URL resolves, and to one of the two page types — a param the resolver then
    // 404s would be a prebuilt dead page.
    expect(kinds.map((match) => match.kind).sort()).toEqual(
      [
        ...corridors.map(() => "corridor"),
        ...shopRoots.map(() => "countryShopRoot"),
      ].sort(),
    );
  });

  it("emits the shop root at the destination's own slug and the locale's own segment", async () => {
    const params = await localeChildParams();
    expect(params).toContainEqual({
      locale: "de",
      segment: "polen",
      child: "blumen",
    });
    expect(params).toContainEqual({
      locale: "pl",
      segment: "polska",
      child: "kwiaty",
    });
    // The shop-root set is **data**, not a list in this file: every published destination with a
    // deliverable product has one, in every launch locale, at that locale's own slug and segment
    // (§2 row 6). What is asserted is that the emitted set is exactly `listingPages()`'s — a
    // country's go-live is then a flip in `countries.ts` with no change here (AC-5).
    const shopRoots = params.filter((param) =>
      ["flowers", "blumen", "kwiaty"].includes(param.child),
    );
    const fromRule = (await listingPages()).filter(
      (page) => page.pageType === "countryShopRoot",
    );
    expect(shopRoots).toHaveLength(fromRule.length);
    for (const page of fromRule) {
      expect(shopRoots, page.path).toContainEqual({
        locale: page.locale,
        segment: page.countrySlug,
        child: page.path.split("/")[3],
      });
    }
  });
});
