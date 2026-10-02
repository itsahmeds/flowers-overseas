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
 *  3. **No caller can corrupt a read** (TASK-148). For each of the nine reads, the case mutates the
 *     value the provider *returned* — its `.length`, one row field, and a row's nested array where
 *     rows carry one — then reads again and asserts the second read is exactly the first, row
 *     count and every field. A provider may refuse the write (a deep-frozen value throws a
 *     `TypeError` in strict mode) or absorb it (a fresh copy per call); either passes, and the
 *     re-read is asserted in both. A provider that handed out its own module array would make one
 *     page's `.length = 1` every later page's catalogue, and one row's `retailMinor = …` every
 *     later buyer's price.
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

/** `catalogue.products`, `price.countryPrices`, … — every read a provider set answers. */
export type CatalogProviderRead = {
  [
    Group in keyof CatalogProviders
  ]: `${Group}.${keyof CatalogProviders[Group] & string}`;
}[keyof CatalogProviders];

/**
 * The exact number of rows each read hands over in one implementation's data. Each run states its
 * own (a database may legitimately hold more history than the static set), and every count must be
 * at least 2, or a truncation to one row would be invisible.
 */
export type CatalogProviderRowCounts = Readonly<
  Record<CatalogProviderRead, number>
>;

/** The row type a read hands over. */
type RowOf<
  Group extends keyof CatalogProviders,
  Method extends keyof CatalogProviders[Group],
> = CatalogProviders[Group][Method] extends () => Promise<
  readonly (infer Row)[]
>
  ? Row
  : never;

/** What the mutation cases write on one read's first row. */
type MutationTarget<Row> = {
  /** A scalar field a careless caller might overwrite. */
  readonly field: keyof Row & string;
  /** A nested array on the row, where the rows carry one (a shallow freeze leaves it writable). */
  readonly nested?: keyof Row & string;
};

/**
 * One target per read, typed against the interfaces: a read added to a provider interface fails
 * `typecheck` here until it has a target, and a target naming a field the row does not have fails
 * too. The fields are the ones whose corruption would be silent: a price, a rate, the default
 * tier, a flag.
 */
const MUTATION_TARGETS = {
  catalogue: {
    products: { field: "name", nested: "occasions" },
    tiers: { field: "isDefault" },
    categories: { field: "sort" },
    occasions: { field: "sort" },
    addons: { field: "partnerOnly" },
  },
  price: {
    countryPrices: { field: "retailMinor" },
    addonCountryPrices: { field: "retailMinor" },
  },
  fx: { fxRates: { field: "ratePpm" } },
  flags: { flags: { field: "enabled" } },
} as const satisfies {
  readonly [Group in keyof CatalogProviders]: {
    readonly [Method in keyof CatalogProviders[Group]]: MutationTarget<
      RowOf<Group, Method>
    >;
  };
};

type MutationCase = {
  readonly read: CatalogProviderRead;
  readonly call: (providers: CatalogProviders) => Promise<readonly unknown[]>;
  readonly field: string;
  readonly nested: string | undefined;
};

/** The nine reads, flattened, each called as a method of its own provider. */
const MUTATION_CASES: readonly MutationCase[] = Object.entries(
  MUTATION_TARGETS,
).flatMap(([group, methods]) =>
  Object.entries(methods).map(
    ([method, target]: [string, MutationTarget<Record<string, unknown>>]) => ({
      read: `${group}.${method}` as CatalogProviderRead,
      call: (providers: CatalogProviders) => {
        const provider = providers[
          group as keyof CatalogProviders
        ] as unknown as Partial<
          Record<string, () => Promise<readonly unknown[]>>
        >;
        const readRows = provider[method];
        if (readRows === undefined) {
          throw new Error(`the provider set answers no \`${group}.${method}\``);
        }
        return readRows.call(provider);
      },
      field: target.field,
      nested: target.nested,
    }),
  ),
);

/** A different value of the same type, so the write is a real change and never a no-op. */
function changed(value: unknown): unknown {
  if (typeof value === "number") return value + 1;
  if (typeof value === "string") return `${value}-mutated`;
  if (typeof value === "boolean") return !value;
  throw new Error(
    `the contract overwrites a scalar field; this one holds ${typeof value}`,
  );
}

