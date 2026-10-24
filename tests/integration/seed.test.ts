/**
 * T-29 and T-32 — `pnpm db:seed` is idempotent, never touches a `real` row, and writes what the
 * plan says (spec 002 AC-29, AC-32, AC-28's "second run reports zero"; TASK-026).
 *
 * The real writer (`seed/index.ts`'s `runSeed`) runs the real plan (`seed/plan.ts` over the
 * committed dataset) against a scratch database migrated by the real runner. Local, disposable
 * server only (`support/scratch-db.ts`).
 */
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readSeedTree } from "../../seed/check.ts";
import {
  formatSeedReport,
  runSeed,
  type SeedReport,
} from "../../seed/index.ts";
import {
  DEMO_PARTNERS_PER_COUNTRY,
  buildSeedPlan,
  type SeedTablePlan,
} from "../../seed/plan.ts";
import { occasionDate } from "../../src/modules/geo/occasions/evaluate.ts";
import { COUNTRIES } from "../../src/config/countries.ts";
import type { OccasionRule } from "../../seed/schema/index.ts";
import {
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const run = promisify(execFile);

/** The tables `plan/10` §4 and AC-29 name as carrying `source`, all of which the seed writes. */
const SOURCE_TABLES = [
  "country",
  "product",
  "country_price",
  "fulfillment_partner",
  "partner_catalog_mapping",
] as const;

function totals(report: SeedReport) {
  return report.tables.reduce(
    (sum, table) => ({
      inserted: sum.inserted + table.inserted,
      updated: sum.updated + table.updated,
      real: sum.real + table.real,
    }),
    { inserted: 0, updated: 0, real: 0 },
  );
}

/**
 * The products the hand-edit cases change, by SKU. The `source = 'real'` case never flips one of
 * them: a flipped row is left alone by design, so an edit on it reports `updated` 0 (TASK-268).
 */
const EDITED_SKU = { putBack: "FO-BQ-001", dryRun: "FO-BQ-002" } as const;

/**
 * The one row per table the `source = 'real'` case flips: a fixed pick by natural key where the
 * table has one, never a row another case reads or edits. Never `ORDER BY id` alone: ids are
 * `gen_random_uuid()`, so an id-ordered pick lands on a different row every run (PR 245's CI, on
 * Poland; TASK-268's, on the dry-run case's SKU, one run in 84).
 */
const REAL_PICK: Record<(typeof SOURCE_TABLES)[number], string> = {
  country: "iso2 <> 'PL' ORDER BY iso2",
  product: `sku NOT IN ('${EDITED_SKU.putBack}', '${EDITED_SKU.dryRun}') ORDER BY sku`,
  country_price: "true ORDER BY id",
  fulfillment_partner: "true ORDER BY id",
  partner_catalog_mapping: "true ORDER BY id",
};

/** Row count and an `updated_at` fingerprint per seeded table. */
async function fingerprint(
  sql: Sql,
  plan: readonly SeedTablePlan[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const { table } of plan) {
    const [row] = await sql.unsafe<{ n: number; f: string | null }[]>(
      `SELECT count(*)::int AS n,
              md5(string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text)) AS f
       FROM public."${table}" t`,
    );
    out[table] = `${String(row?.n)}:${row?.f ?? ""}`;
  }
  return out;
}

describe.skipIf(server.url === undefined)(
  `T-29, T-32 — db:seed${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let plan: readonly SeedTablePlan[];

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "seed");
      plan = buildSeedPlan(await readSeedTree(REPO_ROOT));
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("AC-29: three runs give identical counts and identical updated_at; runs two and three insert and update nothing", async () => {
      const first = await runSeed(scratch.sql, plan);
      expect(totals(first).inserted).toBeGreaterThan(0);
      const after1 = await fingerprint(scratch.sql, plan);
      const second = await runSeed(scratch.sql, plan);
      const after2 = await fingerprint(scratch.sql, plan);
      const third = await runSeed(scratch.sql, plan);
      const after3 = await fingerprint(scratch.sql, plan);
      expect(totals(second)).toEqual({ inserted: 0, updated: 0, real: 0 });
      expect(totals(third)).toEqual({ inserted: 0, updated: 0, real: 0 });
      expect(after2).toEqual(after1);
      expect(after3).toEqual(after1);
      expect(formatSeedReport(second)).toContain("0 inserted, 0 updated");
    }, 120_000);

    it("AC-29: a seeded value edited by hand is put back, and updated_at moves only on that row", async () => {
      await scratch.sql`UPDATE product SET stem_count = stem_count + 1 WHERE sku = ${EDITED_SKU.putBack}`;
      const report = await runSeed(scratch.sql, plan);
      const product = report.tables.find((t) => t.table === "product");
      expect(product?.updated).toBe(1);
      expect(totals(report)).toEqual({ inserted: 0, updated: 1, real: 0 });
    }, 120_000);

    it.each(SOURCE_TABLES)(
      "AC-29: a %s row flipped to source = 'real' is left exactly as it is",
      async (table) => {
        // Never Poland's row (the AC-32 case below reads its seeded VAT rate and cutoff) and never
        // a product a later case edits (`REAL_PICK`).
        const edit: Record<(typeof SOURCE_TABLES)[number], string> = {
          country: "vat_rate_bp = 1234",
          product: "stem_count = 99",
          country_price: "retail_minor = 12345",
          fulfillment_partner: "capacity_per_day = 3",
          partner_catalog_mapping: "partner_payout_minor = 1",
        };
        const [target] = await scratch.sql.unsafe<{ id: string }[]>(
          `UPDATE public."${table}" SET source = 'real', ${edit[table]}
           WHERE id = (SELECT id FROM public."${table}" WHERE source = 'seed' AND ${REAL_PICK[table]} LIMIT 1)
           RETURNING id`,
        );
        const before = await scratch.sql.unsafe<{ row: unknown }[]>(
          `SELECT to_jsonb(t) AS row FROM public."${table}" t WHERE id = $1`,
          [target?.id ?? ""],
        );
        const report = await runSeed(scratch.sql, plan);
        const after = await scratch.sql.unsafe<{ row: unknown }[]>(
          `SELECT to_jsonb(t) AS row FROM public."${table}" t WHERE id = $1`,
          [target?.id ?? ""],
        );
        expect(after).toEqual(before);
        expect(report.tables.find((t) => t.table === table)?.real).toBe(1);
        expect(totals(report).updated).toBe(0);
      },
      120_000,
    );

    it("AC-32: four locales, every country with countries.ts's status (spec 012b §5.1), its currency, VAT rate and zone, Poland's cutoff", async () => {
      const locales = await scratch.sql<{ code: string }[]>`
        SELECT code FROM locale ORDER BY code`;
      expect(locales.map((row) => row.code)).toEqual([
        "de",
        "en",
        "en-gb",
        "pl",
      ]);
      const countries = await scratch.sql<
        {
          iso2: string;
          status: string;
          currency_code: string;
          vat_rate_bp: number;
          iana_zone: string;
          cutoff: string | null;
        }[]
      >`SELECT iso2, status, currency_code, vat_rate_bp, iana_zone,
               same_day_cutoff_local::text AS cutoff
        FROM country ORDER BY iso2`;
      expect(countries.map((row) => row.iso2)).toEqual(
        COUNTRIES.map((country) => country.iso2).sort(),
      );
      // Spec 012b §5.1 "Seed" (TASK-292): the status is the registry's, so the database and the
      // static country registry agree (AC-2). One row is `real` from the previous case, and its
      // status was never touched by that case either.
      expect(
        Object.fromEntries(countries.map((row) => [row.iso2, row.status])),
      ).toEqual(
        Object.fromEntries(
          COUNTRIES.map((country) => [country.iso2, country.status]),
        ),
      );
      const pl = countries.find((row) => row.iso2 === "PL");
      expect(pl).toMatchObject({
        currency_code: "PLN",
        vat_rate_bp: 800,
        iana_zone: "Europe/Warsaw",
        cutoff: "14:00:00",
      });
      expect(
        countries
          .filter((row) => row.iso2 !== "PL")
          .every((row) => row.cutoff === null),
      ).toBe(true);
    });

    it("AC-32: 84 products split 40/14/8/10/12, each with an en name and slug and no de/pl row", async () => {
      const split = await scratch.sql<{ product_type: string; n: number }[]>`
        SELECT product_type, count(*)::int AS n FROM product GROUP BY product_type
        ORDER BY product_type`;
      expect(
        Object.fromEntries(split.map((r) => [r.product_type, r.n])),
      ).toEqual({
        arrangement: 14,
        bouquet: 40,
        funeral: 10,
        gift_set: 12,
        plant: 8,
      });
      const [en] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM product p
        JOIN product_translation t ON t.product_id = p.id AND t.locale_code = 'en'
        WHERE btrim(t.name) <> '' AND t.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`;
      expect(en?.n).toBe(84);
      const [foreign] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM product_translation WHERE locale_code IN ('de', 'pl')`;
      expect(foreign?.n).toBe(0);
    });

    it("AC-32: six add-ons priced in every country; a retail price for every (product, country)", async () => {
      const [addons] = await scratch.sql<{ n: number; priced: number }[]>`
        SELECT count(*)::int AS n,
               count(*) FILTER (WHERE (SELECT count(DISTINCT acp.country_id)
                                       FROM addon_country_price acp WHERE acp.addon_id = a.id)
                                      = (SELECT count(*) FROM country))::int AS priced
        FROM addon a`;
      expect(addons).toEqual({ n: 6, priced: 6 });
      const [missing] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM product p CROSS JOIN country c
        WHERE NOT EXISTS (SELECT 1 FROM country_price cp
                          WHERE cp.product_id = p.id AND cp.country_id = c.id
                            AND cp.surcharge_kind IS NULL AND cp.active_to IS NULL)`;
      expect(missing?.n).toBe(0);
    });

    it("AC-32: three demo partners per country, each covering its city and mapped for all 84 products", async () => {
      const partners = await scratch.sql<
        { iso2: string; partners: number; covered: number; products: number }[]
      >`SELECT c.iso2, count(DISTINCT f.id)::int AS partners,
               count(DISTINCT pc.partner_id)::int AS covered,
               min((SELECT count(DISTINCT m.product_id) FROM partner_catalog_mapping m
                    WHERE m.partner_id = f.id))::int AS products
        FROM country c
        JOIN fulfillment_partner f ON f.country_id = c.id AND f.status = 'demo'
        LEFT JOIN partner_coverage pc ON pc.partner_id = f.id
        GROUP BY c.iso2 ORDER BY c.iso2`;
      expect(partners).toHaveLength(COUNTRIES.length);
      for (const row of partners) {
        expect(row).toMatchObject({
          partners: DEMO_PARTNERS_PER_COUNTRY,
          covered: DEMO_PARTNERS_PER_COUNTRY,
          products: 84,
        });
      }
      const [badCurrency] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM partner_catalog_mapping m
        JOIN fulfillment_partner f ON f.id = m.partner_id
        WHERE m.currency_code <> f.payout_currency_code`;
      expect(badCurrency?.n).toBe(0);
    });

    it("AC-32: the occasion rules yield the plan/09 dates for the seeded countries; PL holidays 2026–2027", async () => {
      const rules = await scratch.sql<
        { key: string; iso2: string; rule: OccasionRule }[]
      >`SELECT o.key, c.iso2, oc.rule FROM occasion_country oc
        JOIN occasion o ON o.id = oc.occasion_id JOIN country c ON c.id = oc.country_id`;
      const dateOf = (key: string, iso2: string) => {
        const row = rules.find((r) => r.key === key && r.iso2 === iso2);
        return row === undefined ? undefined : occasionDate(row.rule, 2027);
      };
      expect(dateOf("valentines", "PL")).toBe("2027-02-14");
      expect(dateOf("womens_day", "PL")).toBe("2027-03-08");
      expect(dateOf("mothers_day", "DE")).toBe("2027-05-09");
      expect(dateOf("mothers_day", "PL")).toBe("2027-05-26");
      const holidays = await scratch.sql<{ y: string; n: number }[]>`
        SELECT to_char(h.date, 'YYYY') AS y, count(*)::int AS n FROM country_holiday h
        JOIN country c ON c.id = h.country_id WHERE c.iso2 = 'PL' GROUP BY 1 ORDER BY 1`;
      expect(
        holidays.filter((h) => h.y === "2026" || h.y === "2027").length,
      ).toBe(2);
    });

    it("AC-32 / §6: zero rows in review, delivery_proof and media_asset", async () => {
      const [row] = await scratch.sql<{ r: number; d: number; m: number }[]>`
        SELECT (SELECT count(*) FROM review)::int AS r,
               (SELECT count(*) FROM delivery_proof)::int AS d,
               (SELECT count(*) FROM media_asset)::int AS m`;
      expect(row).toEqual({ r: 0, d: 0, m: 0 });
    });

    it("--dry-run writes nothing and reports what a real run would; --only runs the named groups", async () => {
      // One scratch database per file: a second one would queue behind the round-trip suite's
      // exclusive roles lock (`support/scratch-db.ts`).
      // The edited row must still be a seeded one, or the seed rightly leaves it alone and the
      // `updated` 1 below cannot hold (TASK-268).
      const edited = await scratch.sql<{ source: string }[]>`
        UPDATE product SET stem_count = stem_count + 1 WHERE sku = ${EDITED_SKU.dryRun}
        RETURNING source`;
      expect(edited).toEqual([{ source: "seed" }]);
      const before = await fingerprint(scratch.sql, plan);
      const dry = await runSeed(scratch.sql, plan, { dryRun: true });
      expect(await fingerprint(scratch.sql, plan)).toEqual(before);
      expect(dry.dryRun).toBe(true);
      const real = await runSeed(scratch.sql, plan);
      expect(dry.tables.map((t) => [t.table, t.inserted, t.updated])).toEqual(
        real.tables.map((t) => [t.table, t.inserted, t.updated]),
      );
      expect(real.tables.find((t) => t.table === "product")?.updated).toBe(1);
      const only = await runSeed(scratch.sql, plan, { only: ["reference"] });
      expect(only.tables.map((t) => t.table)).toEqual([
        "locale",
        "currency",
        "invoice_profile",
      ]);
    }, 120_000);

    it("the CLI prints one line per table and exits 0 on a rerun", async () => {
      const { stdout } = await run(
        process.execPath,
        [resolve(REPO_ROOT, "seed/index.ts"), "--dry-run"],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, DATABASE_URL_UNPOOLED: scratch.url },
          timeout: 120_000,
        },
      );
      expect(stdout).toMatch(/^locale\s+rows\s+4/m);
      expect(stdout).toContain("(dry run, nothing written)");
    }, 120_000);
  },
);
