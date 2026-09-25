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
  listingExists,
  listingLocales,
  listingPages,
  localeChildParams,
  localeSegmentParams,
  resolveLocalePath,
} from "../../src/modules/catalog";
import { listCorridorPages } from "../../src/modules/geo";
import { localePath } from "../../src/modules/i18n/routing";

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

  it("resolves the two destination-less hubs at depth 3 (AC-7, AC-11; TASK-112)", async () => {
    for (const locale of ["en", "en-gb"] as const) {
      expect(
        await resolveLocalePath(locale, ["flowers", "roses"]),
        `${locale} category hub`,
      ).toEqual({ kind: "categoryHub", locale, slug: "roses" });
      expect(
        await resolveLocalePath(locale, ["occasions", "mothers-day"]),
        `${locale} occasion hub`,
      ).toEqual({ kind: "occasionHub", locale, slug: "mothers-day" });
    }
  });

  it("resolves an evergreen occasion's hub, which has no observance row at all (§14 A1)", async () => {
    // The clause exists so that birthday, sympathy, wedding … have hubs: an evergreen occasion
    // carries no `occasion_country` row by design, so "observed in ≥1 published country" would
    // never be true for it and fourteen hubs the spec requires would have no URL.
    expect(await resolveLocalePath("en", ["occasions", "birthday"])).toEqual({
      kind: "occasionHub",
      locale: "en",
      slug: "birthday",
    });
  });
});

/**
 * **Branch order is load-bearing** (spec 008 §14 A5, AC-4; TASK-112).
 *
 * Four page types share depth 3 and each is claimed by a *shape*: `{destinations}/{country}`,
 * `{country}/{shopCategory}`, `{shopCategory}/{slug}` and `{occasions}/{slug}`. Two things have to
 * hold for the resolver to be a function rather than a race: every URL that exists must resolve to
 * exactly one kind, and a path whose segments satisfy two shapes at once must resolve
 * deterministically — never "whichever branch the reader of this file happened to add last".
 */
