/**
 * The chooser's paths (spec 004 §14 A-founder-2026-10-24a item 3; **T-83**'s unit half, the accept
 * and reject table of AC-77; the explicit scope of TASK-381 that TASK-383 and TASK-385 build on).
 *
 * `parseChooserNext()` accepts each of item 3's six shapes in the locale's own segments and
 * rejects everything AC-77 lists (a scheme, `//`, a backslash, an encoded slash, another locale's
 * segment, an unknown shape, a 257-character path), each falling back to the shop root.
 * `chooserPath()` builds the chooser's URL and the path form; `countryVersionOf()` maps a `next`
 * to that country's page. Every case asserts the one value.
 *
 * The not-available branch needs a product whose page does not exist in a shop country, and the
 * committed catalogue prices all 84 products everywhere; `productPageExists` is wrapped so one
 * case can switch one (product, country) pair off, and every other case calls through.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const off = { sku: "", iso2: "" };

vi.mock("../../src/modules/catalog/product.ts", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/modules/catalog/product.ts")
    >();
  return {
    ...actual,
    productPageExists: async (identity: {
      sku: string;
      countryIso: string;
    }): Promise<boolean> =>
      identity.sku === off.sku && identity.countryIso === off.iso2
        ? false
        : actual.productPageExists(identity),
  };
});

const {
  chooseSegment,
  chooserNextPath,
  chooserPath,
  countryVersionOf,
  parseChooserNext,
  parseChooserPath,
} = await import("../../src/modules/catalog");

afterEach(() => {
  off.sku = "";
  off.iso2 = "";
});

describe("chooseSegment: one per locale, from locales.data.ts", () => {
  it.each([
    ["en", "choose-country"],
    ["en-gb", "choose-country"],
    ["de", "land-waehlen"],
    ["pl", "wybierz-kraj"],
  ] as const)("%s → %s", (locale, segment) => {
    expect(chooseSegment(locale)).toBe(segment);
  });
});

describe("T-83: parseChooserNext accepts item 3's six shapes", () => {
  it.each([
    ["en", "", { kind: "home" }],
    ["en", "flowers/roses", { kind: "category", key: "roses" }],
    ["en", "flowers/thank-you-flowers", { kind: "category", key: "thank_you" }],
    ["en", "occasions/love-and-romance", { kind: "occasion", key: "romance" }],
    ["en", "product/vistula-red", { kind: "product", sku: "FO-BQ-002" }],
    ["en", "price/low", { kind: "price", band: "low" }],
    ["en", "price/mid", { kind: "price", band: "mid" }],
    ["en", "price/high", { kind: "price", band: "high" }],
    ["en", "search", { kind: "search" }],
    ["en-gb", "product/baltic-dawn", { kind: "product", sku: "FO-BQ-003" }],
    ["de", "blumen/blumenstraeusse", { kind: "category", key: "bouquet" }],
  ] as const)("%s %s", (locale, next, expected) => {
    expect(parseChooserNext(locale, next)).toEqual({ locale, ...expected });
  });

  it("accepts the route's segments as well as a string", () => {
    expect(parseChooserNext("en", ["product", "amber-hour"])).toEqual({
      locale: "en",
      kind: "product",
      sku: "FO-BQ-001",
    });
    expect(parseChooserNext("en", [])).toEqual({ locale: "en", kind: "home" });
  });

  it("accepts exactly 256 characters and no more (the length is checked before the shape)", () => {
    // 256 characters of a valid-looking but unknown slug still fails on the slug, so the
    // boundary is pinned by the string the length test alone sees.
    const longest = `flowers/${"a".repeat(248)}`;
    expect(longest).toHaveLength(256);
    const tooLong = `${longest}a`;
    expect(tooLong).toHaveLength(257);
    expect(parseChooserNext("en", tooLong)).toEqual({
      locale: "en",
      kind: "home",
    });
  });
});

describe("T-83: parseChooserNext rejects, each falling back to the shop root", () => {
  it.each([
    ["a scheme", "https://x.test"],
    ["a protocol-relative URL", "//x.test"],
    ["a backslash", "\\x"],
    ["an encoded slash", "%2F%2Fx"],
    ["an encoded slash inside a segment", "product%2Fvistula-red"],
    ["another locale's segment (de's blumen in en)", "blumen/rosen"],
    ["another locale's product segment", "produkt/vistula-red"],
    ["an unknown shape", "basket/vistula-red"],
    ["an unknown product slug", "product/no-such-bouquet"],
    ["an unknown band", "price/cheapest"],
    ["a band with nothing after price", "price"],
    ["a third segment", "product/vistula-red/extra"],
    ["a leading slash", "/product/vistula-red"],
    ["a trailing slash", "product/vistula-red/"],
    ["an uppercase letter", "product/Vistula-red"],
    ["a dot segment", "../admin"],
    ["a query string", "product/vistula-red?x=1"],
    ["an email-shaped next", "search/ann@example.com"],
    ["a 257-character path", `product/${"a".repeat(249)}`],
  ])("%s", (_label, next) => {
    expect(parseChooserNext("en", next)).toEqual({
      locale: "en",
      kind: "home",
    });
  });

  it("rejects decoded route segments that smuggle an empty segment", () => {
    expect(parseChooserNext("en", ["", "", "x.test"])).toEqual({
      locale: "en",
      kind: "home",
    });
    expect(parseChooserNext("en", ["//x.test"])).toEqual({
      locale: "en",
      kind: "home",
    });
  });

  it("rejects en's segment on de and pl", () => {
    expect(parseChooserNext("de", "flowers/roses")).toEqual({
      locale: "de",
      kind: "home",
    });
    expect(parseChooserNext("pl", "product/vistula-red")).toEqual({
      locale: "pl",
      kind: "home",
    });
  });
});

describe("parseChooserPath: the path form's country", () => {
  it("reads a registry country's code as the choice", () => {
    expect(parseChooserPath("en", ["pl", "product", "vistula-red"])).toEqual({
      iso2: "PL",
      next: { locale: "en", kind: "product", sku: "FO-BQ-002" },
    });
    expect(parseChooserPath("en", ["de"])).toEqual({
      iso2: "DE",
      next: { locale: "en", kind: "home" },
    });
  });

  it("leaves a non-registry two-letter segment inside next (and so falls back)", () => {
    expect(parseChooserPath("en", ["zz", "search"])).toEqual({
      next: { locale: "en", kind: "home" },
    });
    expect(parseChooserPath("en", ["search"])).toEqual({
      next: { locale: "en", kind: "search" },
    });
  });
});

describe("chooserPath and chooserNextPath", () => {
  it("builds /{locale}/{chooseSegment}/{next}, never with a query string", () => {
    expect(chooserPath("en", "product/vistula-red")).toBe(
      "/en/choose-country/product/vistula-red",
    );
    expect(chooserPath("en-gb", "")).toBe("/en-gb/choose-country");
    expect(chooserPath("de", "blumen/blumenstraeusse")).toBe(
      "/de/land-waehlen/blumen/blumenstraeusse",
    );
    expect(chooserPath("pl", "price/mid")).toBe("/pl/wybierz-kraj/price/mid");
  });

  it("builds the path form with the lowercased code", () => {
    expect(chooserPath("en", "product/vistula-red", "PL")).toBe(
      "/en/choose-country/pl/product/vistula-red",
    );
    expect(chooserPath("en", "", "FR")).toBe("/en/choose-country/fr");
  });

  it("round-trips a parsed next", () => {
    for (const next of [
      "",
      "flowers/roses",
      "occasions/birthday",
      "product/amber-hour",
      "price/high",
      "search",
    ]) {
      expect(chooserNextPath(parseChooserNext("en", next))).toBe(next);
    }
  });

  it("refuses to build a link to a next that is not one of the shapes", () => {
    expect(() => chooserPath("en", "//x.test")).toThrow(/not a chooser/u);
    expect(() => chooserPath("en", "product/no-such-bouquet")).toThrow(
      /not a chooser/u,
    );
    expect(() => chooserPath("de", { locale: "en", kind: "home" })).toThrow(
      /another locale/u,
    );
  });
});

describe("countryVersionOf: that country's version of next (AC-78's 303 target)", () => {
  it("the home is the shop root", async () => {
    expect(await countryVersionOf(parseChooserNext("en", ""), "PL")).toEqual({
      kind: "page",
      path: "/en/poland/flowers",
    });
  });

  it("a category hub is the country category of the same key", async () => {
    expect(
      await countryVersionOf(parseChooserNext("en", "flowers/roses"), "DE"),
    ).toEqual({ kind: "page", path: "/en/germany/flowers/roses" });
  });

  it("a dated occasion hub is the country occasion of the same key", async () => {
    expect(
      await countryVersionOf(
        parseChooserNext("en", "occasions/mothers-day"),
        "PL",
      ),
    ).toEqual({ kind: "page", path: "/en/poland/occasions/mothers-day" });
  });

  it("an evergreen occasion hub lands where the hub's own row links: the same-key category", async () => {
    expect(
      await countryVersionOf(
        parseChooserNext("en", "occasions/birthday"),
        "FR",
      ),
    ).toEqual({ kind: "page", path: "/en/france/flowers/birthday-flowers" });
  });

  it("an occasion the country does not keep falls back to the shop root", async () => {
    // Sant Jordi is Catalan: Poland does not observe it, so it has no country occasion there.
    const next = parseChooserNext("en", "occasions/sant-jordi");
    expect(next).toEqual({ locale: "en", kind: "occasion", key: "sant_jordi" });
    expect(await countryVersionOf(next, "PL")).toEqual({
      kind: "page",
      path: "/en/poland/flowers",
    });
  });

  it("a product is its page in the country", async () => {
    expect(
      await countryVersionOf(
        parseChooserNext("en", "product/vistula-red"),
        "PL",
      ),
    ).toEqual({ kind: "page", path: "/en/poland/product/vistula-red" });
  });

  it("a product not sold there is the not-available page (the path form), never a 404", async () => {
    off.sku = "FO-BQ-002";
    off.iso2 = "RO";
    expect(
      await countryVersionOf(
        parseChooserNext("en", "product/vistula-red"),
        "RO",
      ),
    ).toEqual({
      kind: "unavailable",
      sku: "FO-BQ-002",
      path: "/en/choose-country/ro/product/vistula-red",
    });
  });

  it("a band is the shop root with ?price={band}", async () => {
    expect(
      await countryVersionOf(parseChooserNext("en", "price/mid"), "IT"),
    ).toEqual({ kind: "page", path: "/en/italy/flowers?price=mid" });
  });

  it("search is the shop root until spec 045 publishes its results page", async () => {
    expect(
      await countryVersionOf(parseChooserNext("en", "search"), "ES"),
    ).toEqual({ kind: "page", path: "/en/spain/flowers" });
  });

  it("speaks the locale of next: de's shop root is in German", async () => {
    expect(await countryVersionOf(parseChooserNext("de", ""), "PL")).toEqual({
      kind: "page",
      path: "/de/polen/blumen",
    });
  });
});
