/**
 * The product page's existence set, its prebuild list and its route resolution (spec 009 §2 "The
 * URL and its existence rule", §11, **AC-1**'s routing half, **AC-3**, **AC-4**; T-03, T-04;
 * §12 task 1; TASK-121).
 *
 * The tests are shaped as the rules spec 009 §2 states, and each of them has its failure side —
 * the value is asserted, never the set of values that would be reachable:
 *
 *  1. **One predicate answers "is this URL a page"** (AC-4). `productPageExists()` and
 *     `listProductPages()` are checked against each other over the **whole** space — every
 *     (locale, published destination, product) triple, 2 352 of them, which is the number spec
 *     009 §2 itself quotes — so an enumeration that drifted from the predicate by one page fails
 *     here rather than in a sitemap six tasks later.
 *  2. **Each term of the rule refuses on its own.** A fixture change to the price row, to the
 *     product's status and to the locale's slug each removes the page from the predicate, from
 *     the existence set, from the prebuild list **and** from `resolveLocalePath()` in the same
 *     assertion — which is what AC-4 means by "a fixture change moves all five together".
 *  3. **Prebuild is a performance choice, not an existence choice** (AC-3). The params list is
 *     exactly 24 per (locale, published destination) in spec 005's deterministic order, it is a
 *     subset of the existence set, and every URL *outside* it still resolves to the page — which
 *     is the property `dynamicParams = true` needs to be safe.
 *  4. **§13 Q1's shared ASCII slug is load-bearing**: `/de/polen/produkt/amber-hour` is a page on
 *     day one, with the German segment and the German country slug around the English product
 *     slug, and the round trip `resolveSlug(slugFor(sku))` holds for every product in every
 *     locale.
 *  5. **Everything else is a hard 404** (AC-1's routing half): an unknown slug, another locale's
 *     `product` segment, another locale's country slug, an uppercase variant, an unknown locale
 *     and the wrong number of segments. No redirect, no soft-404 (ADR-0006).
 *
 * The served half — status codes, the absent `Location` header, the trailing-slash 308 and the
 * step summary printed by a real build — is spec 009's e2e suite and TASK-127's route.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/** Per-test fixture overrides of spec 005's read API; `undefined` means "the real dataset". */
const reads: {
  unpriced?: string;
  inactive?: string;
} = {};
/** Per-test fixture override of the slug map: a (kind, key, locale) with no URL. */
const slugs: { hidden?: string } = {};

vi.mock("../../src/modules/catalog/read.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/catalog/read.ts")>();
  return {
    ...actual,
    hasActivePrice: async (sku: string, iso2: string) =>
      reads.unpriced === `${sku}|${iso2}`
        ? false
        : await actual.hasActivePrice(sku, iso2 as never),
    getProduct: async (sku: string) => {
      const product = await actual.getProduct(sku);
      if (product === null || reads.inactive !== sku) return product;
      return { ...product, status: "retired" as const };
    },
  };
});

vi.mock("../../src/modules/catalog/slugs.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/catalog/slugs.ts")>();
  const hidden = (kind: string, key: string, locale: string) =>
    slugs.hidden === `${kind}|${key}|${locale}`;
  return {
    ...actual,
    slugFor: (kind: string, key: string, locale: string) =>
      hidden(kind, key, locale)
        ? undefined
        : actual.slugFor(kind as never, key, locale as never),
    hasSlug: (kind: string, key: string, locale: string) =>
      hidden(kind, key, locale)
        ? false
        : actual.hasSlug(kind as never, key, locale as never),
  };
});

const {
  listProductPages,
  productExistenceCounts,
  productExistenceSummaryMarkdown,
  productPageExists,
  productPrebuildPages,
  writeProductExistenceSummary,
} = await import("../../src/modules/catalog/product.ts");
const { localeProductParams, resolveLocalePath } =
  await import("../../src/modules/catalog/routes.ts");
const { ProductPageIdentitySchema, ProductParamsSchema } =
  await import("../../src/modules/catalog/schemas.ts");
const { listingLocales, publishedCountries } =
  await import("../../src/modules/catalog/listing.ts");
const { listProducts, topProductsForPrebuild } =
  await import("../../src/modules/catalog/read.ts");
const { resolveSlug, slugFor } =
  await import("../../src/modules/catalog/slugs.ts");
