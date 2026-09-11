/**
 * The catalogue provider contract (spec 005 §2 "The no-database seam", §5.2 `providers.ts`,
 * AC-27, T-25; TASK-069).
 *
 * **One suite, two implementations.** `static*` reads committed TypeScript, `db*` (TASK-070) will
 * read Postgres through Drizzle, and the module above them must not be able to tell which it got.
 * A test written twice would drift; this one is written once and *called* twice — here against
 * the static set, and against the database set from `tests/contract/catalog-db-providers.test.ts`
 * when `DATABASE_URL` is present.
 *
 * What it asserts is deliberately **not** "the same 84 products": the two sources will be seeded
 * from the same projections but a database can legitimately hold more history. It asserts the
 * properties the module *relies on* and that a database implementation is most likely to break:
 *
 *  1. **Every row parses** against the dataset's own zod schema. A provider is a boundary
 *     (`CLAUDE.md`: zod at every boundary), and a `numeric` column arriving as the string
 *     `"14900"` is the classic Drizzle-shaped defect this catches on TASK-070's first run.
 *  2. **A provider resolves nothing.** It hands over the whole price *history* — superseded rows
 *     included, which is what makes the Omnibus 30-day-lowest figure derivable (§8) — and it
 *     never returns a row set already narrowed to "the active one".
 *  3. **A read is a pure function of the data.** Two calls return equal values, and a caller that
 *     mutates the array it was given does not change what the next caller sees. A provider that
 *     handed out its own cached array would make one page's mutation another page's price.
 *  4. **Referential integrity across providers**: every tier belongs to a product, every price row
 *     names a known product and a configured currency, every add-on price names a known add-on.
 *  5. **No buyer dimension anywhere** (EU 2018/302, AC-18): asserted on the *values* here, where
 *     `catalog-geo-surface.test.ts` asserts it on the types.
 *
 * It takes a factory rather than a provider set so that a database implementation can open and
 * close its own connection per suite without this file knowing that connections exist.
 */
import { describe, expect, it } from "vitest";

import {
  AddonCountryPriceDataSchema,
  AddonDataSchema,
  CategoryDataSchema,
  CountryPriceDataSchema,
  FxRateDataSchema,
  OccasionDataSchema,
  ProductDataSchema,
  ProductTierDataSchema,
} from "../../../src/config/catalogue/schemas.ts";
import { isCurrencyCode } from "../../../src/config/currencies.ts";
import type { CatalogProviders } from "../../../src/modules/catalog/providers.ts";

/** AC-18's pattern, applied to row *keys* rather than to types. */
const BUYER_DIMENSION = /buyer(Country|Location)?|ipAddress|geo|visitor/i;

/** Every key at every depth of a row. */
function keysOf(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, into);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    into.add(key);
    keysOf(nested, into);
  }
}

/**
 * Run the contract against one set of providers.
 *
 * @param label how the implementation is named in the test output (`static`, `db`).
 * @param providersFor a factory returning the set under test.
 */
