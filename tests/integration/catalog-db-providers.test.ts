/**
 * T-25 (the database half) and T-26 — the database catalogue providers against a migrated and
 * seeded Postgres (spec 005 AC-27, AC-28; TASK-070).
 *
 * A scratch database migrated by the real runner and seeded by the real seed, plus the committed
 * FX snapshot written into `fx_rate` the way `fx.refresh` (TASK-071) will write rates: the seed
 * never writes one (`seed/target.ts`). Then:
 *
 *  - **AC-27, the same suite.** `describeCatalogProviderContract("db", …)` — the very function the
 *    static run calls — with the exact seeded row counts, through `app_web` in the public context
 *    (what a request reads) and with one read scope per provider set (what a request shares), so
 *    the mutation cases prove the values a request shares are frozen;
 *  - **AC-27, the same answers.** Every database read deep-equals the static read row for row, and
 *    the module, its composition root swapped to the database set **inside `src/modules/catalog`**
 *    (`withCatalogProviders`), prices every tier of every product in every priced destination,
 *    projects, converts, surcharges, lists by facet and states the Art. 6a figure exactly as it
 *    does over the static set. The build login `app_build` reads the same rows;
 *  - **AC-28, the query counter.** Every statement the pool sends is recorded (postgres.js
 *    `debug`). Pricing a product is one `country_price` query whatever its tier count; a warm
 *    request scope answers a whole page's reads with zero queries; building the providers issues
 *    none; a new request reads again;
 *  - the money edges: an empty `fx_rate` fails closed to the destination currency, a price no
 *    number holds exactly is refused, a product without its `en` name is refused, and
 *    `0020_product_facets`' one-time backfill turns a database seeded before it into the dataset.
 *
 * Local, disposable server only (`support/scratch-db.ts`); skipped with the reason when none
 * answers, and a failure in CI.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readSeedTree } from "../../seed/check.ts";
import { runSeed } from "../../seed/index.ts";
import { buildSeedPlan } from "../../seed/plan.ts";
import { toFxRateRow } from "../../src/config/catalogue/projections.ts";
import { COUNTRIES } from "../../src/config/countries.ts";
import { CURRENCIES } from "../../src/config/currencies.ts";
import type { DbTransaction } from "../../src/lib/db.ts";
import {
  type CatalogDbOptions,
  type CatalogDbRead,
  createDbCatalogProviders,
} from "../../src/modules/catalog/db/index.ts";
import { safeInteger } from "../../src/modules/catalog/db/read.ts";
import { lowestPriceInLast30Days } from "../../src/modules/catalog/pricing/history.ts";
import {
  priceProjection,
  priceTable,
} from "../../src/modules/catalog/pricing/project.ts";
import {
  dateSurcharges,
  resolveAddonPrice,
  resolvePrice,
  tierPrices,
} from "../../src/modules/catalog/pricing/resolve.ts";
import {
  type CatalogProviders,
  catalogProviders,
  withCatalogProviders,
} from "../../src/modules/catalog/providers.ts";
import { listProducts } from "../../src/modules/catalog/read.ts";
import { staticFlagProvider } from "../../src/modules/catalog/static/index.ts";
import {
  type CatalogProviderRowCounts,
  describeCatalogProviderContract,
} from "../contract/support/catalog-provider-contract.ts";

import { drizzleOver } from "./support/drizzle-tx.ts";
import {
  probeLocalServer,
  rolledBack,
  runner,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();
const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** The static set: the composition root's answer before any swap. */
const STATIC: CatalogProviders = catalogProviders();

/**
 * The exact seeded counts: the dataset's own (the seed writes every authored row, superseded price
 * rows included) and the snapshot's ten rates. At least two per read (TASK-148).
 */
const DB_ROW_COUNTS: CatalogProviderRowCounts = {
  "catalogue.products": 84,
  "catalogue.tiers": 236,
  "catalogue.categories": 23,
  "catalogue.occasions": 32,
  "catalogue.addons": 6,
  "price.countryPrices": 3332,
  "price.addonCountryPrices": 42,
  "fx.fxRates": 10,
  "flags.flags": COUNTRIES.length + CURRENCIES.length,
};

/** The statements a pool sent, as text. */
const statements: string[] = [];

/** Drizzle quotes every table it reads; a raw subquery names `public.<table>`. */
function readsOf(table: string): number {
  return statements.filter(
    (text) =>
      /^\s*select/iu.test(text) &&
      new RegExp(`from "${table}"`, "u").test(text),
  ).length;
}