const { corridorSlug } = await import("../../src/modules/geo/index.ts");
const { localePath, productPath } =
  await import("../../src/modules/i18n/index.ts");

/** The four launch locales of the Phase 0 deployment — the space every count below is over. */
const LOCALES = ["en", "en-gb", "de", "pl"] as const;
type Locale = (typeof LOCALES)[number];

/** Poland: the one `live` destination, and the corridor whose guide is published. */
const PL = "PL" as const;
/** One product of the committed dataset, and the slug §13 Q1 shares across all four locales. */
const SKU = "FO-BQ-001";
const SLUG = "amber-hour";

const PRODUCTS = await listProducts({});
const COUNTRIES = publishedCountries();
/** Spec 009 §2's own arithmetic: "84 products × 7 published countries × 4 locales is 2 352". */
const EXPECTED_PAGES = 84 * 7 * 4;
/** §2's prebuild default, N = 24, per (locale, published destination). */
const EXPECTED_PREBUILT = 24 * 7 * 4;

/** The URL of one record, as the three path segments a route file hands the resolver. */
const segmentsOf = (path: string): [string, string, string] => {
  const [, , country = "", product = "", slug = ""] = path.split("/");
  return [country, product, slug];
};

const urlOf = (page: { locale: string; path: string }) =>
  `${page.locale}:${page.path}`;

afterEach(() => {
  delete reads.unpriced;
  delete reads.inactive;
  delete slugs.hidden;
});

describe("the space the rule is quantified over (spec 009 §2)", () => {
  it("is the four launch locales, the seven published destinations and 84 products", () => {
    expect([...listingLocales()]).toEqual([...LOCALES]);
    expect([...COUNTRIES]).toEqual(["PL", "DE", "FR", "ES", "IT", "RO", "NL"]);
    expect(PRODUCTS.length).toBe(84);
  });
});

describe("`productPageExists()` is the single existence answer (AC-4, T-04)", () => {
  it("answers `true` for exactly the pages `listProductPages()` enumerates, over the whole space", async () => {
    const pages = await listProductPages();
    const enumerated = new Set(
      pages.map((page) => `${page.locale}|${page.countryIso}|${page.sku}`),
    );

    let agreed = 0;
    for (const locale of LOCALES) {
      for (const countryIso of COUNTRIES) {
        for (const product of PRODUCTS) {
          const key = `${locale}|${countryIso}|${product.sku}`;
          expect(
            await productPageExists({ locale, countryIso, sku: product.sku }),
            key,
          ).toBe(enumerated.has(key));
          agreed += 1;
        }
      }
    }

    expect(agreed).toBe(EXPECTED_PAGES);
    expect(pages.length).toBe(EXPECTED_PAGES);
  });

  it("holds no duplicate URL and builds every path through `productPath()`", async () => {
    const pages = await listProductPages();
    expect(new Set(pages.map(urlOf)).size).toBe(pages.length);
    for (const page of pages) {
      expect(page.path).toBe(
        productPath(page.locale, page.countrySlug, page.slug),
      );
    }
  });

  it("refuses an unknown product, an unpublished locale and a country we do not serve", async () => {
    // A well-formed SKU the catalogue does not have: a miss, because the argument came off a URL.
    expect(
      await productPageExists({
        locale: "en",
        countryIso: PL,
        sku: "FO-BQ-999",
      }),
    ).toBe(false);
    // `en-xa` is a pseudo-locale the Phase 0 deployment does not route.
    expect(
      await productPageExists({ locale: "en-XA", countryIso: PL, sku: SKU }),
    ).toBe(false);
    expect(
      await productPageExists({ locale: "en", countryIso: "US", sku: SKU }),
    ).toBe(false);
    // The control: the same triple with all three terms satisfied.
    expect(
      await productPageExists({ locale: "en", countryIso: PL, sku: SKU }),
    ).toBe(true);
  });
});

