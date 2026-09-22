/**
 * An unpublished destination has no product page (spec 009 §2 "A PDP exists iff the country is
 * published …", **AC-3**, **AC-4**; T-03, T-04; TASK-121).
 *
 * All seven registry rows are published today, so the rule has to be observable *before* a
 * destination is ever turned off: this file mocks the registry, as
 * `tests/unit/catalog-listing-country.test.ts` does one page type up, and for the same reason —
 * a registry mock must be installed before `countries.ts` is first imported by anything in the
 * graph, so it needs its own module graph and therefore its own file.
 *
 * Depublishing is a **data flip** (`CLAUDE.md`): the 588 Dutch URLs leave the existence set, the
 * prebuild list and the router together, with no edit under `src/app/` and no branch naming a
 * country anywhere.
 */
import { describe, expect, it, vi } from "vitest";

/** The Netherlands: a `demo` destination whose guide the founder has published. */
const OFF = "NL";
/** One product of the committed dataset, and §13 Q1's shared ASCII slug for it. */
const SKU = "FO-BQ-001";
const SLUG = "amber-hour";

vi.mock("../../src/config/countries.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/config/countries.ts")>();
  return {
    ...actual,
    isGuidePublished: (iso2: string) =>
      iso2 === OFF ? false : actual.isGuidePublished(iso2 as never),
    countryConfig: (iso2: string) =>
      iso2 === OFF
        ? { ...actual.countryConfig(iso2 as never), status: "disabled" }
        : actual.countryConfig(iso2 as never),
  };
});

const { listProductPages, productPageExists, productPrebuildPages } =
  await import("../../src/modules/catalog/product.ts");
const { localeProductParams, resolveLocalePath } =
  await import("../../src/modules/catalog/routes.ts");

describe("an unpublished destination has no product page (§2, AC-4)", () => {
  it("answers `false` for every locale, while a published destination still answers `true`", async () => {
    for (const locale of ["en", "en-gb", "de", "pl"] as const) {
      expect(
        await productPageExists({ locale, countryIso: OFF, sku: SKU }),
        locale,
      ).toBe(false);
    }
    expect(
      await productPageExists({ locale: "en", countryIso: "PL", sku: SKU }),
    ).toBe(true);
  });

  it("emits none of its 588 URLs in the existence set or the prebuild list", async () => {
    const pages = await listProductPages();
    expect(pages.filter((page) => page.countryIso === OFF)).toHaveLength(0);
    // The other six destinations are untouched: 84 products × 6 × four locales.
    expect(pages.length).toBe(84 * 6 * 4);

    const prebuilt = await productPrebuildPages();
    expect(prebuilt.filter((page) => page.countryIso === OFF)).toHaveLength(0);
    expect(prebuilt.length).toBe(24 * 6 * 4);
    expect(await localeProductParams()).toHaveLength(24 * 6 * 4);
  });

  it("404s its URL rather than serving a page a florist cannot reach (AC-1)", async () => {
    expect(
      await resolveLocalePath("en", ["netherlands", "product", SLUG]),
    ).toEqual({ kind: "notFound" });
    expect(
      (await resolveLocalePath("en", ["poland", "product", SLUG])).kind,
    ).toBe("product");
  });
});
