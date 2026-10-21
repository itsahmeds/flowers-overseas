/**
 * T-01 — `db:seed --insert-only`, the production refusal and the real-parent guard (spec 012b
 * §2.0 item 5, §2.2 "Insert-only seed", AC-1; TASK-292).
 *
 * The real writer (`seed/index.ts`'s `runSeed`, and the CLI for the refusal) runs the real plan
 * against a scratch database migrated by the real runner and seeded once. Every case compares
 * whole rows (`to_jsonb(t)::text`, `updated_at` included), so "unchanged" means byte-identical,
 * not "the column I looked at". Local, disposable server only (`support/scratch-db.ts`).
 */
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readSeedTree } from "../../seed/check.ts";
import {
  PRODUCTION_REFUSAL,
  runSeed,
  type SeedReport,
} from "../../seed/index.ts";
import { buildSeedPlan, type SeedTablePlan } from "../../seed/plan.ts";
import {
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const run = promisify(execFile);

/** Every row of every seeded table, as text, per table. */
async function snapshot(
  sql: Sql,
  plan: readonly SeedTablePlan[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  for (const { table } of plan) {
    const rows = await sql.unsafe<{ r: string }[]>(
      `SELECT to_jsonb(t)::text AS r FROM public."${table}" t`,
    );
    out.set(table, new Set(rows.map((row) => row.r)));
  }
  return out;
}

/** The rows of `after` that `before` lacks, and whether every `before` row survived, per table. */
function compare(
  before: Map<string, Set<string>>,
  after: Map<string, Set<string>>,
): { lost: Record<string, number>; added: Record<string, number> } {
  const lost: Record<string, number> = {};
  const added: Record<string, number> = {};
  for (const [table, rows] of before) {
    const next = after.get(table) ?? new Set<string>();
    lost[table] = [...rows].filter((row) => !next.has(row)).length;
    added[table] = [...next].filter((row) => !rows.has(row)).length;
  }
  return { lost, added };
}

const nonZero = (counts: Record<string, number>) =>
  Object.fromEntries(Object.entries(counts).filter(([, n]) => n !== 0));

function byTable(
  report: SeedReport,
  field: "inserted" | "updated" | "real" | "underReal",
) {
  return nonZero(
    Object.fromEntries(report.tables.map((t) => [t.table, t[field]])),
  );
}

/** A product's id by SKU. */
async function productId(sql: Sql, sku: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM product WHERE sku = ${sku}`;
  return row?.id ?? "";
}

describe.skipIf(server.url === undefined)(
  `T-01 — db:seed --insert-only and the real guard${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let plan: readonly SeedTablePlan[];

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "seedins");
      plan = buildSeedPlan(await readSeedTree(REPO_ROOT));
      await runSeed(scratch.sql, plan);
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("AC-1: with APP_ENV=production a plain seed exits non-zero naming --insert-only and writes nothing; --insert-only runs", async () => {
      // A missing row, so a run that wrote anything would show.
      await scratch.sql`
        DELETE FROM country_holiday WHERE ctid = (SELECT ctid FROM country_holiday ORDER BY date LIMIT 1)`;
      const before = await snapshot(scratch.sql, plan);
      const env = {
        ...process.env,
        APP_ENV: "production",
        DATABASE_URL_UNPOOLED: scratch.url,
      };
      const cli = resolve(REPO_ROOT, "seed/index.ts");
      const refused = await run(process.execPath, [cli], {
        cwd: REPO_ROOT,
        env,
        timeout: 120_000,
      }).then(
        () => ({ code: 0, stderr: "" }),
        (error: { code?: number; stderr?: string }) => ({
          code: error.code ?? -1,
          stderr: error.stderr ?? "",
        }),
      );
      expect(refused.code).toBe(1);
      expect(refused.stderr).toContain(PRODUCTION_REFUSAL);
      expect(
        nonZero(compare(before, await snapshot(scratch.sql, plan)).added),
      ).toEqual({});

      const { stdout } = await run(process.execPath, [cli, "--insert-only"], {
        cwd: REPO_ROOT,
        env,
        timeout: 120_000,
      });
      expect(stdout).toContain("(insert only, no row updated)");
      expect(stdout).toMatch(/: 1 inserted, 0 updated,/u);
    }, 240_000);

    it("AC-1: --insert-only restores missing rows and leaves every existing row byte-identical", async () => {
      // Edits a plain seed would put back, on rows no other case reads, and two missing rows.
      const edited = await productId(scratch.sql, "FO-BQ-004");
      await scratch.sql`UPDATE product SET stem_count = stem_count + 2 WHERE sku = 'FO-BQ-003'`;
      await scratch.sql`UPDATE product_translation SET name = name || ' edited'
        WHERE product_id = ${edited} AND locale_code = 'en'`;
      await scratch.sql`UPDATE city_translation SET name = 'Edited'
        WHERE slug = 'rome' AND locale_code = 'en'`;
      await scratch.sql`UPDATE country SET vat_rate_bp = 2300 WHERE iso2 = 'ES'`;
      await scratch.sql`UPDATE country_price SET retail_minor = retail_minor + 100
        WHERE id = (SELECT cp.id FROM country_price cp JOIN product p ON p.id = cp.product_id
                    WHERE p.sku = 'FO-BQ-005' ORDER BY cp.tier_key, cp.country_id LIMIT 1)`;
      await scratch.sql`DELETE FROM product_translation
        WHERE product_id = ${await productId(scratch.sql, "FO-BQ-006")} AND locale_code = 'en'`;
      await scratch.sql`
        DELETE FROM country_holiday WHERE ctid = (SELECT ctid FROM country_holiday ORDER BY date DESC LIMIT 1)`;

      const before = await snapshot(scratch.sql, plan);
      const report = await runSeed(scratch.sql, plan, { insertOnly: true });
      const after = await snapshot(scratch.sql, plan);

      expect(report.insertOnly).toBe(true);
      expect(byTable(report, "updated")).toEqual({});
      expect(byTable(report, "inserted")).toEqual({
        country_holiday: 1,
        product_translation: 1,
      });
      const { lost, added } = compare(before, after);
      expect(nonZero(lost)).toEqual({});
      expect(nonZero(added)).toEqual({
        country_holiday: 1,
        product_translation: 1,
      });

      // The edits were ones a plain seed changes, so the assertion above is not vacuous.
      const plain = await runSeed(scratch.sql, plan);
      expect(byTable(plain, "updated")).toEqual({
        city: 1,
        country: 1,
        country_price: 1,
        product: 1,
        product_translation: 1,
      });
    }, 240_000);

    it("AC-1: a real product's translations, tiers, prices and mappings survive a plain and an insert-only seed", async () => {
      const id = await productId(scratch.sql, "FO-BQ-010");
      await scratch.sql`UPDATE product SET source = 'real' WHERE id = ${id}`;
      // The seed writes this product's `en` copy; admin removed it, and a seed must not put it back.
      await scratch.sql`DELETE FROM product_translation
        WHERE product_id = ${id} AND locale_code = 'en'`;
      await scratch.sql`UPDATE product_tier SET sort = sort + 10 WHERE product_id = ${id}`;
      await scratch.sql`UPDATE country_price SET retail_minor = retail_minor + 1 WHERE product_id = ${id}`;
      await scratch.sql`UPDATE partner_catalog_mapping SET partner_payout_minor = 1 WHERE product_id = ${id}`;
      const children = async () =>
        scratch.sql.unsafe<{ r: string }[]>(
          `SELECT 'product_translation' AS t, to_jsonb(x)::text AS r FROM product_translation x WHERE product_id = $1
           UNION ALL SELECT 'product_tier', to_jsonb(x)::text FROM product_tier x WHERE product_id = $1
           UNION ALL SELECT 'country_price', to_jsonb(x)::text FROM country_price x WHERE product_id = $1
           UNION ALL SELECT 'mapping', to_jsonb(x)::text FROM partner_catalog_mapping x WHERE product_id = $1
           ORDER BY 1, 2`,
          [id],
        );
      const before = await children();
      expect(before.length).toBeGreaterThan(10);
      expect(before.some((row) => row.r.includes('"locale_code": "en"'))).toBe(
        false,
      );

      for (const options of [{}, { insertOnly: true }]) {
        const report = await runSeed(scratch.sql, plan, options);
        expect(await children()).toEqual(before);
        expect(byTable(report, "updated")).toEqual({});
        expect(byTable(report, "inserted")).toEqual({});
        expect(byTable(report, "real")).toEqual({ product: 1 });
        const under = byTable(report, "underReal");
        // Its `en` translation is not put back: the row is under a real product.
        expect(under["product_translation"]).toBe(1);
        expect(under["product_tier"]).toBeGreaterThan(0);
        expect(under["country_price"]).toBeGreaterThan(0);
        expect(under["partner_catalog_mapping"]).toBeGreaterThan(0);
      }
    }, 240_000);

    it("AC-1: a real country's occasion rules, city, florists and prices, and a real florist's coverage and mappings, survive both modes", async () => {
      await scratch.sql`UPDATE country SET source = 'real' WHERE iso2 = 'NL'`;
      const [nl] = await scratch.sql<
        { id: string }[]
      >`SELECT id FROM country WHERE iso2 = 'NL'`;
      const nlId = nl?.id ?? "";
      await scratch.sql`DELETE FROM occasion_country WHERE ctid =
        (SELECT ctid FROM occasion_country WHERE country_id = ${nlId} LIMIT 1)`;
      await scratch.sql`UPDATE city_translation SET name = 'Admin city' WHERE country_id = ${nlId}`;
      await scratch.sql`UPDATE country_price SET retail_minor = retail_minor + 7 WHERE country_id = ${nlId}`;
      await scratch.sql`UPDATE fulfillment_partner SET source = 'real' WHERE code = 'demo-de-1'`;
      await scratch.sql`UPDATE partner_coverage SET capacity_per_day = 2
        WHERE partner_id = (SELECT id FROM fulfillment_partner WHERE code = 'demo-de-1')`;
      await scratch.sql`UPDATE partner_catalog_mapping SET partner_payout_minor = 2
        WHERE partner_id = (SELECT id FROM fulfillment_partner WHERE code = 'demo-de-1')`;
      const subtree = async () =>
        scratch.sql.unsafe<{ r: string }[]>(
          `SELECT to_jsonb(x)::text AS r FROM country_holiday x WHERE country_id = $1
           UNION ALL SELECT to_jsonb(x)::text FROM occasion_country x WHERE country_id = $1
           UNION ALL SELECT to_jsonb(x)::text FROM city_translation x WHERE country_id = $1
           UNION ALL SELECT to_jsonb(x)::text FROM country_price x WHERE country_id = $1
           UNION ALL SELECT to_jsonb(x)::text FROM addon_country_price x WHERE country_id = $1
           UNION ALL SELECT to_jsonb(x)::text FROM fulfillment_partner x WHERE country_id = $1
           UNION ALL SELECT to_jsonb(x)::text FROM partner_coverage x
             WHERE partner_id = (SELECT id FROM fulfillment_partner WHERE code = 'demo-de-1')
           UNION ALL SELECT to_jsonb(x)::text FROM partner_catalog_mapping x
             WHERE partner_id = (SELECT id FROM fulfillment_partner WHERE code = 'demo-de-1')
           ORDER BY 1`,
          [nlId],
        );
      const before = await subtree();
      for (const options of [{}, { insertOnly: true }]) {
        const report = await runSeed(scratch.sql, plan, options);
        expect(await subtree()).toEqual(before);
        expect(byTable(report, "updated")).toEqual({});
        expect(byTable(report, "inserted")).toEqual({});
        expect(byTable(report, "real")).toMatchObject({
          country: 1,
          fulfillment_partner: 1,
          product: 1,
        });
        const under = byTable(report, "underReal");
        expect(under["occasion_country"]).toBeGreaterThan(0);
        expect(under["addon_country_price"]).toBeGreaterThan(0);
        expect(under["country_price"]).toBeGreaterThan(0);
        expect(under["city"]).toBe(1);
        expect(under["partner_coverage"]).toBe(1);
      }
    }, 240_000);
  },
);
