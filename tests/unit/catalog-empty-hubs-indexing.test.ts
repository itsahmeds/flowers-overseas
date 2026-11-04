/**
 * Empty hubs on the indexing deployment, and the flip that is data (spec 008 §14
 * A-orchestrator-2026-11-04a; **AC-94**'s indexing half, **AC-95**; T-95's unit half, T-96;
 * TASK-438).
 *
 * The fixture AC-94 names: "under a deployment fixture where `isIndexingEnvironment()` is true,
 * with its copy reviewed in an indexable locale". The deployment is production on the canonical
 * host; the copy fixture marks every committed copy row `reviewed: true`, so the only term left to
 * decide a hub's directive is the one this task adds. Without it every rule-2 hub would already be
 * `noindex` for its unreviewed copy and the assertions would pass with the term removed.
 *
 * The flips (AC-95) go through the provider seam only (`withCatalogProviders()`, spec 005 §2):
 * a fixture core list, with no file under `src/` changed.
 *
 * Every hub set is computed from the data (`coreRange()`, the facet reader, the category kinds),
 * asserted non-empty and asserted to hold the hub the AC names.
 */
import { describe, expect, it, vi } from "vitest";

const realCopy = await import("../../src/modules/catalog/copy.ts");
vi.doMock("../../src/modules/catalog/copy.ts", () => ({
  ...realCopy,
  copyRow: (...args: Parameters<typeof realCopy.copyRow>) => {
    const row = realCopy.copyRow(...args);
    return row === undefined ? undefined : { ...row, reviewed: true };
  },
  copyRows: (...args: Parameters<typeof realCopy.copyRows>) =>
    realCopy.copyRows(...args).map((row) => ({ ...row, reviewed: true })),
}));
vi.resetModules();

const listing = await import("../../src/modules/catalog/listing.ts");
const { coreRange } = await import("../../src/modules/catalog/shop.ts");
const { listProducts } = await import("../../src/modules/catalog/read.ts");
const { slugFor } = await import("../../src/modules/catalog/slugs.ts");
const { catalogProviders, withCatalogProviders } =
  await import("../../src/modules/catalog/providers.ts");
const seo = await import("../../src/modules/seo/index.ts");

const ORIGIN = `https://${seo.CANONICAL_HOST}`;
const INDEXING = {
  environment: "production",
  siteUrl: ORIGIN,
} as const;
const LOCALES = ["en", "en-gb"] as const;
type Locale = (typeof LOCALES)[number];

const STATIC = catalogProviders();
const categoryKind = new Map(
  (await STATIC.catalogue.categories()).map((row) => [row.key, row.kind]),
);

interface Hub {
  readonly locale: Locale;
  readonly pageType: "categoryHub" | "occasionHub";
  readonly entityKey: string;
  readonly slug: string;
  readonly path: string;
  readonly core: readonly string[];
  readonly ruleTwoKind: boolean;
}

/** Every hub of both locales with its core products and whether its kind takes rule 2. */
async function hubs(): Promise<readonly Hub[]> {
  const found: Hub[] = [];
  for (const locale of LOCALES) {
    const range = (await coreRange(locale))
      .map((entry) => entry.sku)
      .filter((sku) => slugFor("product", sku, locale) !== undefined);
    for (const page of await listing.listingPages(locale)) {
      if (page.pageType !== "categoryHub" && page.pageType !== "occasionHub") {
        continue;
      }
      const key = page.entityKey ?? "";
      const facet =
        page.pageType === "occasionHub"
          ? "occasion"
          : (categoryKind.get(key) ?? "");
      const tagged = await listProducts({ facets: { [facet]: [key] } });
      const skus = new Set(tagged.map((product) => product.sku));
      found.push({
        locale,
        pageType: page.pageType,
        entityKey: key,
        slug: page.slug ?? "",
        path: page.path,
        core: range.filter((sku) => skus.has(sku)),
        ruleTwoKind:
          page.pageType === "categoryHub"
            ? facet === "productType" || facet === "flowerType"
            : tagged.length > 0 &&
              tagged.every((product) => product.productType === "funeral"),
      });
    }
  }
  return found;
}

const TODAY = await hubs();
const RULE_TWO = TODAY.filter((h) => h.core.length === 0 && h.ruleTwoKind);
const STOCKED = TODAY.filter(
  (h) => h.pageType === "categoryHub" && h.core.length > 0,
);