/** Every catalogue `SELECT` (the role preamble is `SET LOCAL`, never counted). */
function catalogueReads(): number {
  return statements.filter((text) => /^\s*select/iu.test(text)).length;
}

/**
 * One transaction as `withDbContext({ role: "public" })` opens it: the session variables, then
 * the role (`src/lib/db.ts`'s preamble), then the read.
 */
function contextRead(pool: Sql, role: "app_web" | null): CatalogDbRead {
  return async <T>(query: (db: DbTransaction) => Promise<T>): Promise<T> =>
    (await pool.begin(async (tx) => {
      await tx.unsafe("SET LOCAL app.role = 'public'");
      await tx.unsafe("SET LOCAL app.request_id = 'catalog-db-providers'");
      if (role !== null) await tx.unsafe(`SET LOCAL ROLE ${role}`);
      return query(drizzleOver(tx, pool));
    })) as T;
}

/** A read bound to one open transaction, so a case can change rows and roll them back. */
function inTransaction(tx: Tx, pool: Sql): CatalogDbRead {
  return <T>(query: (db: DbTransaction) => Promise<T>): Promise<T> =>
    query(drizzleOver(tx, pool));
}

/** One request's scope: the same `Map` for every read made through these options. */
function oneRequest(read: CatalogDbRead): CatalogDbOptions {
  const scope = new Map<string, Promise<unknown>>();
  return { read, scope: () => scope };
}

/** The database set the module reads, with the static flag provider (spec 005 names three). */
function databaseSet(options: CatalogDbOptions): CatalogProviders {
  return { ...createDbCatalogProviders(options), flags: staticFlagProvider };
}

/** The authored default tier of a product (the PDP's preselected size). */
async function defaultTierOf(sku: string): Promise<string> {
  const tier = (await STATIC.catalogue.tiers()).find(
    (candidate) => candidate.sku === sku && candidate.isDefault,
  );
  if (tier === undefined) throw new Error(`${sku} has no default tier`);
  return tier.tierKey;
}

/** The migration version just before `0020_product_facets`, whatever has merged before it. */
function versionBeforeFacets(): string {
  const versions = readdirSync(resolve(REPO_ROOT, "db/migrations"))
    .filter((file) => /^\d{4}_.+(?<!\.down)\.sql$/u.test(file))
    .map((file) => file.slice(0, 4))
    .sort();
  const at = versions.indexOf("0020");
  const before = versions[at - 1];
  if (at < 1 || before === undefined) throw new Error("0020 is not applied");
  return before;
}

