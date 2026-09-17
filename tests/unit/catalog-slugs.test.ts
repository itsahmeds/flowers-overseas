/**
 * Slugs, the collision matrix and the listing boundary schemas (spec 008 AC-4 and the routing
 * half of AC-1, T-04; spec 009 §13 Q1; TASK-105).
 *
 * The matrix is **table-driven over the committed corpus**, never over a transcribed list of
 * slugs, for one reason: the founder authors the ~31 `de`/`pl` category and occasion slugs in
 * TASK-106, and those pages must come into existence as *data* (spec 008 §13 Q10). So every
 * expectation below is derived from `seed/data/copy/{locale}/{entity}.json` and from the closed
 * registries (`countries.ts`, `PATH_SEGMENT_KEYS`, the catalogue datasets) — when the slugs land,
 * this file covers them with no edit, and if one of them collides with a country slug, a path
 * segment or a sibling namespace it fails here before it can become a URL.
 *
 * Five claims:
 *
 *  1. **No collision is possible** (AC-4): no country slug equals a path segment in its locale, no
 *     category slug equals another category's or any occasion's or product's slug in the same
 *     locale, and nothing in the three namespaces equals a `PATH_SEGMENT_KEYS` value or a country
 *     slug. A collision would make one URL mean two things.
 *  2. **`resolveSlug()` is the inverse of `slugFor()`** over the whole corpus in all four locales.
 *  3. **A machine draft is not a URL**: `hasSlug()` is false for every key whose locale has no
 *     authored row and inherits none — today, every category and occasion in `de` and `pl`, which
 *     is exactly why those pages do not exist yet (spec 008 §2, §14).
 *  4. **A product slug is shared, not translated** (spec 009 §13 Q1): the authored `en` slug in
 *     every locale, with a per-locale override honoured where one is authored (`en-gb` authors
 *     two today).
 *  5. **The boundary schemas refuse what the URL rules refuse**: an uppercase or trailing-slash
 *     path segment does not parse (so it is a 404, never a redirect — ADR-0006), a listing page
 *     type carrying the wrong segments does not parse, and a query string never fails to parse at
 *     all: every parameter is honoured or neutralised (§5.2, AC-15).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CATEGORIES } from "../../src/config/catalogue/categories.data.ts";
import { OCCASIONS } from "../../src/config/catalogue/occasions.data.ts";
import { PRODUCTS } from "../../src/config/catalogue/products.data.ts";
import { COUNTRIES, countrySlug } from "../../src/config/countries.ts";
import { OCCASION_TILES, occasionSlug } from "../../src/config/occasions.ts";
import { LAUNCH_LOCALE_DATA } from "../../src/config/locales.data.ts";
import { PATH_SEGMENT_KEYS } from "../../src/config/locales.ts";
import {
  ListingParamsSchema,
  ListingSearchParamsSchema,
  hasSlug,
  resolveSlug,
  slugFor,
  slugKinds,
} from "../../src/modules/catalog/index.ts";
import type { SlugKind } from "../../src/modules/catalog/index.ts";
import { SeedCopyRegistrySchema } from "../../seed/schema/copy.ts";

const repoRoot = resolve(__dirname, "../..");

const LAUNCH_LOCALES = LAUNCH_LOCALE_DATA.map((locale) => locale.code);

/** Which copy file carries which namespace (spec 006 §2 `copy/{locale}/{entity}.json`). */
const COPY_FILE: Readonly<Record<SlugKind, string>> = {
  category: "categories",
  occasion: "occasions",
  product: "products",
};

/** The catalogue keys each namespace can have a slug for — the closed registries, not the copy. */
const KEYS: Readonly<Record<SlugKind, readonly string[]>> = {
  category: CATEGORIES.map((category) => category.key),
  occasion: OCCASIONS.map((occasion) => occasion.key),
  product: PRODUCTS.map((product) => product.sku),
};

interface CopyRow {
  readonly key: string;
  readonly slug: string;
  readonly translationStatus: "human" | "machine";
}

/** One copy file, parsed with spec 006's own schema: the typed build-time import's gate. */
function copyRows(kind: SlugKind, locale: string): readonly CopyRow[] {
  const path = resolve(
    repoRoot,
    `seed/data/copy/${locale}/${COPY_FILE[kind]}.json`,
  );
  const file = JSON.parse(readFileSync(path, "utf8")) as { rows: unknown[] };
  return SeedCopyRegistrySchema.parse(file.rows) as readonly CopyRow[];
}