describe("a fixture change moves the predicate, the set, the prebuild and the route together (AC-4, T-04)", () => {
  /** Every consumer this task owns, asked about the same URL in the same breath. */
  const answersFor = async (locale: Locale, sku: string, slug: string) => {
    const countrySlug = corridorSlug(PL, locale);
    const segment = localePath(locale, "product").split("/")[2] ?? "";
    const path = `/${locale}/${countrySlug}/${segment}/${slug}`;
    const [country, product, leaf] = segmentsOf(path);
    return {
      predicate: await productPageExists({
        locale,
        countryIso: PL,
        sku,
      }),
      inSet: (await listProductPages(locale)).some(
        (page) => page.countryIso === PL && page.sku === sku,
      ),
      prebuilt: (await productPrebuildPages(locale)).some(
        (page) => page.countryIso === PL && page.sku === sku,
      ),
      params: (await localeProductParams()).some(
        (row) =>
          row.locale === locale &&
          row.segment === countrySlug &&
          row.grandchild === slug,
      ),
      resolution: (await resolveLocalePath(locale, [country, product, leaf]))
        .kind,
    };
  };

  it("has all five answering yes on the committed fixture", async () => {
    expect(await answersFor("en", SKU, SLUG)).toEqual({
      predicate: true,
      inSet: true,
      prebuilt: true,
      params: true,
      resolution: "product",
    });
  });

  it("drops the page from all five when the destination's price row goes", async () => {
    reads.unpriced = `${SKU}|${PL}`;
    expect(await answersFor("en", SKU, SLUG)).toEqual({
      predicate: false,
      inSet: false,
      prebuilt: false,
      params: false,
      resolution: "notFound",
    });
  });

  it("drops the page from all five when the product stops being active", async () => {
    reads.inactive = SKU;
    expect(await answersFor("en", SKU, SLUG)).toEqual({
      predicate: false,
      inSet: false,
      prebuilt: false,
      params: false,
      resolution: "notFound",
    });
  });

  it("drops the page in the one locale whose slug goes, and leaves the others alone", async () => {
    slugs.hidden = `product|${SKU}|de`;
    expect(await answersFor("de", SKU, SLUG)).toEqual({
      predicate: false,
      inSet: false,
      prebuilt: false,
      params: false,
      resolution: "notFound",
    });
    expect(await answersFor("en", SKU, SLUG)).toEqual({
      predicate: true,
      inSet: true,
      prebuilt: true,
      params: true,
      resolution: "product",
    });
  });

  it("keeps the price row's absence to the destination it was removed from", async () => {
    reads.unpriced = `${SKU}|${PL}`;
    expect(
      await productPageExists({ locale: "en", countryIso: "DE", sku: SKU }),
    ).toBe(true);
  });
});

describe("the prebuild list (AC-3, T-03)", () => {
  it("is 24 per (locale, published destination) and nothing else", async () => {
    const params = await localeProductParams();
    expect(params.length).toBe(EXPECTED_PREBUILT);

    const perPair = new Map<string, number>();
    for (const page of await productPrebuildPages()) {
      const key = `${page.locale}|${page.countryIso}`;
      perPair.set(key, (perPair.get(key) ?? 0) + 1);
    }
    expect(perPair.size).toBe(LOCALES.length * COUNTRIES.length);
    for (const [pair, count] of perPair) {
      expect(count, pair).toBe(24);
    }
  });

  it("is spec 005's deterministic order, product for product", async () => {
    for (const locale of LOCALES) {
      for (const countryIso of COUNTRIES) {
        const expected = (
          await topProductsForPrebuild(countryIso, locale, 24)
        ).map((product) => product.sku);
        const actual = (await productPrebuildPages(locale))
          .filter((page) => page.countryIso === countryIso)
          .map((page) => page.sku);
        expect(actual, `${locale}/${countryIso}`).toEqual(expected);
      }
    }
  });

  it("carries each locale's own `product` segment and country slug", async () => {
    const params = await localeProductParams();
    const segments: Record<string, string> = Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        localePath(locale, "product").split("/")[2] ?? "",
      ]),
    );
    expect(Object.values(segments)).toEqual([
      "product",
      "product",
      "produkt",
      "produkt",
    ]);
    for (const row of params) {
      expect(row.child, JSON.stringify(row)).toBe(segments[row.locale]);
    }
    expect(
      params.filter((row) => row.locale === "de" && row.segment === "polen")
        .length,
    ).toBe(24);
  });

  it("is a strict subset of the existence set, and the rest are served on demand", async () => {
    const pages = await listProductPages();
    const existing = new Set(pages.map(urlOf));
    const prebuilt = await productPrebuildPages();
    for (const page of prebuilt) {
      expect(existing.has(urlOf(page)), urlOf(page)).toBe(true);
    }
    // `dynamicParams = true` is only safe because the 1 680 URLs the build does **not** emit are
    // still pages: the union of prebuilt and on-demand is the existence set exactly (AC-3).
    expect(pages.length - prebuilt.length).toBe(
      EXPECTED_PAGES - EXPECTED_PREBUILT,
    );
    const onDemand = pages.filter(
      (page) => !new Set(prebuilt.map(urlOf)).has(urlOf(page)),
    );
    expect(onDemand.length).toBe(EXPECTED_PAGES - EXPECTED_PREBUILT);
  });
});