const identityOf = (hub: Hub) => ({
  pageType: hub.pageType,
  locale: hub.locale,
  entityKey: hub.entityKey,
});

/** Every `xhtml:link` href of every listing sitemap row, in every listing locale. */
async function everySitemapAlternate(): Promise<Set<string>> {
  const hrefs = new Set<string>();
  for (const locale of listing.listingLocales()) {
    for (const entry of [
      ...(await seo.categorySitemapEntries(locale, INDEXING)),
      ...(await seo.occasionSitemapEntries(locale, INDEXING)),
    ]) {
      for (const alternate of entry.alternates) hrefs.add(alternate.href);
    }
  }
  return hrefs;
}

describe("the fixture and the computed sets", () => {
  it("names the hubs the AC names, in non-empty sets", () => {
    expect(RULE_TWO.length).toBeGreaterThan(0);
    expect(RULE_TWO.map((h) => h.path)).toContain("/en/flowers/tulips");
    expect(STOCKED.map((h) => h.path)).toContain("/en/flowers/roses");
  });

  it("makes the copy term hold, so `coreStocked` is what decides", async () => {
    for (const hub of [...RULE_TWO, ...STOCKED]) {
      const verdict = await listing.listingPageIndexability(
        identityOf(hub),
        INDEXING,
      );
      expect(verdict.terms.reviewed, hub.path).toBe(true);
      expect(verdict.terms.indexingEnvironment, hub.path).toBe(true);
      expect(verdict.terms.localeIndexable, hub.path).toBe(true);
    }
  });
});