/** The authored (`translationStatus: "human"`) rows of one namespace in one locale. */
function authored(kind: SlugKind, locale: string): ReadonlyMap<string, string> {
  return new Map(
    copyRows(kind, locale)
      .filter((row) => row.translationStatus === "human")
      .map((row) => [row.key, row.slug]),
  );
}

/** Every slug the public API reports for a namespace in a locale, keyed by catalogue key. */
function effective(
  kind: SlugKind,
  locale: string,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const key of KEYS[kind]) {
    const slug = slugFor(kind, key, locale as never);
    if (slug !== undefined) map.set(key, slug);
  }
  return map;
}

const localeCountrySlugs = (locale: string): readonly string[] =>
  COUNTRIES.map((country) => countrySlug(country.iso2, locale));

const localePathSegments = (locale: string): readonly string[] => {
  const config = LAUNCH_LOCALE_DATA.find((entry) => entry.code === locale);
  if (config === undefined) throw new Error(`unknown launch locale ${locale}`);
  return PATH_SEGMENT_KEYS.map((key) => config.pathSegments[key]);
};

/* -------------------------------------------------------------------------- */
/* 1. The collision matrix (AC-4, T-04).                                       */
/* -------------------------------------------------------------------------- */

describe.each(LAUNCH_LOCALES)(
  "collision matrix — %s (AC-4, T-04)",
  (locale) => {
    const segments = localePathSegments(locale);
    const countries = localeCountrySlugs(locale);

    it("gives no country the slug of a path segment in its own locale", () => {
      for (const slug of countries) {
        expect(segments, `${locale} country slug \`${slug}\``).not.toContain(
          slug,
        );
      }
    });

    it("gives every destination a distinct slug", () => {
      expect(new Set(countries).size).toBe(countries.length);
    });

    it.each(slugKinds)(
      "keeps every %s slug off the reserved segments and the country slugs",
      (kind) => {
        for (const [key, slug] of effective(kind, locale)) {
          expect(segments, `${locale} ${kind}:${key}`).not.toContain(slug);
          expect(countries, `${locale} ${kind}:${key}`).not.toContain(slug);
        }
      },
    );

    it("lets no slug stand for two entities, inside a namespace or across the three", () => {
      const owner = new Map<string, string>();
      for (const kind of slugKinds) {
        for (const [key, slug] of effective(kind, locale)) {
          const existing = owner.get(slug);
          expect(
            existing,
            `${locale}: \`${slug}\` is claimed by ${existing} and ${kind}:${key}`,
          ).toBeUndefined();
          owner.set(slug, `${kind}:${key}`);
        }
      }
    });

    it("uses lowercase ASCII hyphenated slugs only (plan/02 §4)", () => {
      for (const kind of slugKinds) {
        for (const [key, slug] of effective(kind, locale)) {
          expect(slug, `${locale} ${kind}:${key}`).toMatch(
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
          );
        }
      }
    });
  },
);

/* -------------------------------------------------------------------------- */
/* 2. Round trip (AC-4).                                                       */
/* -------------------------------------------------------------------------- */

describe.each(LAUNCH_LOCALES)("resolveSlug ∘ slugFor — %s (AC-4)", (locale) => {
  it.each(slugKinds)("round-trips every %s that has a slug", (kind) => {
    const slugs = effective(kind, locale);
    for (const [key, slug] of slugs) {
      expect(
        resolveSlug(locale as never, kind, slug),
        `${locale} ${kind}`,
      ).toBe(key);
    }
    // The corpus is not empty in some namespace of every locale, so the loop above is never
    // vacuous: products are shared by all four locales (spec 009 §13 Q1).
    if (kind === "product") expect(slugs.size).toBe(PRODUCTS.length);
  });

  it.each(slugKinds)(
    "answers nothing for a %s slug it never issued",
    (kind) => {
      const issued = new Set(effective(kind, locale).values());
      for (const candidate of [
        "not-a-slug-we-authored",
        ...localePathSegments(locale),
        ...localeCountrySlugs(locale),
      ]) {
        if (issued.has(candidate)) continue;
        expect(
          resolveSlug(locale as never, kind, candidate),
          `${locale} ${kind} ${candidate}`,
        ).toBeUndefined();
      }
    },
  );
});

/* -------------------------------------------------------------------------- */
/* 3. An authored slug is the only slug (spec 008 §2, §13 Q10, §14).           */
/* -------------------------------------------------------------------------- */

