/**
 * The existence manifest and "the database AND the manifest" (spec 012b §2.3, AC-5, AC-6;
 * TASK-295, TASK-296): `src/lib/existence.ts` (hash, public paths, the manifest, the running
 * manifest's seam) and `src/modules/catalog/existence.ts` (the publish diff), then the grids'
 * half: a product whose page the running build did not emit is in no listing grid, no search
 * result and no product page set until a publish, and without a manifest nothing changes.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  ExistenceManifestSchema,
  databaseOnly,
  existenceHashOf,
  existenceManifestOf,
  manifestAdmits,
  manifestInForce,
  publicPathOf,
  resetExistenceManifest,
  useExistenceManifest,
} from "../../src/lib/existence";
import {
  listingPages,
  listingView,
  listProductPages,
  productPageAdmitted,
  productPageExists,
} from "../../src/modules/catalog";
import {
  diffAgainst,
  isStructuralPath,
} from "../../src/modules/catalog/existence";
import { localePath } from "../../src/modules/i18n";
import { catalogSearchSource } from "../../src/modules/search/source";

/** Two corridor pages, spelled by the one builder (`/en/send-flowers-to/poland`, …). */
const CORRIDOR_EN = localePath("en", "destinations", "poland");
const CORRIDOR_DE = localePath("de", "destinations", "polen");

afterEach(() => {
  resetExistenceManifest();
});

/** A manifest of exactly `urls`, as the build writes it. */
function manifestOf(urls: readonly string[]) {
  return existenceManifestOf(urls, "2026-11-02T10:00:00.000000Z");
}