/**
 * Do what a careless caller does. A deep-frozen value refuses the write with a `TypeError`
 * (strict-mode ESM); a fresh copy per call accepts it on its own copy. Both are allowed, and the
 * caller asserts the re-read either way. Anything else thrown is a failure.
 */
function attempt(write: () => void): void {
  try {
    write();
  } catch (error) {
    expect(error).toBeInstanceOf(TypeError);
  }
}

/** The first row of a read, as the plain record a careless caller would treat it as. */
function firstRow(rows: readonly unknown[]): Record<string, unknown> {
  const [row] = rows;
  if (row === null || typeof row !== "object") {
    throw new Error("the read handed over no first row to mutate");
  }
  return row as Record<string, unknown>;
}

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
 * @param rowCounts the exact number of rows each read hands over in this implementation's data.
 */
export function describeCatalogProviderContract(
  label: string,
  providersFor: () => CatalogProviders,
  rowCounts: CatalogProviderRowCounts,
): void {
  for (const [read, count] of Object.entries(rowCounts)) {
    if (!Number.isInteger(count) || count < 2) {
      throw new Error(
        `\`${read}\` is counted at ${String(count)} rows; the mutation cases need at least 2, or a truncation to one row cannot be seen`,
      );
    }
  }

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

    it("mutates every read the provider set answers, and counts each one", () => {
      // The table is typed against the interfaces, and the counts are this run's own: the two
      // must name the same nine reads, so neither can drop one without this going red.
      expect(MUTATION_CASES.map(({ read }) => read).sort()).toEqual(
        Object.keys(rowCounts).sort(),
      );
      expect(MUTATION_CASES).toHaveLength(9);
    });

    // A caller mutating what it was handed must not change the next read (TASK-148). Each case
    // mutates the value the provider **returned**, never a copy of it, then reads again through
    // the same provider and asserts the second read equals a deep snapshot of the first. The row
    // cases run before the truncation, so that against a provider that shares its array each one
    // goes red on its own write rather than on the previous case's.
    for (const { read, call, field, nested } of MUTATION_CASES) {
      it(`${read}(): writing \`${field}\` on a returned row does not change the next read`, async () => {
        const providers = providersFor();
        const handed = await call(providers);
        const before = structuredClone(handed);
        expect(before).toHaveLength(rowCounts[read]);
        const row = firstRow(handed);
        expect(Object.keys(row)).toContain(field);
        const original = row[field];
        const next = changed(original);

        attempt(() => {
          row[field] = next;
        });

        const again = await call(providers);
        expect(firstRow(again)[field]).toBe(original);
        expect(again).toHaveLength(rowCounts[read]);
        expect(again).toStrictEqual(before);
      });

      if (nested !== undefined) {
        it(`${read}(): emptying a returned row's \`${nested}\` array does not change the next read`, async () => {
          const providers = providersFor();
          const handed = await call(providers);
          const before = structuredClone(handed);
          const list = firstRow(handed)[nested];
          if (!Array.isArray(list)) {
            throw new Error(`\`${read}\` rows carry no \`${nested}\` array`);
          }
          const length = list.length;
          if (length === 0) {
            throw new Error(
              `\`${read}\`'s first row has an empty \`${nested}\`; emptying it again would change nothing`,
            );
          }

          attempt(() => {
            list.length = 0;
          });

          const again = await call(providers);
          expect(firstRow(again)[nested]).toHaveLength(length);
          expect(again).toStrictEqual(before);
        });
      }

      it(`${read}(): truncating the returned array does not shorten the next read`, async () => {
        const providers = providersFor();
        const handed = await call(providers);
        const before = structuredClone(handed);
        expect(before).toHaveLength(rowCounts[read]);

        attempt(() => {
          (handed as unknown[]).length = 1;
        });

        const again = await call(providers);
        expect(again).toHaveLength(rowCounts[read]);
        expect(again).toStrictEqual(before);
      });
    }

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
