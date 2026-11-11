/**
 * Country go-live against a migrated PG16 (spec 012b §2.8, AC-25, AC-39 preflight half, §14
 * A-orchestrator-2026-10-20a; T-25 and T-41 integration halves; TASK-300).
 *
 *  - the preflight's facts, read from the database: one fixture per condition, each a fresh
 *    country built ready and then broken in exactly one way;
 *  - `setCountryStatus` through an admin-context runner: the typed code, the preflight re-run in
 *    the locked transaction, `first_live_at` set once, `invalidate()` once with the §5.4 flip set,
 *    the publish asked exactly when the existence diff is not empty, `live → demo`, `live →
 *    disabled` refused, `ops` refused, and `status_flip_guard()` refusing any other path;
 *  - `setGoLiveFiscalFields`: one audit row (`country.fiscal.set`, null before, the value after,
 *    the reason), no other column, `invalidate()` once with the country facts set, the preflight
 *    reason gone, `FISCAL_FIELD_ALREADY_SET` on a second save, refusals that change nothing.
 *
 * Fixture writes run as the server's superuser with row triggers off (`withoutTriggers`): a
 * florist's status and an approved photo are states only their own admin commands write. Every
 * assertion runs with triggers on. Runs on a throwaway local server only, never `.env.local`.
 */
import { randomBytes, randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  type CountryStatusDeps,
  type FiscalFieldsDeps,
  type PreflightSources,
  goLivePreflight,
  setCountryStatus,
  setGoLiveFiscalFields,
} from "../../src/modules/admin/countries.ts";
import type { AdminRunner } from "../../src/modules/admin/users.ts";
import { commandTags } from "../../src/lib/command-tags.ts";
import * as make from "./support/rows.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
  withoutTriggers,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

const SOURCES: PreflightSources = {
  corridorReviewed: () => true,
  sanctioned: () => false,
};

let codeCounter = 0;
/** A fresh two-letter code per read-only fixture (`QA`, `QB`, …, `RA`, …): not a destination. */
function nextIso2(): string {
  const first = String.fromCharCode(81 + Math.floor(codeCounter / 26));
  const second = String.fromCharCode(65 + (codeCounter % 26));
  codeCounter += 1;
  return `${first}${second}`;
}

/*
 * A command that saves returns its §5.4 tags, and a tag names a configured destination
 * (`cacheTagsFor`). So each test whose command saves takes one of the seven real codes, once (the
 * scratch database holds no seed, so none exists before).
 */
const DESTINATIONS = ["PL", "DE", "FR", "ES", "IT", "RO", "NL"];
function nextDestination(): string {
  const code = DESTINATIONS.shift();
  if (code === undefined) throw new Error("no destination code left");
  return code;
}

interface Built {
  readonly iso2: string;
  readonly countryId: string;
  readonly partnerId: string;
  readonly productIds: readonly string[];
}

/** A demo country with every §2.8 condition met: operations, both fiscal fields, one real florist, six saleable products. */
async function readyCountry(
  tx: Tx,
  iso2: string,
  products = 6,
): Promise<Built> {
  await make.base(tx);
  const [country] = await tx<{ id: string }[]>`
    INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone, same_day_cutoff_local,
                         delivery_days, sunday_delivery, supply_model, status)
    VALUES (${iso2}, 'PLN', 800, 'Europe/Warsaw', '14:00', '{1,2,3,4,5,6}', 'none', 'principal',
            'demo')
    RETURNING id`;
  const countryId = country?.id ?? "";
  const [city] = await tx<{ id: string }[]>`
    INSERT INTO city (country_id) VALUES (${countryId}) RETURNING id`;
  const partnerId = await make.partner(tx, countryId, "active");
  await tx`INSERT INTO partner_coverage (partner_id, city_id) VALUES (${partnerId}, ${city?.id ?? ""})`;
  const productIds: string[] = [];
  for (let index = 0; index < products; index += 1) {
    const [product] = await tx<{ id: string }[]>`
      INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                           substitution_class, freshness_days, status)
      VALUES (${make.unique(`FO-${iso2}-`)}, 'bouquet', 'roses', 'red', 'classic', 'classic',
              'main_flower', 5, 'active')
      RETURNING id`;
    const productId = product?.id ?? "";
    productIds.push(productId);
    await tx`
      INSERT INTO country_price (product_id, country_id, retail_minor, currency_code, vat_rate_bp,
                                 active_from)
      VALUES (${productId}, ${countryId}, 19900, 'PLN', 800, DATE '2026-01-01')`;
    const [asset] = await tx<{ id: string }[]>`
      INSERT INTO media_asset (kind, bucket, object_key, mime, width, height, bytes,
                               checksum_sha256, visibility, source, review_state, depicts,
                               reviewed_by, reviewed_at)
      VALUES ('product', 'fo-media', ${`it/${randomUUID()}.jpg`}, 'image/jpeg', 800, 800, 1000,
              ${randomBytes(32).toString("hex")}, 'public', 'photo', 'approved', 'product',
              'integration test', now())
      RETURNING id`;
    await tx`
      INSERT INTO product_media (product_id, media_asset_id, is_primary)
      VALUES (${productId}, ${asset?.id ?? ""}, true)`;
    await tx`
      INSERT INTO partner_catalog_mapping (partner_id, product_id, partner_payout_minor,
                                           currency_code)
      VALUES (${partnerId}, ${productId}, 9000, 'PLN')`;
  }
  return { iso2, countryId, partnerId, productIds };
}