describe("every URL of the existence set resolves to its own page (AC-1, AC-3)", () => {
  it("round-trips the whole set through `resolveLocalePath()`", async () => {
    const pages = await listProductPages();
    let resolved = 0;
    for (const page of pages) {
      const [country, product, slug] = segmentsOf(page.path);
      const match = await resolveLocalePath(page.locale, [
        country,
        product,
        slug,
      ]);
      expect(match.kind, page.path).toBe("product");
      if (match.kind !== "product") continue;
      expect(match.sku, page.path).toBe(page.sku);
      expect(match.iso2, page.path).toBe(page.countryIso);
      expect(match.productSlug, page.path).toBe(page.slug);
      expect(match.countrySlug, page.path).toBe(page.countrySlug);
      resolved += 1;
    }
    expect(resolved).toBe(EXPECTED_PAGES);
  });

  it("round-trips every product slug in every locale (§13 Q1)", () => {
    for (const locale of LOCALES) {
      const slugsSeen = new Set<string>();
      for (const product of PRODUCTS) {
        const slug = slugFor("product", product.sku, locale);
        expect(slug, `${product.sku}/${locale}`).toBeDefined();
        expect(resolveSlug(locale, "product", slug ?? ""), slug).toBe(
          product.sku,
        );
        slugsSeen.add(slug ?? "");
      }
      expect(slugsSeen.size, locale).toBe(84);
    }
  });

  it("serves the shared ASCII slug under the German URL shape (§13 Q1)", async () => {
    const match = await resolveLocalePath("de", ["polen", "produkt", SLUG]);
    expect(match).toEqual({
      kind: "product",
      locale: "de",
      iso2: PL,
      countrySlug: "polen",
      sku: SKU,
      productSlug: SLUG,
    });
  });

  it("collides with no country slug, no path segment and no other namespace", () => {
    for (const locale of LOCALES) {
      const productSlugs = new Set(
        PRODUCTS.map((product) => slugFor("product", product.sku, locale)),
      );
      for (const iso2 of COUNTRIES) {
        expect(productSlugs.has(corridorSlug(iso2, locale)), locale).toBe(
          false,
        );
      }
      for (const pageType of [
        "destinations",
        "shopCategory",
        "occasions",
        "product",
      ] as const) {
        const segment = localePath(locale, pageType).split("/")[2] ?? "";
        expect(productSlugs.has(segment), `${locale}/${segment}`).toBe(false);
      }
      for (const slug of productSlugs) {
        expect(
          resolveSlug(locale, "category", slug ?? ""),
          `${locale}/${String(slug)}`,
        ).toBeUndefined();
        expect(
          resolveSlug(locale, "occasion", slug ?? ""),
          `${locale}/${String(slug)}`,
        ).toBeUndefined();
      }
    }
  });
});

describe("everything else is a hard 404 (AC-1's routing half, T-01's unit half)", () => {
  const cases: readonly (readonly [string, string, readonly string[]])[] = [
    ["an unknown product slug", "en", ["poland", "product", "no-such-thing"]],
    ["another locale's product segment", "de", ["polen", "product", SLUG]],
    ["another locale's country slug", "de", ["poland", "produkt", SLUG]],
    ["an uppercase product slug", "en", ["poland", "product", "Amber-Hour"]],
    ["an uppercase country slug", "en", ["Poland", "product", SLUG]],
    ["an uppercase segment", "en", ["poland", "Product", SLUG]],
    ["an unknown locale", "fr", ["france", "product", SLUG]],
    ["an unpublished destination", "en", ["japan", "product", SLUG]],
    ["a slug with a slash in it", "en", ["poland", "product", "amber/hour"]],
    ["too few segments", "en", ["poland", "product"]],
    ["too many segments", "en", ["poland", "product", SLUG, "extra"]],
  ];

  for (const [name, locale, segments] of cases) {
    it(`404s on ${name}`, async () => {
      expect(await resolveLocalePath(locale, segments)).toEqual({
        kind: "notFound",
      });
    });
  }

  it("404s on a product with no price in **that** destination", async () => {
    reads.unpriced = `${SKU}|DE`;
    expect(
      (await resolveLocalePath("en", ["germany", "product", SLUG])).kind,
    ).toBe("notFound");
    expect(
      (await resolveLocalePath("en", ["poland", "product", SLUG])).kind,
    ).toBe("product");
  });
});