describe.each(LAUNCH_LOCALES)("hasSlug — %s (spec 008 §2)", (locale) => {
  it.each(["category", "occasion"] as const)(
    "reports a %s slug exactly where the locale authors one (or inherits it in its own language)",
    (kind) => {
      const own = authored(kind, locale);
      const inherited =
        locale === "en-gb" ? authored(kind, "en") : new Map<string, string>();

      for (const key of KEYS[kind]) {
        const expected = own.get(key) ?? inherited.get(key);
        expect(
          hasSlug(kind, key, locale as never),
          `${locale} ${kind}:${key}`,
        ).toBe(expected !== undefined);
        expect(
          slugFor(kind, key, locale as never),
          `${locale} ${kind}:${key}`,
        ).toBe(expected);
      }
    },
  );

  it.each(["category", "occasion"] as const)(
    "treats a machine draft as no %s slug at all",
    (kind) => {
      const drafts = copyRows(kind, locale).filter(
        (row) => row.translationStatus === "machine",
      );
      const own = authored(kind, locale);
      const inherited =
        locale === "en-gb" ? authored(kind, "en") : new Map<string, string>();
      for (const draft of drafts) {
        if (own.has(draft.key) || inherited.has(draft.key)) continue;
        expect(
          hasSlug(kind, draft.key, locale as never),
          `${locale} ${draft.key}`,
        ).toBe(false);
        expect(
          resolveSlug(locale as never, kind, draft.slug),
          `${locale} ${draft.slug}`,
        ).toBeUndefined();
      }
    },
  );
});

/* -------------------------------------------------------------------------- */
/* 4. The product rule (spec 009 §13 Q1, carried by TASK-121).                 */
/* -------------------------------------------------------------------------- */

describe("product slugs are shared, not translated (spec 009 §13 Q1)", () => {
  it("gives every locale the authored `en` slug unless it authors its own", () => {
    const source = authored("product", "en");
    for (const locale of LAUNCH_LOCALES) {
      const own = authored("product", locale);
      for (const sku of KEYS["product"]) {
        expect(
          slugFor("product", sku, locale as never),
          `${locale} ${sku}`,
        ).toBe(own.get(sku) ?? source.get(sku));
      }
    }
  });

  it("honours the per-locale overrides that exist today (en-gb authors two)", () => {
    const overrides = authored("product", "en-gb");
    expect(overrides.size).toBeGreaterThan(0);
    for (const [sku, slug] of overrides) {
      expect(slugFor("product", sku, "en-gb")).toBe(slug);
      expect(resolveSlug("en-gb", "product", slug)).toBe(sku);
    }
  });

  /**
   * The asymmetry spec 009 §13 Q1 exists to create, stated as a property rather than as today's
   * numbers: a product has a URL in **every** locale, while a category has one only where the
   * locale authors it. TASK-106's `de`/`pl` slugs change the right-hand count and this stays true.
   */
  it.each(LAUNCH_LOCALES)(
    "gives %s every product slug, and exactly the category slugs it authors",
    (locale) => {
      expect(effective("product", locale).size).toBe(PRODUCTS.length);
      const own = authored("category", locale);
      const inherited =
        locale === "en-gb"
          ? authored("category", "en")
          : new Map<string, string>();
      expect(effective("category", locale).size).toBe(
        new Set([...own.keys(), ...inherited.keys()]).size,
      );
    },
  );
});

/* -------------------------------------------------------------------------- */
/* 5. One slug per entity across the two registries that hold one.             */
/* -------------------------------------------------------------------------- */

describe("the home tiles and the copy corpus cannot disagree about a URL", () => {
  /**
   * `src/config/occasions.ts` carries per-locale slugs for the six home tiles (spec 004), and the
   * copy corpus carries the catalogue's. Where both have one they must be the same string, or the
   * home tile would link to a URL the route does not serve. TASK-106 authors the `de`/`pl`
   * catalogue slugs and must carry these six across verbatim.
   */
  it.each(LAUNCH_LOCALES)(
    "agrees in %s wherever both name a slug",
    (locale) => {
      for (const tile of OCCASION_TILES) {
        const fromCopy = slugFor(
          "occasion",
          tile.catalogueKey,
          locale as never,
        );
        if (fromCopy === undefined) continue;
        expect(occasionSlug(tile.id, locale), `${locale} ${tile.id}`).toBe(
          fromCopy,
        );
      }
    },
  );
});

/* -------------------------------------------------------------------------- */
/* 6. The boundary schemas (spec 008 §5.2, AC-1 routing half, AC-15).          */
/* -------------------------------------------------------------------------- */