describe("existenceHashOf", () => {
  it("is the SHA-256 of the sorted, de-duplicated paths joined by newlines", () => {
    // printf '/a\n/b' | shasum -a 256
    const expected =
      "920e1136383360910a2165ba206599598de8a189ac35cf7666aaedb717000e76";
    expect(existenceHashOf(["/b", "/a"])).toBe(expected);
    expect(existenceHashOf(["/a", "/b", "/a"])).toBe(expected);
  });

  it("of no URL is the SHA-256 of the empty string", () => {
    expect(existenceHashOf([])).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("publicPathOf", () => {
  it("keeps a page of the [locale] tree as it is", () => {
    expect(publicPathOf("/en/destinations/poland")).toBe(
      "/en/destinations/poland",
    );
    expect(publicPathOf("/de")).toBe("/de");
  });

  it("maps the internal product route back to the product's public address", () => {
    expect(publicPathOf("/en/-product/poland/product/amber-hour")).toBe(
      "/en/poland/product/amber-hour",
    );
  });

  it("drops an internal product route of the wrong depth", () => {
    expect(publicPathOf("/en/-product/poland/product")).toBeUndefined();
    expect(
      publicPathOf("/en/-product/poland/product/amber-hour/extra"),
    ).toBeUndefined();
  });

  it("drops a path outside the [locale] tree and a rewrite target", () => {
    expect(publicPathOf("/api/health")).toBeUndefined();
    expect(publicPathOf("/xx/destinations")).toBeUndefined();
    expect(publicPathOf("/")).toBeUndefined();
    expect(publicPathOf("/en/_tier/amber")).toBeUndefined();
    expect(publicPathOf("/en/poland/%5Fdate")).toBeUndefined();
  });
});

describe("existenceManifestOf and its schema", () => {
  it("is the sorted, unique public paths, with dataAsOf and the hash of exactly that list", () => {
    const manifest = existenceManifestOf(
      [
        "/en/-product/poland/product/amber-hour",
        "/en/destinations/poland",
        "/api/health",
        "/en/destinations/poland",
      ],
      "2026-11-02T10:00:00.000000Z",
    );
    expect(manifest).toStrictEqual({
      version: 1,
      urls: ["/en/destinations/poland", "/en/poland/product/amber-hour"],
      dataAsOf: "2026-11-02T10:00:00.000000Z",
      existenceHash: existenceHashOf([
        "/en/destinations/poland",
        "/en/poland/product/amber-hour",
      ]),
    });
    expect(ExistenceManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("refuses a manifest whose hash is not its URL list's, and an unknown key", () => {
    const manifest = manifestOf(["/en/destinations/poland"]);
    expect(
      ExistenceManifestSchema.safeParse({
        ...manifest,
        urls: ["/en/destinations/germany"],
      }).success,
    ).toBe(false);
    expect(
      ExistenceManifestSchema.safeParse({ ...manifest, extra: true }).success,
    ).toBe(false);
  });

  it("accepts a build without a database (dataAsOf null)", () => {
    expect(
      ExistenceManifestSchema.safeParse(existenceManifestOf(["/en"], null))
        .success,
    ).toBe(true);
  });
});

describe("the running manifest", () => {
  it("without one, admits every path and is not in force", () => {
    useExistenceManifest(null);
    expect(manifestInForce()).toBe(false);
    expect(manifestAdmits("/en/anything/at/all")).toBe(true);
  });

  it("with one, admits exactly its URLs", () => {
    useExistenceManifest(manifestOf(["/en/destinations/poland"]));
    expect(manifestInForce()).toBe(true);
    expect(manifestAdmits("/en/destinations/poland")).toBe(true);
    expect(manifestAdmits("/en/destinations/germany")).toBe(false);
  });

  it("inside databaseOnly(), admits everything and is not in force, for that context only", async () => {
    useExistenceManifest(manifestOf(["/en/destinations/poland"]));
    const inside = await databaseOnly(() =>
      Promise.resolve([
        manifestInForce(),
        manifestAdmits("/en/destinations/germany"),
      ]),
    );
    expect(inside).toStrictEqual([false, true]);
    expect(manifestAdmits("/en/destinations/germany")).toBe(false);
  });
});

describe("isStructuralPath", () => {
  it("is true for a corridor page, a listing and a product page, false for the rest", () => {
    expect(isStructuralPath(CORRIDOR_EN)).toBe(true);
    expect(isStructuralPath(localePath("en", "shopCategory", "roses"))).toBe(
      true,
    );
    expect(isStructuralPath("/en/poland/product/amber-hour")).toBe(true);
    expect(isStructuralPath("/en")).toBe(false);
    expect(isStructuralPath(localePath("en", "destinations"))).toBe(false);
    expect(isStructuralPath("/api/health")).toBe(false);
  });
});

describe("diffAgainst (AC-6's list)", () => {
  const running = [
    CORRIDOR_DE,
    "/en",
    CORRIDOR_EN,
    "/en/poland/product/amber-hour",
  ].sort();

  it("removes a corridor page the database dropped", () => {
    const diff = diffAgainst(
      { urls: running },
      new Set([CORRIDOR_EN, "/en/poland/product/amber-hour"]),
    );
    expect(diff.removed).toStrictEqual([CORRIDOR_DE]);
    expect(diff.byLocale.map((row) => row.locale)).toStrictEqual(["de"]);
  });

  it("adds what the database has and the build lacks, removes only structural URLs the database dropped", () => {
    const next = new Set([
      CORRIDOR_DE,
      CORRIDOR_EN,
      "/en/poland/product/new-bouquet",
    ]);
    const diff = diffAgainst({ urls: running }, next);
    expect(diff.added).toStrictEqual(["/en/poland/product/new-bouquet"]);
    // `/en` is code, not data: absent from `next`, it is never removed.
    expect(diff.removed).toStrictEqual(["/en/poland/product/amber-hour"]);
    expect(diff.byLocale).toStrictEqual([
      {
        locale: "en",
        added: ["/en/poland/product/new-bouquet"],
        removed: ["/en/poland/product/amber-hour"],
      },
    ]);
    expect(diff.expectedHash).toBe(
      existenceHashOf([
        CORRIDOR_DE,
        "/en",
        CORRIDOR_EN,
        "/en/poland/product/new-bouquet",
      ]),
    );
  });

  it("is empty, with the running hash, when the database agrees with the build", () => {
    const diff = diffAgainst(
      { urls: running },
      new Set(running.filter((url) => url !== "/en")),
    );
    expect(diff.added).toStrictEqual([]);
    expect(diff.removed).toStrictEqual([]);
    expect(diff.byLocale).toStrictEqual([]);
    expect(diff.expectedHash).toBe(existenceHashOf(running));
  });
});

describe("AC-5, the grids' half: a product the build did not emit is in no grid", () => {
  const LOCALE = "en-gb";

  async function shopRoot() {
    const view = await listingView(
      { locale: LOCALE, pageType: "countryShopRoot", country: "poland" },
      { page: 1 },
    );
    if (view === undefined) throw new Error("no Poland shop root in en-gb");
    return view;
  }

  /** Every URL the build would emit for products and listings, minus `without`. */
  async function builtWithout(without: string): Promise<string[]> {
    const products = (await listProductPages()).map((page) => page.path);
    const listings = (await listingPages()).map((page) => page.path);
    expect(products).toContain(without);
    return [...products, ...listings].filter((url) => url !== without);
  }

  it("without a manifest, the first card's product is listed and admitted", async () => {
    const first = (await shopRoot()).items[0]?.productId;
    expect(first).toBeDefined();
    expect(productPageAdmitted(first ?? "", "PL", LOCALE)).toBe(true);
  });

  it("with a manifest that lacks its Poland page in en-gb, it leaves the grid, search and the product set", async () => {
    const before = await shopRoot();
    const sku = before.items[0]?.productId ?? "";
    const record = (await listProductPages(LOCALE)).find(
      (page) => page.sku === sku && page.countryIso === "PL",
    );
    if (record === undefined) throw new Error(`no en-gb PL page for ${sku}`);

    useExistenceManifest(manifestOf(await builtWithout(record.path)));

    expect(productPageAdmitted(sku, "PL", LOCALE)).toBe(false);
    const after = await shopRoot();
    expect(after.items.map((item) => item.productId)).not.toContain(sku);
    expect(
      (await listProductPages(LOCALE)).map((page) => page.path),
    ).not.toContain(record.path);
    expect(
      await productPageExists({ sku, countryIso: "PL", locale: LOCALE }),
    ).toBe(false);
    const results = await catalogSearchSource().products(LOCALE, "PL");
    expect(results.map((product) => product.sku)).not.toContain(sku);
    // Every other product of the first page stays.
    expect(after.items.map((item) => item.productId)).toEqual(
      expect.arrayContaining(
        before.items.slice(1).map((item) => item.productId),
      ),
    );
  });

  it("with the database-only scope, the same product is listed again (the next build's view)", async () => {
    const sku = (await shopRoot()).items[0]?.productId ?? "";
    const record = (await listProductPages(LOCALE)).find(
      (page) => page.sku === sku && page.countryIso === "PL",
    );
    if (record === undefined) throw new Error(`no en-gb PL page for ${sku}`);
    useExistenceManifest(manifestOf(await builtWithout(record.path)));
    const inside = await databaseOnly(async () =>
      (await shopRoot()).items.map((item) => item.productId),
    );
    expect(inside).toContain(sku);
  });
});