/** A read's rows in natural-key order, so two sources' orders do not matter. */
function byKey<T>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => {
    const a = JSON.stringify(left);
    const b = JSON.stringify(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

describe.skipIf(server.url === undefined)(
  `T-25 / T-26 — the database catalogue providers${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let pool: Sql;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "catalogdb");
      await runSeed(scratch.sql, buildSeedPlan(await readSeedTree(REPO_ROOT)));
      // The snapshot the static provider serves, written as `fx.refresh` will write rates.
      for (const rate of await STATIC.fx.fxRates()) {
        const row = toFxRateRow(rate);
        await scratch.sql`
          INSERT INTO currency (code, minor_unit_exponent, rounding_style)
          VALUES (${row.quote_code}, 2, 'x99') ON CONFLICT (code) DO NOTHING`;
        await scratch.sql`
          INSERT INTO fx_rate (base_code, quote_code, rate_ppm, as_of, source)
          VALUES (${row.base_code}, ${row.quote_code}, ${row.rate_ppm}, ${row.as_of}, ${row.source})`;
      }
      pool = postgres(scratch.url, {
        max: 2,
        onnotice: () => undefined,
        debug: (_connection, query) => {
          statements.push(query);
        },
      });
    }, 600_000);

    afterAll(async () => {
      await pool.end({ timeout: 5 });
      await scratch.drop();
    });

    // AC-27: the same suite, through `app_web` in the public context, one request per set.
    describeCatalogProviderContract(
      "db",
      () => databaseSet(oneRequest(contextRead(pool, "app_web"))),
      DB_ROW_COUNTS,
    );

    describe("AC-27: the same answers as the static providers", () => {
      it("hands over every row the static provider does, field for field", async () => {
        const db = databaseSet(oneRequest(contextRead(pool, "app_web")));
        for (const [read, ofStatic, ofDb] of [
          ["products", STATIC.catalogue.products(), db.catalogue.products()],
          ["tiers", STATIC.catalogue.tiers(), db.catalogue.tiers()],
          [
            "countryPrices",
            STATIC.price.countryPrices(),
            db.price.countryPrices(),
          ],
          [
            "addonCountryPrices",
            STATIC.price.addonCountryPrices(),
            db.price.addonCountryPrices(),
          ],
          ["fxRates", STATIC.fx.fxRates(), db.fx.fxRates()],
        ] as const) {
          const [expected, actual]: readonly (readonly unknown[])[] =
            await Promise.all([ofStatic, ofDb]);
          expect(actual?.length, read).toBeGreaterThan(1);
          expect(byKey(actual ?? []), read).toStrictEqual(
            byKey(expected ?? []),
          );
        }
        // Definitions stay in the repository (spec 012b §2.2): the very same frozen rows.
        expect(await db.catalogue.categories()).toBe(
          await STATIC.catalogue.categories(),
        );
        expect(await db.catalogue.occasions()).toBe(
          await STATIC.catalogue.occasions(),
        );
        expect(await db.catalogue.addons()).toBe(
          await STATIC.catalogue.addons(),
        );
      });

      it("reads the same rows as the build login `app_build` (spec 012b AC-4)", async () => {
        const password = "catalog-db-providers-build";
        await scratch.sql.unsafe(
          `ALTER ROLE app_build LOGIN PASSWORD '${password}'`,
        );
        const url = new URL(scratch.url);
        url.username = "app_build";
        url.password = password;
        const build = postgres(url.toString(), {
          max: 1,
          onnotice: () => undefined,
        });
        try {
          const asBuild = databaseSet(oneRequest(contextRead(build, null)));
          const asWeb = databaseSet(oneRequest(contextRead(pool, "app_web")));
          expect(await asBuild.catalogue.products()).toStrictEqual(
            await asWeb.catalogue.products(),
          );
          expect(await asBuild.catalogue.tiers()).toHaveLength(236);
          expect(await asBuild.price.countryPrices()).toHaveLength(3332);
          expect(await asBuild.price.addonCountryPrices()).toHaveLength(42);
          expect(await asBuild.fx.fxRates()).toHaveLength(10);
        } finally {
          await build.end({ timeout: 5 });
          await scratch.sql.unsafe(
            "ALTER ROLE app_build NOLOGIN PASSWORD NULL",
          );
        }
      });

      it("prices, projects, converts, surcharges, lists and states Art. 6a identically through the swapped composition root", async () => {
        const priced = [
          ...new Set(
            (await STATIC.price.countryPrices()).map((row) => row.countryIso2),
          ),
        ].sort();
        const skus = (await STATIC.catalogue.products()).map((p) => p.sku);
        expect(priced).toHaveLength(7);
        expect(skus).toHaveLength(84);
        // 9 Mar 2026 is the day after the snapshot, so conversions are fresh; 7 Mar 2027 is a
        // Sunday and 8 Mar 2027 is Women's Day, the two surcharge kinds.
        const now = new Date("2026-09-09T12:00:00Z");
        const tierKey = await defaultTierOf("FO-BQ-001");

        /** Everything a PDP, a listing and checkout read, over whichever set is swapped in. */
        const pageReads = async () => {
          const tiers = [];
          for (const countryIso of priced) {
            for (const productId of skus) {
              tiers.push(
                await tierPrices({
                  productId,
                  countryIso: countryIso as never,
                }),
              );
            }
          }
          return {
            tiers,
            sunday: await resolvePrice({
              productId: "FO-BQ-001",
              tierKey,
              countryIso: "DE" as never,
              deliveryDate: "2027-03-07" as never,
            }),
            surcharges: await dateSurcharges("DE" as never, {
              from: "2027-03-06" as never,
              to: "2027-03-09" as never,
            }),
            projections: await Promise.all(
              (["en", "en-gb", "de", "pl"] as const).map((locale) =>
                priceProjection(locale, {
                  productId: "FO-BQ-001",
                  tierKey,
                  countryIso: "PL" as never,
                  now,
                }).catch((error: unknown) => String(error)),
              ),
            ),
            table: await priceTable({
              productId: "FO-BQ-001",
              countryIso: "PL" as never,
              now,
            }),
            card: await resolveAddonPrice({
              addonKey: "card",
              countryIso: "PL" as never,
            }),
            secondaryFlower: (
              await listProducts({ facets: { flowerType: ["carnations"] } })
            ).map((product) => product.sku),
            secondaryColour: (
              await listProducts({ facets: { colour: ["white"] } })
            ).map((product) => product.sku),
            occasion: (
              await listProducts({ facets: { occasion: ["sympathy"] } })
            ).map((product) => product.sku),
            lowest: await lowestPriceInLast30Days(
              "FO-BQ-001",
              tierKey,
              "PL" as never,
              "2026-09-09" as never,
            ).catch((error: unknown) => String(error)),
          };
        };

        const overStatic = await pageReads();
        const overDb = await withCatalogProviders(
          databaseSet(oneRequest(contextRead(pool, "app_web"))),
          pageReads,
        );

        expect(overStatic.tiers).toHaveLength(7 * 84);
        // Every compared value is a value, not two equal error messages.
        for (const projection of overStatic.projections) {
          expect(typeof projection).toBe("object");
        }
        expect(typeof overStatic.lowest).toBe("object");
        expect(overStatic.table.length).toBeGreaterThan(1);
        expect(overStatic.secondaryFlower.length).toBeGreaterThan(0);
        expect(overStatic.card.amountMinor).toBe(0);
        expect(overStatic.sunday.surcharges).toHaveLength(1);
        expect(overDb).toStrictEqual(overStatic);
        // The swap was the body's only: the root answers static again.
        expect(catalogProviders().price).toBe(STATIC.price);
      });
    });

    describe("AC-28: the query counter", () => {
      it("issues no query to build the providers or to swap them in", async () => {
        statements.length = 0;
        const db = databaseSet(oneRequest(contextRead(pool, "app_web")));
        await withCatalogProviders(db, () => Promise.resolve(null));
        expect(statements).toEqual([]);
      });

      it("prices every tier of a product with one `country_price` query, then a warm request reads nothing", async () => {
        statements.length = 0;
        const request = databaseSet(oneRequest(contextRead(pool, "app_web")));
        await withCatalogProviders(request, async () => {
          const ladder = await tierPrices({
            productId: "FO-BQ-001",
            countryIso: "PL" as never,
          });
          expect(ladder.length).toBeGreaterThan(1);
          // One query per table the ladder reads — the product (`listTiers` checks it exists),
          // its tiers and the prices — and never one per tier.
          expect(readsOf("country_price")).toBe(1);
          expect(readsOf("product_tier")).toBe(1);
          expect(readsOf("product")).toBe(1);
          expect(catalogueReads()).toBe(3);

          // Warm: the rest of the page — every tier again, another product's ladder, a whole
          // listing's from-prices, a projection — is answered from the request's scope.
          const warmFrom = catalogueReads();
          for (const tier of ladder) {
            await resolvePrice({
              productId: "FO-BQ-001",
              tierKey: tier.tierKey,
              countryIso: "PL" as never,
            });
          }
          for (const product of await STATIC.catalogue.products()) {
            await tierPrices({
              productId: product.sku,
              countryIso: "PL" as never,
            });
          }
          await priceProjection("en-gb", {
            productId: "FO-BQ-001",
            tierKey: await defaultTierOf("FO-BQ-001"),
            countryIso: "PL" as never,
          }).catch(() => null);
          // The projection's FX read is the page's first and only `fx_rate` query; nothing else.
          expect(catalogueReads() - warmFrom).toBe(1);
          expect(readsOf("fx_rate")).toBe(1);
          expect(readsOf("country_price")).toBe(1);
        });
      });

      it("reads again in a new request: no process-wide cache holds a superseded price", async () => {
        const tierKey = await defaultTierOf("FO-BQ-001");
        statements.length = 0;
        for (let request = 0; request < 3; request += 1) {
          await withCatalogProviders(
            databaseSet(oneRequest(contextRead(pool, "app_web"))),
            () =>
              resolvePrice({
                productId: "FO-BQ-001",
                tierKey,
                countryIso: "PL" as never,
              }),
          );
        }
        expect(readsOf("country_price")).toBe(3);
      });

      it("does not keep a failed read for the rest of the request", async () => {
        let calls = 0;
        const flaky: CatalogDbRead = async (query) => {
          calls += 1;
          if (calls === 1) throw new Error("connection reset");
          return contextRead(pool, "app_web")(query);
        };
        const request = databaseSet(oneRequest(flaky));
        await expect(request.price.countryPrices()).rejects.toThrow(
          "connection reset",
        );
        expect(await request.price.countryPrices()).toHaveLength(3332);
        expect(calls).toBe(2);
      });
    });

    describe("money edges at the database boundary", () => {
      it("an empty `fx_rate` converts nothing: the projection falls back to the destination currency", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          await tx`DELETE FROM fx_rate`;
          const tierKey = await defaultTierOf("FO-BQ-001");
          const projection = await withCatalogProviders(
            databaseSet(oneRequest(inTransaction(tx, scratch.sql))),
            () =>
              priceProjection("en-gb", {
                productId: "FO-BQ-001",
                tierKey,
                countryIso: "PL" as never,
                now: new Date("2026-09-09T12:00:00Z"),
              }),
          );
          expect(projection.displayPrice.currency).toBe("PLN");
          expect(projection.displayPrice).toStrictEqual(
            projection.destinationCurrencyPrice,
          );
          expect(projection.fxAsOf).toBeUndefined();
          expect(projection.ratePpm).toBeUndefined();
        });
      });

      it("refuses a price no number holds exactly, rather than rounding it", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          await tx`UPDATE country_price SET retail_minor = 9007199254740993
                   WHERE id = (SELECT id FROM country_price ORDER BY id LIMIT 1)`;
          const db = databaseSet(oneRequest(inTransaction(tx, scratch.sql)));
          await expect(db.price.countryPrices()).rejects.toThrow(RangeError);
        });
        expect(safeInteger(9_007_199_254_740_991n, "x")).toBe(
          Number.MAX_SAFE_INTEGER,
        );
        expect(() => safeInteger(9_007_199_254_740_992n, "x")).toThrow(
          RangeError,
        );
        expect(() => safeInteger(-9_007_199_254_740_992n, "x")).toThrow(
          RangeError,
        );
        expect(safeInteger(0n, "x")).toBe(0);
      });

      it("refuses a product without its `en` name rather than show it half-described", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          await tx`DELETE FROM product_translation
                   WHERE locale_code = 'en'
                     AND product_id = (SELECT id FROM product WHERE sku = 'FO-BQ-002')`;
          const db = databaseSet(oneRequest(inTransaction(tx, scratch.sql)));
          await expect(db.catalogue.products()).rejects.toThrow(/name/u);
        });
      });
    });

    describe("0020_product_facets: a database seeded before it reads as the dataset after it", () => {
      it("backfills the seeded rows once, and never a `real` one", async () => {
        // Back to the shape before 0020 on this seeded database, then forward again: the backfill
        // runs over rows the seed wrote before the columns existed. One product is `real`.
        await runner(scratch.url, ["--down", "--to", versionBeforeFacets()]);
        await scratch.sql`UPDATE product SET source = 'real' WHERE sku = 'FO-BQ-004'`;
        await runner(scratch.url);

        const rows = await scratch.sql<
          {
            sku: string;
            other_flowers: string[];
            other_colours: string[];
            allergen_note: boolean;
          }[]
        >`SELECT sku, other_flowers, other_colours, allergen_note FROM product ORDER BY sku`;
        const authored = new Map(
          (await STATIC.catalogue.products()).map((product) => [
            product.sku,
            {
              sku: product.sku,
              other_flowers: product.flowerTypes.slice(1),
              other_colours: product.colours.slice(1),
              allergen_note: product.allergenNote,
            },
          ]),
        );
        expect(rows).toHaveLength(84);
        for (const row of rows) {
          if (row.sku === "FO-BQ-004") {
            // The `real` row keeps its defaults: an admin's product is never touched.
            expect(row).toEqual({
              sku: "FO-BQ-004",
              other_flowers: [],
              other_colours: [],
              allergen_note: false,
            });
            expect(authored.get("FO-BQ-004")?.other_colours.length).toBe(2);
          } else {
            expect(row, row.sku).toEqual(authored.get(row.sku));
          }
        }

        // Put the row back to `seed` and let the seed restore it and the occasion order.
        await scratch.sql`UPDATE product SET source = 'seed' WHERE sku = 'FO-BQ-004'`;
        await runSeed(
          scratch.sql,
          buildSeedPlan(await readSeedTree(REPO_ROOT)),
        );
        const db = databaseSet(oneRequest(contextRead(pool, "app_web")));
        expect(byKey(await db.catalogue.products())).toStrictEqual(
          byKey(await STATIC.catalogue.products()),
        );
      }, 300_000);
    });
  },
);