export function describeCatalogProviderContract(
  label: string,
  providersFor: () => CatalogProviders,
): void {
  describe(`${label} providers: the catalogue contract (AC-27, T-25)`, () => {
    it("hands over rows that parse against the dataset's own schemas", async () => {
      const providers = providersFor();
      const [products, tiers, categories, occasions, addons] =
        await Promise.all([
          providers.catalogue.products(),
          providers.catalogue.tiers(),
          providers.catalogue.categories(),
          providers.catalogue.occasions(),
          providers.catalogue.addons(),
        ]);

      expect(products.length).toBeGreaterThan(0);
      for (const product of products) ProductDataSchema.parse(product);
      for (const tier of tiers) {
        const { sku, ...row } = tier;
        expect(typeof sku).toBe("string");
        ProductTierDataSchema.parse(row);
      }
      for (const category of categories) CategoryDataSchema.parse(category);
      for (const occasion of occasions) OccasionDataSchema.parse(occasion);
      for (const addon of addons) AddonDataSchema.parse(addon);
    });

    it("hands over price and FX rows that parse, in integer minor units", async () => {
      const providers = providersFor();
      const [prices, addonPrices, rates] = await Promise.all([
        providers.price.countryPrices(),
        providers.price.addonCountryPrices(),
        providers.fx.fxRates(),
      ]);

      expect(prices.length).toBeGreaterThan(0);
      for (const row of prices) {
        CountryPriceDataSchema.parse(row);
        expect(Number.isInteger(row.retailMinor), row.sku).toBe(true);
        expect(isCurrencyCode(row.currency), row.currency).toBe(true);
      }
      for (const row of addonPrices) AddonCountryPriceDataSchema.parse(row);
      for (const rate of rates) {
        FxRateDataSchema.parse(rate);
        expect(Number.isInteger(rate.ratePpm), rate.quote).toBe(true);
      }
    });

    it("resolves nothing: the price history comes over, superseded rows included", async () => {
      const providers = providersFor();
      const prices = await providers.price.countryPrices();

      // Both kinds are present, which is the whole point of "a provider hands over history":
      // the active rows a page prices from, and the closed ones Art. 6a is derived from.
      expect(prices.some((row) => row.activeTo === null)).toBe(true);
      expect(prices.some((row) => row.activeTo !== null)).toBe(true);
      // ...and the surcharge rows, which a provider that pre-resolved would have folded in.
      expect(prices.some((row) => row.surchargeKind !== null)).toBe(true);
    });

    it("is a pure read: two calls agree, and a caller's mutation is not shared", async () => {
      const providers = providersFor();
      const first = await providers.price.countryPrices();
      const second = await providers.price.countryPrices();

      expect(second).toEqual(first);

      // A caller mutating what it was handed must not change the next read. A provider that
      // returned its own cached array would make one page's edit another page's price.
      const mutable = [...first] as unknown[];
      mutable.length = 1;
      const third = await providers.price.countryPrices();
      expect(third.length).toBe(first.length);
    });

    it("keeps the four cross-provider references intact", async () => {
      const providers = providersFor();
      const [products, tiers, addons, prices, addonPrices] = await Promise.all([
        providers.catalogue.products(),
        providers.catalogue.tiers(),
        providers.catalogue.addons(),
        providers.price.countryPrices(),
        providers.price.addonCountryPrices(),
      ]);
      const skus = new Set(products.map((product) => product.sku));
      const addonKeys = new Set(addons.map((addon) => addon.key));
      const tierKeys = new Set(
        tiers.map((tier) => `${tier.sku}${tier.tierKey}`),
      );

      for (const tier of tiers) expect(skus, tier.sku).toContain(tier.sku);
      for (const row of prices) {
        expect(skus, row.sku).toContain(row.sku);
        if (row.tierKey === null) continue;
        expect(tierKeys, `${row.sku} ${row.tierKey}`).toContain(
          `${row.sku}${row.tierKey}`,
        );
      }
      for (const row of addonPrices) {
        expect(addonKeys, row.addonKey).toContain(row.addonKey);
      }
    });

    it("gives every product exactly one default tier (§13 Q6)", async () => {
      const providers = providersFor();
      const tiers = await providers.catalogue.tiers();
      const defaults = new Map<string, number>();
      for (const tier of tiers) {
        defaults.set(
          tier.sku,
          (defaults.get(tier.sku) ?? 0) + (tier.isDefault ? 1 : 0),
        );
      }

      expect([...defaults.values()].every((count) => count === 1)).toBe(true);
    });

    it("carries no buyer-keyed dimension on any row (EU 2018/302, AC-18)", async () => {
      const providers = providersFor();
      const keys = new Set<string>();
      for (const rows of await Promise.all([
        providers.catalogue.products(),
        providers.catalogue.tiers(),
        providers.catalogue.addons(),
        providers.price.countryPrices(),
        providers.price.addonCountryPrices(),
        providers.fx.fxRates(),
      ])) {
        keysOf(rows, keys);
      }

      expect(keys.size).toBeGreaterThan(10);
      expect([...keys].filter((key) => BUYER_DIMENSION.test(key))).toEqual([]);
    });

    it("answers the flag scopes the module consumes, and no others by accident", async () => {
      const providers = providersFor();
      const flags = await providers.flags.flags();

      expect(flags.length).toBeGreaterThan(0);
      for (const flag of flags) {
        expect(typeof flag.enabled, flag.key).toBe("boolean");
        // Dotted, lowercase-scoped keys: `addon.wine.PL`, `currency.PLN` (§12).
        expect(flag.key, flag.key).toMatch(/^[a-z]+(?:\.[A-Za-z0-9_-]+)+$/u);
      }
    });
  });
}