describe.skipIf(server.url === undefined)(
  `country go-live${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let run: AdminRunner;
    const adminId = randomUUID();
    const admin = {
      userId: adminId,
      requestId: "it-country-go-live",
      roles: ["admin"] as const,
    };

    async function fixture(body: (tx: Tx) => Promise<unknown>): Promise<void> {
      await withoutTriggers(scratch.sql, body);
    }

    async function built(products = 6, iso2 = nextIso2()): Promise<Built> {
      let result: Built | undefined;
      await fixture(async (tx) => {
        result = await readyCountry(tx, iso2, products);
      });
      if (result === undefined) throw new Error("fixture not built");
      return result;
    }

    async function countryRow(iso2: string) {
      const [row] = await scratch.sql<
        {
          status: string;
          vat_rate_bp: number;
          supply_model: string | null;
          iana_zone: string;
          same_day_cutoff_local: string | null;
          delivery_days: string[];
          sunday_delivery: string;
          guide_published: boolean;
          currency_code: string;
          first_live_at: Date | null;
        }[]
      >`SELECT status, vat_rate_bp, supply_model, iana_zone, same_day_cutoff_local::text,
               delivery_days, sunday_delivery, guide_published, currency_code, first_live_at
          FROM country WHERE iso2 = ${iso2}`;
      if (row === undefined) throw new Error(`no country ${iso2}`);
      return row;
    }

    async function auditRows(iso2: string, action: string) {
      return scratch.sql<
        {
          before: Record<string, unknown> | null;
          after: Record<string, unknown> | null;
          reason: string | null;
        }[]
      >`SELECT a.before, a.after, a.reason FROM audit_log a
          JOIN country c ON c.id::text = a.entity_id
         WHERE a.entity_table = 'country' AND a.action = ${action} AND c.iso2 = ${iso2}
         ORDER BY a.at`;
    }

    function statusDeps(
      overrides: Partial<CountryStatusDeps> = {},
    ): CountryStatusDeps & {
      invalidate: ReturnType<typeof vi.fn>;
      requestPublish: ReturnType<typeof vi.fn>;
    } {
      return {
        run,
        invalidate: vi.fn(() => Promise.resolve()),
        existenceChanged: () => Promise.resolve(true),
        requestPublish: vi.fn(() => Promise.resolve(undefined)),
        sources: SOURCES,
        ...overrides,
      } as never;
    }

    function fiscalDeps(): FiscalFieldsDeps & {
      invalidate: ReturnType<typeof vi.fn>;
    } {
      return { run, invalidate: vi.fn(() => Promise.resolve()) } as never;
    }

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "golive");
      await scratch.sql`INSERT INTO users (id, email) VALUES (${adminId}, 'founder@example.test')`;
      run = (context, fn) =>
        scratch.sql.begin(async (tx) => {
          await tx`SELECT set_config('app.audit_action', ${context.action}, true)`;
          await tx`SELECT set_config('app.audit_reason', ${context.reason ?? ""}, true)`;
          await asApp(tx, {
            role: "admin",
            ...(context.userId === undefined ? {} : { userId: context.userId }),
          });
          return fn(drizzleOver(tx, scratch.sql));
        }) as never;
    }, 300_000);

    afterAll(async () => {
      await scratch?.drop();
    });

    describe("T-25, T-41: the preflight, one fixture per condition", () => {
      it("a ready country has no reason, and the read changes no row", async () => {
        const country = await built();
        const before = await countryRow(country.iso2);
        expect(
          await goLivePreflight(admin, country.iso2, run, SOURCES),
        ).toEqual({
          iso2: country.iso2,
          reasons: [],
          realFlorists: 1,
          saleableProducts: 6,
          productFloor: 6,
        });
        expect(await countryRow(country.iso2)).toEqual(before);
      });

      it("operations: no same-day cutoff", async () => {
        const country = await built();
        await fixture(
          (tx) =>
            tx`UPDATE country SET same_day_cutoff_local = NULL WHERE iso2 = ${country.iso2}`,
        );
        expect(
          (await goLivePreflight(admin, country.iso2, run, SOURCES))?.reasons,
        ).toEqual(["operationsIncomplete"]);
      });

      it("operations: no delivery day", async () => {
        const country = await built();
        await fixture(
          (tx) =>
            tx`UPDATE country SET delivery_days = '{}' WHERE iso2 = ${country.iso2}`,
        );
        expect(
          (await goLivePreflight(admin, country.iso2, run, SOURCES))?.reasons,
        ).toEqual(["operationsIncomplete"]);
      });

      it("supply model not set", async () => {
        const country = await built();
        await fixture(
          (tx) =>
            tx`UPDATE country SET supply_model = NULL WHERE iso2 = ${country.iso2}`,
        );
        expect(
          (await goLivePreflight(admin, country.iso2, run, SOURCES))?.reasons,
        ).toEqual(["supplyModelMissing"]);
      });

      it("VAT rate: the column is NOT NULL (0002), so the database never holds the missing state", async () => {
        const country = await built();
        await expect(
          fixture(
            (tx) =>
              tx`UPDATE country SET vat_rate_bp = NULL WHERE iso2 = ${country.iso2}`,
          ),
        ).rejects.toMatchObject({ code: "23502" });
      });

      it("the only florist is a demo florist: no real florist, so nothing can be bought", async () => {
        const country = await built();
        await fixture(
          (tx) =>
            tx`UPDATE fulfillment_partner SET status = 'demo' WHERE id = ${country.partnerId}`,
        );
        expect(
          await goLivePreflight(admin, country.iso2, run, SOURCES),
        ).toMatchObject({
          reasons: ["noRealFlorist", "tooFewSaleableProducts"],
          realFlorists: 0,
          saleableProducts: 0,
        });
      });

      it("the real florist is paused (a live country's read-only check)", async () => {
        const country = await built();
        await fixture(async (tx) => {
          await tx`UPDATE fulfillment_partner SET status = 'paused' WHERE id = ${country.partnerId}`;
          await tx`UPDATE country SET status = 'live' WHERE iso2 = ${country.iso2}`;
        });
        const before = await countryRow(country.iso2);
        expect(
          (await goLivePreflight(admin, country.iso2, run, SOURCES))?.reasons,
        ).toEqual(["noRealFlorist", "tooFewSaleableProducts"]);
        expect(await countryRow(country.iso2)).toEqual(before);
      });

      it("five saleable products: fewer than the floor", async () => {
        const country = await built(5);
        expect(
          await goLivePreflight(admin, country.iso2, run, SOURCES),
        ).toMatchObject({
          reasons: ["tooFewSaleableProducts"],
          saleableProducts: 5,
        });
      });

      it.each([
        [
          "a draft product",
          (built: Built) =>
            `UPDATE product SET status = 'draft' WHERE id = '${built.productIds[0] ?? ""}'`,
        ],
        [
          "a primary photo not approved",
          (built: Built) =>
            `UPDATE media_asset SET review_state = 'pending', reviewed_by = NULL, reviewed_at = NULL
              WHERE id IN (SELECT media_asset_id FROM product_media
                            WHERE product_id = '${built.productIds[0] ?? ""}')`,
        ],
        [
          "a price that has closed",
          (built: Built) =>
            `UPDATE country_price SET active_to = DATE '2026-02-01'
              WHERE product_id = '${built.productIds[0] ?? ""}'`,
        ],
        [
          "a mapping that cannot fulfil",
          (built: Built) =>
            `UPDATE partner_catalog_mapping SET can_fulfil = false
              WHERE product_id = '${built.productIds[0] ?? ""}'`,
        ],
      ])("T-41: %s does not count as saleable", async (_name, statement) => {
        const country = await built();
        await fixture((tx) => tx.unsafe(statement(country)));
        expect(
          await goLivePreflight(admin, country.iso2, run, SOURCES),
        ).toMatchObject({
          reasons: ["tooFewSaleableProducts"],
          saleableProducts: 5,
        });
      });

      it("the English guide is not reviewed in its live state", async () => {
        const country = await built();
        expect(
          (
            await goLivePreflight(admin, country.iso2, run, {
              ...SOURCES,
              corridorReviewed: () => false,
            })
          )?.reasons,
        ).toEqual(["corridorNotReviewed"]);
      });

      it("the country is on the sanctions list", async () => {
        const country = await built();
        expect(
          (
            await goLivePreflight(admin, country.iso2, run, {
              ...SOURCES,
              sanctioned: (iso2) => iso2 === country.iso2,
            })
          )?.reasons,
        ).toEqual(["sanctioned"]);
      });

      it("an unknown country has no preflight", async () => {
        expect(
          await goLivePreflight(admin, "ZZ", run, SOURCES),
        ).toBeUndefined();
      });
    });

    describe("T-25: setCountryStatus", () => {
      const goLive = (iso2: string, confirmCode?: string) => ({
        iso2,
        from: "demo",
        to: "live",
        ...(confirmCode === undefined ? {} : { confirmCode }),
      });

      it("refuses a typed code that is not the ISO code, and changes nothing", async () => {
        const country = await built();
        const before = await countryRow(country.iso2);
        for (const typed of [undefined, "", "P", country.iso2.toLowerCase()]) {
          const deps = statusDeps();
          expect(
            await setCountryStatus(admin, goLive(country.iso2, typed), deps),
          ).toEqual({ ok: false, reason: "mismatch" });
          expect(deps.invalidate).not.toHaveBeenCalled();
          expect(deps.requestPublish).not.toHaveBeenCalled();
        }
        expect(await countryRow(country.iso2)).toEqual(before);
        expect(await auditRows(country.iso2, "country.status_changed")).toEqual(
          [],
        );
      });

      it("refuses while any preflight reason remains, naming them, and changes nothing", async () => {
        const country = await built(5);
        const deps = statusDeps();
        expect(
          await setCountryStatus(
            admin,
            goLive(country.iso2, country.iso2),
            deps,
          ),
        ).toEqual({
          ok: false,
          reason: "preflight",
          reasons: ["tooFewSaleableProducts"],
        });
        expect((await countryRow(country.iso2)).status).toBe("demo");
        expect(deps.invalidate).not.toHaveBeenCalled();
      });

      it("refuses ops (no country.status) before any read", async () => {
        const country = await built();
        const deps = statusDeps();
        expect(
          await setCountryStatus(
            { ...admin, roles: ["ops"] },
            goLive(country.iso2, country.iso2),
            deps,
          ),
        ).toEqual({ ok: false, reason: "forbidden" });
        expect((await countryRow(country.iso2)).status).toBe("demo");
      });

      it("a stale page (the status moved since) is a conflict", async () => {
        const country = await built();
        expect(
          await setCountryStatus(
            admin,
            { iso2: country.iso2, from: "live", to: "demo" },
            statusDeps(),
          ),
        ).toEqual({ ok: false, reason: "conflict" });
      });

      it("demo → live with the code: first_live_at once, the flip tags once, one publish request", async () => {
        const country = await built(6, nextDestination());
        const deps = statusDeps();
        const result = await setCountryStatus(
          admin,
          goLive(country.iso2, ` ${country.iso2} `),
          deps,
        );
        expect(result).toMatchObject({
          ok: true,
          status: "live",
          publish: { kind: "requested" },
        });
        const row = await countryRow(country.iso2);
        expect(row.status).toBe("live");
        expect(row.first_live_at).toBeInstanceOf(Date);
        expect(deps.invalidate).toHaveBeenCalledTimes(1);
        expect(deps.invalidate).toHaveBeenCalledWith(
          commandTags({ kind: "countryStatus", iso2: country.iso2 }),
        );
        expect(deps.invalidate.mock.calls[0]?.[0]).toEqual(
          expect.arrayContaining([
            `country:${country.iso2}`,
            `corridor:${country.iso2}`,
            `catalog:${country.iso2}`,
            "hub:en",
            "home:en",
            "sitemap",
          ]),
        );
        expect(deps.requestPublish).toHaveBeenCalledTimes(1);
        const audit = await auditRows(country.iso2, "country.status_changed");
        expect(audit).toHaveLength(1);
        expect(audit[0]?.before).toMatchObject({ status: "demo" });
        expect(audit[0]?.after).toMatchObject({ status: "live" });

        // live → demo: the rollback keeps first_live_at; demo → live again does not move it.
        const firstLiveAt = row.first_live_at;
        expect(
          await setCountryStatus(
            admin,
            { iso2: country.iso2, from: "live", to: "demo" },
            statusDeps({ existenceChanged: () => Promise.resolve(false) }),
          ),
        ).toMatchObject({
          ok: true,
          status: "demo",
          publish: { kind: "notNeeded" },
        });
        expect((await countryRow(country.iso2)).first_live_at).toEqual(
          firstLiveAt,
        );
        await setCountryStatus(
          admin,
          goLive(country.iso2, country.iso2),
          statusDeps(),
        );
        const again = await countryRow(country.iso2);
        expect(again.status).toBe("live");
        expect(again.first_live_at).toEqual(firstLiveAt);
      });

      it("asks for no publish when the existence diff is empty", async () => {
        const country = await built(6, nextDestination());
        const deps = statusDeps({
          existenceChanged: () => Promise.resolve(false),
        });
        expect(
          await setCountryStatus(
            admin,
            goLive(country.iso2, country.iso2),
            deps,
          ),
        ).toMatchObject({ ok: true, publish: { kind: "notNeeded" } });
        expect(deps.requestPublish).not.toHaveBeenCalled();
        expect(deps.invalidate).toHaveBeenCalledTimes(1);
      });

      it("a refused publish leaves the flip done and names the code", async () => {
        const country = await built(6, nextDestination());
        const deps = statusDeps({
          requestPublish: vi.fn(() => Promise.resolve("PUBLISH_RUN_OPEN")),
        });
        expect(
          await setCountryStatus(
            admin,
            goLive(country.iso2, country.iso2),
            deps,
          ),
        ).toMatchObject({
          ok: true,
          status: "live",
          publish: { kind: "notStarted", code: "PUBLISH_RUN_OPEN" },
        });
      });

      it("live → disabled is refused and changes nothing", async () => {
        const country = await built(6, nextDestination());
        await setCountryStatus(
          admin,
          goLive(country.iso2, country.iso2),
          statusDeps(),
        );
        const deps = statusDeps();
        expect(
          await setCountryStatus(
            admin,
            { iso2: country.iso2, from: "live", to: "disabled" },
            deps,
          ),
        ).toEqual({ ok: false, reason: "liveToDisabled" });
        expect((await countryRow(country.iso2)).status).toBe("live");
        expect(deps.invalidate).not.toHaveBeenCalled();
      });

      it("demo → disabled → demo, without the preflight", async () => {
        const country = await built(0, nextDestination());
        expect(
          await setCountryStatus(
            admin,
            { iso2: country.iso2, from: "demo", to: "disabled" },
            statusDeps(),
          ),
        ).toMatchObject({ ok: true, status: "disabled" });
        expect(
          await setCountryStatus(
            admin,
            { iso2: country.iso2, from: "disabled", to: "demo" },
            statusDeps(),
          ),
        ).toMatchObject({ ok: true, status: "demo" });
      });

      it("status_flip_guard() refuses a status change outside the admin context", async () => {
        const country = await built();
        await expect(
          scratch.sql`UPDATE country SET status = 'live' WHERE iso2 = ${country.iso2}`,
        ).rejects.toBeInstanceOf(postgres.PostgresError);
        expect((await countryRow(country.iso2)).status).toBe("demo");
      });
    });

    describe("T-25: setGoLiveFiscalFields", () => {
      const REASON = "Accountant's answer, email of 2026-11-10, filed in Drive";

      async function noSupply(iso2?: string): Promise<Built> {
        const country = await built(6, iso2);
        await fixture(
          (tx) =>
            tx`UPDATE country SET supply_model = NULL WHERE iso2 = ${country.iso2}`,
        );
        return country;
      }

      it("a valid save: one audit row, no other column, the facts tags once, the reason gone", async () => {
        const country = await noSupply(nextDestination());
        expect(
          (await goLivePreflight(admin, country.iso2, run, SOURCES))?.reasons,
        ).toEqual(["supplyModelMissing"]);
        const before = await countryRow(country.iso2);
        const deps = fiscalDeps();
        expect(
          await setGoLiveFiscalFields(
            admin,
            { iso2: country.iso2, supplyModel: "agent", reason: REASON },
            deps,
          ),
        ).toEqual({ ok: true, iso2: country.iso2 });
        expect(await countryRow(country.iso2)).toEqual({
          ...before,
          supply_model: "agent",
        });
        const audit = await auditRows(country.iso2, "country.fiscal.set");
        expect(audit).toHaveLength(1);
        expect(audit[0]?.before).toMatchObject({ supply_model: null });
        expect(audit[0]?.after).toMatchObject({ supply_model: "agent" });
        expect(audit[0]?.reason).toBe(REASON);
        // Only the field, the row's own `updated_at` and the admin write's `source` mark.
        expect(Object.keys(audit[0]?.after ?? {}).sort()).toEqual([
          "source",
          "supply_model",
          "updated_at",
        ]);
        expect(deps.invalidate).toHaveBeenCalledTimes(1);
        expect(deps.invalidate).toHaveBeenCalledWith([
          `catalog:${country.iso2}`,
          `corridor:${country.iso2}`,
          `country:${country.iso2}`,
        ]);
        expect(
          (await goLivePreflight(admin, country.iso2, run, SOURCES))?.reasons,
        ).toEqual([]);
      });

      it("a second save of a set field raises FISCAL_FIELD_ALREADY_SET and writes nothing", async () => {
        const country = await built();
        const before = await countryRow(country.iso2);
        for (const fields of [
          { supplyModel: "principal" },
          { vatRateBp: 700 },
        ]) {
          const deps = fiscalDeps();
          expect(
            await setGoLiveFiscalFields(
              admin,
              { iso2: country.iso2, ...fields, reason: REASON },
              deps,
            ),
          ).toMatchObject({ ok: false, reason: "FISCAL_FIELD_ALREADY_SET" });
          expect(deps.invalidate).not.toHaveBeenCalled();
        }
        expect(await countryRow(country.iso2)).toEqual(before);
        expect(await auditRows(country.iso2, "country.fiscal.set")).toEqual([]);
      });

      it("a save naming a set field and a null one writes neither", async () => {
        const country = await noSupply();
        const before = await countryRow(country.iso2);
        expect(
          await setGoLiveFiscalFields(
            admin,
            {
              iso2: country.iso2,
              vatRateBp: 700,
              supplyModel: "agent",
              reason: REASON,
            },
            fiscalDeps(),
          ),
        ).toEqual({
          ok: false,
          reason: "FISCAL_FIELD_ALREADY_SET",
          fields: ["vatRateBp"],
        });
        expect(await countryRow(country.iso2)).toEqual(before);
      });

      it.each([
        [
          "ops",
          { roles: ["ops"] as const },
          { supplyModel: "agent", reason: REASON },
          "forbidden",
        ],
        [
          "an empty reason",
          {},
          { supplyModel: "agent", reason: "  " },
          "invalid",
        ],
        [
          "supplyModel seller",
          {},
          { supplyModel: "seller", reason: REASON },
          "invalid",
        ],
        ["vatRateBp -1", {}, { vatRateBp: -1, reason: REASON }, "invalid"],
        [
          "vatRateBp 10001",
          {},
          { vatRateBp: 10_001, reason: REASON },
          "invalid",
        ],
        ["vatRateBp 8.5", {}, { vatRateBp: 8.5, reason: REASON }, "invalid"],
      ])(
        "refuses %s with no row changed",
        async (_name, who, fields, reason) => {
          const country = await noSupply();
          const before = await countryRow(country.iso2);
          const deps = fiscalDeps();
          expect(
            await setGoLiveFiscalFields(
              { ...admin, ...who },
              { iso2: country.iso2, ...fields },
              deps,
            ),
          ).toMatchObject({ ok: false, reason });
          expect(await countryRow(country.iso2)).toEqual(before);
          expect(deps.invalidate).not.toHaveBeenCalled();
          expect(await auditRows(country.iso2, "country.fiscal.set")).toEqual(
            [],
          );
        },
      );
    });
  },
);