describe("resolveLocalePath: one URL, one branch (AC-4)", () => {
  it("resolves every depth-3 page in the existence set to its own kind, and nothing to two", async () => {
    const depth3 = (await listingPages()).filter((page) =>
      ["countryShopRoot", "categoryHub", "occasionHub"].includes(page.pageType),
    );
    expect(depth3.length).toBeGreaterThan(0);
    for (const page of depth3) {
      const [, , segment, child] = page.path.split("/");
      const match = await resolveLocalePath(page.locale, [
        segment ?? "",
        child ?? "",
      ]);
      expect(match.kind, page.path).toBe(page.pageType);
    }
  });

  it("keeps the four first-segment sets disjoint in every locale", async () => {
    // Nothing below is a preference: spec 008 AC-4's collision matrix and `seed:check` make these
    // sets disjoint in the *data*, and this is the assertion that the resolver's branches read
    // that guarantee rather than an accident of ordering.
    for (const locale of ["en", "en-gb", "de", "pl"] as const) {
      const pageSegments = [
        localePath(locale, "destinations").split("/")[2],
        localePath(locale, "shopCategory").split("/")[2],
        localePath(locale, "occasions").split("/")[2],
      ];
      expect(new Set(pageSegments).size, locale).toBe(3);
      const countrySlugs = (await listingPages(locale))
        .filter((page) => page.countrySlug !== undefined)
        .map((page) => page.countrySlug);
      for (const slug of countrySlugs) {
        expect(pageSegments, `${locale} ${slug ?? ""}`).not.toContain(slug);
      }
    }
  });

  it("answers a path that matches two shapes from the branch listed first, not from both", async () => {
    // `/en/flowers/flowers` satisfies the shop root's shape (`{country}/{shopCategory}`, with
    // `flowers` read as a country slug) **and** the category hub's (`{shopCategory}/{slug}`, with
    // `flowers` read as a category slug). The shop-root branch is listed first, so it answers: it
    // finds no destination called `flowers` and the path is a 404. It is **not** rescued by the
    // hub branch below it, which is the property that makes the order deterministic — and it costs
    // nothing, because `seed:check` refuses a category slug equal to a `PATH_SEGMENT_KEYS` value,
    // so no URL of this shape can ever exist.
    expect((await resolveLocalePath("en", ["flowers", "flowers"])).kind).toBe(
      "notFound",
    );
    expect(
      (await resolveLocalePath("en", ["occasions", "occasions"])).kind,
    ).toBe("notFound");
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
    // the bare `/en/flowers` is a 404 by §13 Q4: no country-less categories index ships. The
    // bare `/en/occasions` **is** a page now (TASK-113) and is asserted as one below; `/pl/okazje`
    // is the 404, because no occasion carries a Polish slug and so no hub exists there to list.
    ["en", ["flowers"]],
    ["pl", ["okazje"]],
    // a hub slug this locale has never authored: `de` and `pl` carry machine drafts, so they have
    // no category or occasion slugs and therefore no hubs at all until TASK-106 (§13 Q10)
    ["de", ["blumen", "rosen"]],
    ["de", ["blumen", "roses"]],
    ["pl", ["kwiaty", "roze"]],
    ["pl", ["okazje", "dzien-matki"]],
    // an unknown hub slug, and a slug from the *other* namespace under a hub's segment: an
    // occasion is not a category and the two URL spaces never bleed into each other (AC-4)
    ["en", ["flowers", "atlantis"]],
    ["en", ["occasions", "atlantis"]],
    ["en", ["flowers", "mothers-day"]],
    ["en", ["occasions", "roses"]],
    // an uppercase hub slug — nothing folds case (ADR-0006)
    ["en", ["flowers", "Roses"]],
    ["en", ["Flowers", "roses"]],
    // another locale's page segment carrying this locale's slug
    ["en", ["blumen", "roses"]],
    ["en", ["okazje", "mothers-day"]],
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
  it("emits the destinations hub and the occasions index, and nothing else", async () => {
    const params = await localeSegmentParams();
    expect(params.length).toBeGreaterThan(0);
    const kinds = new Map<string, string>();
    for (const param of params) {
      const match = await resolveLocalePath(param.locale, [param.segment]);
      // Every prebuilt URL at this depth resolves, and to one of the depth's two page types —
      // never to `notFound`, which with `dynamicParams = false` would be a prebuilt 404
      // (spec 008 AC-3; TASK-113).
      expect(
        ["destinationsHub", "occasionsIndex"],
        `${param.locale}/${param.segment}`,
      ).toContain(match.kind);
      kinds.set(`${param.locale}/${param.segment}`, match.kind);
    }
    // The hub is in every listing locale; the index only where an occasion hub exists, which is
    // `listingExists()`'s answer and not a fact about the locale registry.
    const hubs = [...kinds.values()].filter(
      (kind) => kind === "destinationsHub",
    );
    expect(hubs).toHaveLength(listingLocales().length);
    const indexes = [...kinds.values()].filter(
      (kind) => kind === "occasionsIndex",
    );
    expect(indexes).toHaveLength(
      (await listingPages()).filter(
        (page) => page.pageType === "occasionsIndex",
      ).length,
    );
    expect(indexes.length).toBeGreaterThan(0);
  });

  it("404s a locale's occasions segment where no occasion hub exists", async () => {
    // `/pl/okazje` is a hard 404 today because no occasion has a Polish slug yet — the existence
    // rule of §2 row 14, not a special case. It becomes a page the day one is authored, with no
    // edit under `src/app/` (AC-5's promise applied to this page type).
    for (const locale of listingLocales()) {
      const segment = localePath(locale, "occasions").split("/")[2] ?? "";
      const exists = await listingExists({
        pageType: "occasionsIndex",
        locale,
      });
      const match = await resolveLocalePath(locale, [segment]);
      expect(match.kind, `${locale}/${segment}`).toBe(
        exists ? "occasionsIndex" : "notFound",
      );
    }
  });

  it("emits every corridor page, country shop root and hub, and only those", async () => {
    const params = await localeChildParams();

    const corridors = listCorridorPages();
    const listings = (await listingPages()).filter((page) =>
      ["countryShopRoot", "categoryHub", "occasionHub"].includes(page.pageType),
    );
    expect(params).toHaveLength(corridors.length + listings.length);

    const kinds = await Promise.all(
      params.map(async (param) =>
        resolveLocalePath(param.locale, [param.segment, param.child]),
      ),
    );
    // Every prebuilt URL resolves, and to one of the four page types that share this depth — a
    // param the resolver then 404s would be a prebuilt dead page.
    expect(kinds.map((match) => match.kind).sort()).toEqual(
      [
        ...corridors.map(() => "corridor"),
        ...listings.map((page) => page.pageType),
      ].sort(),
    );
  });

  it("emits both hubs at the page type's own segment and the entity's authored slug", async () => {
    const params = await localeChildParams();
    expect(params).toContainEqual({
      locale: "en",
      segment: "flowers",
      child: "roses",
    });
    expect(params).toContainEqual({
      locale: "en-gb",
      segment: "occasions",
      child: "mothers-day",
    });
    // `de` and `pl` have no authored category or occasion slugs, so they prebuild no hub at all
    // (§13 Q10) — the honest answer, and the one that keeps `/de/blumen/roses` from being served.
    expect(
      params.filter(
        (param) =>
          ["blumen", "kwiaty", "anlaesse", "okazje"].includes(param.segment) &&
          (param.locale === "de" || param.locale === "pl"),
      ),
    ).toEqual([]);
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
