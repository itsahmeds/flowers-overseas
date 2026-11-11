/**
 * One read per table per prices document (TASK-294 carry-forward 1, closed in TASK-295; spec 005
 * AC-28; spec 012b §2.0).
 *
 * A route handler is not a React server render, so React's `cache()` keeps nothing there and the
 * database providers read their whole table on every call. `/api/prices/{locale}/{iso2}` prices
 * every core card, so a database-mode build issued one `country_price` query per card per
 * document and timed out. `withCatalogReadScope()` (`src/modules/catalog/read-scope.ts`) gives a
 * whole document one scope. These cases count the reads:
 *
 *  1. the real database providers, over a read that counts the transactions it would open: forty
 *     concurrent price reads inside one scope are one query, outside it forty;
 *  2. the prices document itself, priced through the composition root over counting providers
 *     built on the same `scopedRead()` and `requestReadScope`: each table is read once for the
 *     whole document, where pricing the same cards without the scope reads `country_price` once
 *     per card.
 */
import { describe, expect, it } from "vitest";

import {
  type CatalogDbRead,
  createDbCatalogProviders,
} from "../../src/modules/catalog/db/index.ts";
import {
  requestReadScope,
  scopedRead,
} from "../../src/modules/catalog/db/read.ts";
import { productCardView } from "../../src/modules/catalog/listing.ts";
import {
  type CatalogProviders,
  withCatalogProviders,
} from "../../src/modules/catalog/providers.ts";
import { listProducts } from "../../src/modules/catalog/read.ts";
import {
  activeCatalogReadScope,
  withCatalogReadScope,
} from "../../src/modules/catalog/read-scope.ts";
import {
  pricesDocuments,
  rememberedPricesView,
} from "../../src/modules/catalog/remembered-prices.ts";
import { coreRange } from "../../src/modules/catalog/shop.ts";
import {
  staticCatalogueProvider,
  staticFlagProvider,
  staticFxRateProvider,
  staticPriceProvider,
} from "../../src/modules/catalog/static/index.ts";

const NOW = new Date("2026-09-15T10:00:00Z");

/** A read that opens no transaction: it counts the ones it would have opened and returns no rows. */
function countingRead(): { read: CatalogDbRead; calls: () => number } {
  let calls = 0;
  const read: CatalogDbRead = <T>() => {
    calls += 1;
    return Promise.resolve([] as unknown as T);
  };
  return { read, calls: () => calls };
}

describe("the database providers inside and outside one read scope", () => {
  it("forty concurrent price reads in one scope are one query", async () => {
    const { read, calls } = countingRead();
    const { price } = createDbCatalogProviders({
      read,
      scope: requestReadScope,
    });
    await withCatalogReadScope(() =>
      Promise.all(Array.from({ length: 40 }, () => price.countryPrices())),
    );
    expect(calls()).toBe(1);
  });

  it("the same forty reads with no scope are forty queries", async () => {
    const { read, calls } = countingRead();
    const { price } = createDbCatalogProviders({
      read,
      scope: requestReadScope,
    });
    await Promise.all(Array.from({ length: 40 }, () => price.countryPrices()));
    expect(calls()).toBe(40);
  });

  it("a nested scope joins the outer one, and none outlives its work", async () => {
    expect(activeCatalogReadScope()).toBeUndefined();
    await withCatalogReadScope(async () => {
      const outer = activeCatalogReadScope();
      expect(outer).toBeInstanceOf(Map);
      await withCatalogReadScope(() => {
        expect(activeCatalogReadScope()).toBe(outer);
        return Promise.resolve();
      });
    });
    expect(activeCatalogReadScope()).toBeUndefined();
  });

  it("two documents rendered at once each get their own scope", async () => {
    const { read, calls } = countingRead();
    const { price } = createDbCatalogProviders({
      read,
      scope: requestReadScope,
    });
    await Promise.all([
      withCatalogReadScope(() => price.countryPrices()),
      withCatalogReadScope(() => price.countryPrices()),
    ]);
    expect(calls()).toBe(2);
  });
});

/** Static rows behind `scopedRead()`, counting the reads per table key, as the database providers do. */
function countingProviders(): {
  providers: CatalogProviders;
  reads: Map<string, number>;
} {
  const reads = new Map<string, number>();
  const read: CatalogDbRead = (query) => query(undefined as never);
  const options = { read, scope: requestReadScope };
  const table =
    <Row>(key: string, rows: () => Promise<readonly Row[]>) =>
    (): Promise<readonly Row[]> =>
      scopedRead(options, key, () => {
        reads.set(key, (reads.get(key) ?? 0) + 1);
        return rows();
      });
  return {
    reads,
    providers: {
      catalogue: {
        products: table("catalogue.products", () =>
          staticCatalogueProvider.products(),
        ),
        tiers: table("catalogue.tiers", () => staticCatalogueProvider.tiers()),
        categories: () => staticCatalogueProvider.categories(),
        occasions: () => staticCatalogueProvider.occasions(),
        addons: () => staticCatalogueProvider.addons(),
      },
      price: {
        countryPrices: table("price.countryPrices", () =>
          staticPriceProvider.countryPrices(),
        ),
        addonCountryPrices: table("price.addonCountryPrices", () =>
          staticPriceProvider.addonCountryPrices(),
        ),
      },
      fx: staticFxRateProvider,
      flags: staticFlagProvider,
    },
  };
}

describe("the prices document reads each table once (TASK-294 carry-forward 1)", () => {
  it("one prices document: one read of each table, whatever its card count", async () => {
    const { providers, reads } = countingProviders();
    const view = await withCatalogProviders(providers, () =>
      rememberedPricesView("en", "pl", NOW),
    );
    expect(view?.cards.length ?? 0).toBeGreaterThan(1);
    expect(reads.get("price.countryPrices")).toBe(1);
    expect(reads.get("catalogue.products")).toBe(1);
    expect(reads.get("catalogue.tiers")).toBe(1);
    expect(Math.max(...reads.values())).toBe(1);
  });

  it("the same cards priced with no scope read the price table once per card", async () => {
    const { providers, reads } = countingProviders();
    const cards = await withCatalogProviders(providers, async () => {
      const sold = new Map(
        (await listProducts({ countryIso: "PL" })).map((product) => [
          product.sku,
          product,
        ]),
      );
      const core = (await coreRange("en")).flatMap((entry) => {
        const product = sold.get(entry.sku);
        return product === undefined ? [] : [product];
      });
      reads.clear();
      for (const product of core) {
        await productCardView(product, "en", "PL", {
          productLinks: true,
          now: NOW,
        });
      }
      return core.length;
    });
    expect(cards).toBeGreaterThan(1);
    expect(reads.get("price.countryPrices")).toBeGreaterThanOrEqual(cards);
  });

  it("the document list for generateStaticParams is one read per table too", async () => {
    const { providers, reads } = countingProviders();
    const documents = await withCatalogProviders(providers, () =>
      pricesDocuments(),
    );
    expect(documents.length).toBeGreaterThan(0);
    for (const count of reads.values()) expect(count).toBe(1);
  });
});