describe("`ProductParamsSchema` is the boundary a path segment arrives at (§5.2)", () => {
  it("accepts the three segments of a real URL", () => {
    expect(
      ProductParamsSchema.parse({
        locale: "en",
        country: "poland",
        slug: SLUG,
      }),
    ).toEqual({ locale: "en", country: "poland", slug: SLUG });
  });

  it("refuses an unknown locale, an uppercase segment, a slash and a fourth parameter", () => {
    for (const params of [
      { locale: "fr", country: "poland", slug: SLUG },
      { locale: "en", country: "Poland", slug: SLUG },
      { locale: "en", country: "poland", slug: "Amber-Hour" },
      { locale: "en", country: "poland", slug: "amber/hour" },
      { locale: "en", country: "poland", slug: "" },
      { locale: "en", country: "poland", slug: SLUG, sort: "price-asc" },
      { locale: "en", country: "poland" },
    ]) {
      expect(
        ProductParamsSchema.safeParse(params).success,
        JSON.stringify(params),
      ).toBe(false);
    }
  });

  it("names the page by (locale, destination, SKU) and refuses anything else", () => {
    expect(
      ProductPageIdentitySchema.parse({
        locale: "en",
        countryIso: PL,
        sku: SKU,
      }),
    ).toEqual({ locale: "en", countryIso: PL, sku: SKU });
    for (const identity of [
      { locale: "en", countryIso: "POL", sku: SKU },
      { locale: "en", countryIso: PL, sku: "amber-hour" },
      { locale: "en", countryIso: PL, sku: SKU, tier: "m" },
    ]) {
      expect(
        ProductPageIdentitySchema.safeParse(identity).success,
        JSON.stringify(identity),
      ).toBe(false);
    }
  });
});

describe("the per-locale counts CI prints (§11)", () => {
  it("counts the pages that exist, the ones prebuilt and the honest zero", async () => {
    expect(await productExistenceCounts()).toEqual([
      {
        locale: "en",
        exists: 588,
        prebuilt: 168,
        indexable: 0,
        withoutDescription: 0,
      },
      {
        locale: "en-gb",
        exists: 588,
        prebuilt: 168,
        indexable: 0,
        withoutDescription: 0,
      },
      {
        locale: "de",
        exists: 588,
        prebuilt: 168,
        indexable: 0,
        withoutDescription: 84,
      },
      {
        locale: "pl",
        exists: 588,
        prebuilt: 168,
        indexable: 0,
        withoutDescription: 84,
      },
    ]);
  });

  it("renders one Markdown table, one row per locale", () => {
    const markdown = productExistenceSummaryMarkdown([
      {
        locale: "en",
        exists: 588,
        prebuilt: 168,
        indexable: 0,
        withoutDescription: 0,
      },
    ]);
    expect(markdown).toContain("| Locale | PDPs | Prebuilt | Indexable |");
    expect(markdown).toContain("| en | 588 | 168 | 0 | 0 |");
    expect(markdown).not.toContain("<");
  });

  it("appends to `$GITHUB_STEP_SUMMARY` when a runner set one, and prints otherwise", async () => {
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const file = join(mkdtempSync(join(tmpdir(), "fo-pdp-")), "summary.md");
    const written = await writeProductExistenceSummary({
      GITHUB_STEP_SUMMARY: file,
    });
    expect(readFileSync(file, "utf8")).toBe(`${written}\n`);

    const captured: string[] = [];
    const printed = await writeProductExistenceSummary({}, (text) =>
      captured.push(text),
    );
    expect(captured).toEqual([`${printed}\n`]);
  });
});