describe("slugFor / resolveSlug at the boundary", () => {
  it("rejects an unknown kind and an unknown locale rather than guessing", () => {
    expect(() => slugFor("colour" as never, "roses", "en")).toThrow();
    expect(() => slugFor("category", "bouquet", "fr" as never)).toThrow();
    expect(() => resolveSlug("fr" as never, "category", "roses")).toThrow();
  });

  it("resolves no case-folded, padded or trailing-slash variant of a real slug", () => {
    const [key, slug] = [...effective("category", "en")][0]!;
    expect(resolveSlug("en", "category", slug)).toBe(key);
    for (const variant of [
      slug.toUpperCase(),
      `${slug}/`,
      ` ${slug}`,
      `${slug} `,
      `/${slug}`,
      "",
    ]) {
      expect(resolveSlug("en", "category", variant), variant).toBeUndefined();
    }
  });
});

describe("ListingParamsSchema (spec 008 §5.2)", () => {
  it("accepts each page type with exactly the segments spec 008 §2 gives it", () => {
    for (const params of [
      { locale: "en-gb", pageType: "countryShopRoot", country: "poland" },
      {
        locale: "en-gb",
        pageType: "countryCategory",
        country: "poland",
        entity: "roses",
      },
      {
        locale: "en-gb",
        pageType: "countryOccasion",
        country: "poland",
        entity: "womens-day",
      },
      { locale: "en-gb", pageType: "categoryHub", entity: "roses" },
      { locale: "en-gb", pageType: "occasionHub", entity: "mothers-day" },
      { locale: "en-gb", pageType: "occasionsIndex" },
    ]) {
      expect(
        ListingParamsSchema.safeParse(params).success,
        params.pageType,
      ).toBe(true);
    }
  });

  it("refuses a missing, extra, mis-cased or slash-bearing segment", () => {
    for (const params of [
      { locale: "en-gb", pageType: "countryShopRoot" },
      { locale: "en-gb", pageType: "categoryHub" },
      { locale: "en-gb", pageType: "occasionsIndex", entity: "mothers-day" },
      {
        locale: "en-gb",
        pageType: "categoryHub",
        country: "poland",
        entity: "roses",
      },
      { locale: "en-gb", pageType: "categoryHub", entity: "Roses" },
      { locale: "en-gb", pageType: "categoryHub", entity: "roses/" },
      { locale: "fr", pageType: "occasionsIndex" },
      { locale: "en-gb", pageType: "cityListing", entity: "roses" },
      { locale: "en-gb", pageType: "categoryHub", entity: "roses", page: 2 },
    ]) {
      expect(
        ListingParamsSchema.safeParse(params).success,
        JSON.stringify(params),
      ).toBe(false);
    }
  });
});

describe("ListingSearchParamsSchema (spec 008 §5.2, AC-15)", () => {
  const parse = (raw: Record<string, string | string[] | undefined>) =>
    ListingSearchParamsSchema.parse(raw);

  it("honours page and sort", () => {
    expect(parse({ page: "2", sort: "price-asc" })).toEqual({
      page: 2,
      sort: "price-asc",
      honoured: ["page", "sort"],
      ignored: [],
    });
  });

  it("defaults to the curation order and page 1", () => {
    expect(parse({})).toEqual({
      page: 1,
      sort: "default",
      honoured: [],
      ignored: [],
    });
  });

  it("neutralises an invalid value instead of failing the page", () => {
    for (const raw of [
      { page: "0" },
      { page: "-3" },
      { page: "1.5" },
      { page: "abc" },
      { page: "01" },
      { sort: "bestsellers" },
      { sort: "price-asc-desc" },
    ]) {
      const parsed = parse(raw);
      expect(parsed.page, JSON.stringify(raw)).toBe(1);
      expect(parsed.sort, JSON.stringify(raw)).toBe("default");
      expect(parsed.ignored, JSON.stringify(raw)).toEqual(Object.keys(raw));
    }
  });

  it("reports every facet-shaped parameter for resolveFacets() and honours none", () => {
    const parsed = parse({ colour: "red", price: "under-50", utm_source: "x" });
    expect(parsed).toEqual({
      page: 1,
      sort: "default",
      honoured: [],
      ignored: ["colour", "price", "utm_source"],
    });
  });

  it("takes the first value of a repeated parameter and never throws", () => {
    expect(parse({ sort: ["price-desc", "price-asc"] }).sort).toBe(
      "price-desc",
    );
    expect(parse({ page: ["3"] }).page).toBe(3);
  });
});
