/**
 * The product page's cache policy and its tags in the tag → URL map (spec 009 §5.4, AC-24, §14 A10
 * "Cache policy per picker state"; memo E-2; T-24's unit half; TASK-128).
 *
 *  - `productCachePolicy()` is a pure function of the picker state: `unavailable` and `preview`
 *    get `revalidate` 3600 and §5.4's four tags; `live` gets 300 and the same tags plus
 *    `cutoff:{iso2}`. One value per state, asserted whole.
 *  - The product route's `revalidate` literal is that policy's Phase 0 answer.
 *  - `urlsForTag()` resolves `product:{sku}`, `catalog:{iso2}:{locale}` and `cutoff:{iso2}` to
 *    exactly the documents that declare them, from the catalogue's own existence sets: never a
 *    hand-written list, never another destination's or locale's page.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LIVE_PRODUCT_REVALIDATE_SECONDS,
  PRODUCT_REVALIDATE_SECONDS,
  cutoffCacheTag,
  localeCatalogCacheTag,
  productCachePolicy,
  urlsForTag,
} from "../../src/lib/cache";
import { listProductPages, listingPages } from "../../src/modules/catalog";
import { pickerState } from "../../src/modules/geo";
import { withActivePartnersProvider } from "../../src/modules/geo/partners.ts";

const BASE = "https://flowersoverseas.com";
const AMBER = "FO-BQ-001";

const absolute = (paths: readonly string[]): string[] =>
  paths.map((path) => `${BASE}${path}`);

describe("`productCachePolicy()`: one answer per picker state (A10)", () => {
  const page = { countryIso: "PL", locale: "en", sku: AMBER } as const;

  it("gives `unavailable` and `preview` the hour and §5.4's four tags", () => {
    for (const state of ["unavailable", "preview"] as const) {
      expect(productCachePolicy({ ...page, state }), state).toStrictEqual({
        revalidate: 3600,
        tags: ["product:FO-BQ-001", "catalog:PL", "catalog:PL:en", "sitemap"],
      });
    }
  });

  it("gives `live` five minutes and adds `cutoff:{iso2}`", () => {
    expect(productCachePolicy({ ...page, state: "live" })).toStrictEqual({
      revalidate: 300,
      tags: [
        "product:FO-BQ-001",
        "catalog:PL",
        "catalog:PL:en",
        "sitemap",
        "cutoff:PL",
      ],
    });
    expect(PRODUCT_REVALIDATE_SECONDS).toBe(3600);
    expect(LIVE_PRODUCT_REVALIDATE_SECONDS).toBe(300);
  });

  it("spells each tag from its builder", () => {
    expect(localeCatalogCacheTag("DE", "de")).toBe("catalog:DE:de");
    expect(cutoffCacheTag("RO")).toBe("cutoff:RO");
  });

  it("is what the product route exports for every Phase 0 destination (route segment configs are literals)", async () => {
    const route = readFileSync(
      resolve(
        import.meta.dirname,
        "../../src/app/[locale]/-product/[segment]/[child]/[grandchild]/page.tsx",
      ),
      "utf8",
    );
    const literal = Number(
      /^export const revalidate = (\d+);$/mu.exec(route)?.[1],
    );
    expect(literal).toBe(PRODUCT_REVALIDATE_SECONDS);
    // No destination is live in Phase 0, so every product page's policy is the literal's.
    const states = new Set(
      (await listProductPages()).map((entry) =>
        pickerState(entry.countryIso as never),
      ),
    );
    expect(states.has("live")).toBe(false);
    for (const state of states) {
      expect(productCachePolicy({ ...page, state }).revalidate, state).toBe(
        literal,
      );
    }
  });
});

describe("`urlsForTag()` learns the product page's tags (A10)", () => {
  it("`product:{sku}` is that product's page in every locale and destination, and nothing else", async () => {
    const expected = (await listProductPages())
      .filter((page) => page.sku === AMBER)
      .map((page) => page.path);
    expect(expected.length).toBeGreaterThan(4);
    expect(
      new Set(expected.map((path) => path.split("/")[1])).size,
    ).toBeGreaterThan(1);
    expect(
      await urlsForTag(`product:${AMBER}`, { baseUrl: BASE }),
    ).toStrictEqual(absolute(expected));
  });

  it("`catalog:{iso2}:{locale}` is that destination's listings and product pages in that locale", async () => {
    const listings = (await listingPages())
      .filter((page) => page.countryIso === "PL" && page.locale === "de")
      .map((page) => page.path);
    const products = (await listProductPages())
      .filter((page) => page.countryIso === "PL" && page.locale === "de")
      .map((page) => page.path);
    expect(listings.length).toBeGreaterThan(0);
    expect(products.length).toBeGreaterThan(0);
    const urls = await urlsForTag("catalog:PL:de", { baseUrl: BASE });
    expect(urls).toStrictEqual(absolute([...listings, ...products]));
    expect(urls.every((url) => url.startsWith(`${BASE}/de/polen/`))).toBe(true);
  });

  it("`cutoff:{iso2}` is nothing while the destination is not live", async () => {
    expect(pickerState("PL")).toBe("preview");
    expect(await urlsForTag("cutoff:PL", { baseUrl: BASE })).toStrictEqual([]);
  });

  it("`cutoff:{iso2}` is the live destination's product pages, in every locale, and no listing", async () => {
    const expected = (await listProductPages())
      .filter((page) => page.countryIso === "PL")
      .map((page) => page.path);
    const urls = await withActivePartnersProvider(
      { hasActivePartners: (iso2: string) => iso2 === "PL" },
      () => urlsForTag("cutoff:PL", { baseUrl: BASE }),
    );
    expect(urls).toStrictEqual(absolute(expected));
    // Germany has no `operations` block, so a partner there still makes no live picker.
    const germany = await withActivePartnersProvider(
      { hasActivePartners: () => true },
      () => urlsForTag("cutoff:DE", { baseUrl: BASE }),
    );
    expect(germany).toStrictEqual([]);
  });

  it("still resolves `catalog:{iso2}` to the destination's listings and product pages, and `sitemap` to nothing", async () => {
    const listings = (await listingPages())
      .filter((page) => page.countryIso === "PL")
      .map((page) => page.path);
    const products = (await listProductPages())
      .filter((page) => page.countryIso === "PL")
      .map((page) => page.path);
    expect(await urlsForTag("catalog:PL", { baseUrl: BASE })).toStrictEqual(
      absolute([...listings, ...products]),
    );
    expect(await urlsForTag("sitemap", { baseUrl: BASE })).toStrictEqual([]);
  });
});