describe("AC-94: under the indexing fixture a rule-2 hub is noindex and out of every sitemap and cluster (T-95)", () => {
  it("answers `noindex,follow` and is absent from categories.xml; a stocked hub answers `index,follow` and is present", async () => {
    for (const locale of LOCALES) {
      const rows = (await seo.categorySitemapEntries(locale, INDEXING)).map(
        (entry) => entry.loc,
      );
      for (const hub of RULE_TWO.filter((h) => h.locale === locale)) {
        const verdict = await listing.listingPageIndexability(
          identityOf(hub),
          INDEXING,
        );
        expect(verdict.directive, hub.path).toBe("noindex,follow");
        expect(rows, hub.path).not.toContain(`${ORIGIN}${hub.path}`);
      }
      for (const hub of STOCKED.filter((h) => h.locale === locale)) {
        const verdict = await listing.listingPageIndexability(
          identityOf(hub),
          INDEXING,
        );
        expect(verdict.directive, hub.path).toBe("index,follow");
        expect(rows, hub.path).toContain(`${ORIGIN}${hub.path}`);
      }
    }
  });

  // Walks every listing sitemap row of every locale with every copy row reviewed.
  it(
    "emits no cluster for its `<head>`, and its path is in no sitemap `xhtml:link` set",
    {
      timeout: 60_000,
    },
    async () => {
      const alternates = await everySitemapAlternate();
      expect(alternates.size).toBeGreaterThan(0);
      for (const hub of RULE_TWO) {
        expect(
          await listing.listingAlternatePaths(identityOf(hub), {
            cluster: true,
          }),
          hub.path,
        ).toEqual({});
        expect(alternates.has(`${ORIGIN}${hub.path}`), hub.path).toBe(false);
      }
      for (const hub of STOCKED) {
        const cluster = await listing.listingAlternatePaths(identityOf(hub), {
          cluster: true,
        });
        expect(cluster[hub.locale], hub.path).toBe(hub.path);
        expect(alternates.has(`${ORIGIN}${hub.path}`), hub.path).toBe(true);
      }
    },
  );

  it("keeps its path in the link map every link reads (menu, switcher, popup)", async () => {
    for (const hub of RULE_TWO) {
      expect(
        (await listing.listingAlternatePaths(identityOf(hub)))[hub.locale],
        hub.path,
      ).toBe(hub.path);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-95: the flip is data, through the provider seam.                        */
/* -------------------------------------------------------------------------- */

const products = await STATIC.catalogue.products();
const topRank = Math.max(...products.map((p) => p.coreRank ?? 0));

/** The provider set with one product's record replaced. Nothing under `src/` changes. */
function withProduct(
  sku: string,
  change: (row: (typeof products)[number]) => (typeof products)[number],
) {
  return {
    ...STATIC,
    catalogue: {
      ...STATIC.catalogue,
      products: async () =>
        products.map((row) => (row.sku === sku ? change(row) : row)),
    },
  };
}

const tulips = RULE_TWO.find((h) => h.path === "/en/flowers/tulips");
if (tulips === undefined) throw new Error("the tulips hub must be in RULE_TWO");

/** An active, non-core product of the tulips category with an `en` slug that becomes core. */
async function tulipCandidate(): Promise<string> {
  const facet = categoryKind.get(tulips?.entityKey ?? "") ?? "";
  for (const product of await listProducts({
    facets: { [facet]: [tulips?.entityKey ?? ""] },
  })) {
    if (slugFor("product", product.sku, "en") === undefined) continue;
    const providers = withProduct(product.sku, (row) => ({
      ...row,
      coreRank: topRank + 1,
    }));
    const inRange = await withCatalogProviders(providers, async () =>
      (await coreRange("en")).some((entry) => entry.sku === product.sku),
    );
    if (inRange) return product.sku;
  }
  throw new Error("no tulips product can join the core range");
}

describe("AC-95: a fixture core list adding one tulips product flips the hub back (T-96)", () => {
  it("shows that one card, holds the term, answers `index,follow`, is in categories.xml with a cluster of its stocked versions", async () => {
    const sku = await tulipCandidate();
    const providers = withProduct(sku, (row) => ({
      ...row,
      coreRank: topRank + 1,
    }));
    await withCatalogProviders(providers, async () => {
      const identity = identityOf(tulips);
      const view = await listing.listingView(
        { locale: "en", pageType: "categoryHub", entity: tulips.slug },
        { from: "2026-10-01", deployment: INDEXING },
      );
      expect(view?.hubItems.map((card) => card.productId)).toEqual([sku]);
      expect(view?.resultCount).toBe(1);
      const verdict = await listing.listingPageIndexability(identity, INDEXING);
      expect(verdict.terms.coreStocked).toBe(true);
      expect(verdict.directive).toBe("index,follow");
      expect(view?.directive).toBe("index,follow");

      const row = (await seo.categorySitemapEntries("en", INDEXING)).find(
        (entry) => entry.loc === `${ORIGIN}${tulips.path}`,
      );
      expect(row).toBeDefined();

      // Exactly its stocked locale versions: the product has a slug there and is in that
      // locale's core range, read independently of the code under test.
      const links = await listing.listingAlternatePaths(identity);
      const stocked: Record<string, string> = {};
      for (const [locale, path] of Object.entries(links)) {
        const code = locale as Locale;
        if (slugFor("product", sku, code) === undefined) continue;
        if (!(await coreRange(code)).some((entry) => entry.sku === sku)) {
          continue;
        }
        stocked[locale] = path;
      }
      expect(Object.keys(stocked)).toContain("en");
      const cluster = await listing.listingAlternatePaths(identity, {
        cluster: true,
      });
      expect(cluster).toEqual(stocked);
      // The row's `xhtml:link` set is `alternatesFor()` over that cluster (which keeps only the
      // indexable locales' versions): it names the page itself and nothing outside the cluster.
      const hrefs = new Set(row?.alternates.map((a) => a.href));
      expect(hrefs.has(`${ORIGIN}${tulips.path}`)).toBe(true);
      for (const href of hrefs) {
        expect(
          Object.values(stocked).some((path) => href === `${ORIGIN}${path}`),
          href,
        ).toBe(true);
      }
    });
  });

  it("with exactly one core product carrying the Mother's Day occasion, shows that one card and no other", async () => {
    const mothers = TODAY.find((h) => h.path === "/en/occasions/mothers-day");
    if (mothers === undefined) throw new Error("Mother's Day must be a hub");
    expect(mothers.core).toEqual([]);
    const [first] = (await coreRange("en"))
      .map((entry) => entry.sku)
      .filter((sku) => slugFor("product", sku, "en") !== undefined);
    if (first === undefined) throw new Error("the core range is empty");
    const providers = withProduct(first, (row) => ({
      ...row,
      occasions: [...row.occasions, mothers.entityKey as never],
    }));
    await withCatalogProviders(providers, async () => {
      const view = await listing.listingView(
        { locale: "en", pageType: "occasionHub", entity: mothers.slug },
        { from: "2026-10-01", deployment: INDEXING },
      );
      expect(view?.hubItems.map((card) => card.productId)).toEqual([first]);
      expect((await listing.hubCoreState(identityOf(mothers)))?.coreCount).toBe(
        1,
      );
    });
  });
});
