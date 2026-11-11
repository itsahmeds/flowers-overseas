/**
 * Migration `0044_catalogue_cms` against a migrated and seeded Postgres 16 (spec 012b §5.1 item 3;
 * AC-39's database half, T-41's view and role cases; the F2 price-row guard; `first_live_at`;
 * `publish_run`'s one-open-run index; TASK-294).
 *
 * Fixture writes run as the server's own superuser with `session_replication_role = replica`
 * where a fixture must step past spec 012's status-flip guard (a florist's status changes only in
 * admin); every assertion then reads with triggers on, as the application does.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  COUNTRIES,
  installCountryRegistry,
  uninstallCountryRegistry,
} from "../../src/config/countries.ts";
import {
  availability,
  isSaleable,
} from "../../src/modules/catalog/availability.ts";
import { createDbSaleabilityProvider } from "../../src/modules/catalog/db/saleable.ts";
import { withSaleability } from "../../src/modules/catalog/providers.ts";
import { readSeedTree } from "../../seed/check.ts";
import { runSeed } from "../../seed/index.ts";
import { buildSeedPlan } from "../../seed/plan.ts";
import {
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
  withoutTriggers,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();
const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** `url` with its user and password replaced. */
function asLogin(url: string, user: string, password: string): string {
  const parsed = new URL(url);
  parsed.username = user;
  parsed.password = password;
  return parsed.toString();
}

/** The Postgres error a statement raised, or `undefined` when it succeeded. */
async function failure(
  statement: PromiseLike<unknown>,
): Promise<{ code: string; message: string } | undefined> {
  try {
    await statement;
    return undefined;
  } catch (error) {
    if (error instanceof postgres.PostgresError) {
      return { code: error.code, message: error.message };
    }
    throw error;
  }
}

interface Fixture {
  readonly partnerId: string;
  readonly productId: string;
  readonly countryId: string;
}

describe.skipIf(server.url === undefined)(
  `0044_catalogue_cms — saleable_offer, first_active_at, the price guard, publish_run${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let build: Sql;
    let fixture: Fixture;

    /** Run `body` with triggers off: fixture set-up only. */
    async function asFixture(
      body: (tx: postgres.TransactionSql) => Promise<unknown>,
    ) {
      await scratch.sql.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await body(tx);
      });
    }

    /** The view's tiers for the fixture's product and country. */
    async function offeredTiers(sql: Sql = scratch.sql): Promise<string[]> {
      const rows = await sql<{ tier_key: string | null }[]>`
        SELECT tier_key FROM public.saleable_offer
        WHERE product_id = ${fixture.productId} AND country_id = ${fixture.countryId}
        ORDER BY tier_key`;
      return rows.map((row) => row.tier_key ?? "");
    }

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "cms");
      await runSeed(scratch.sql, buildSeedPlan(await readSeedTree(REPO_ROOT)));
      const password = randomBytes(12).toString("hex");
      await scratch.sql.unsafe(
        `ALTER ROLE app_build LOGIN PASSWORD '${password}'`,
      );
      build = postgres(asLogin(scratch.url, "app_build", password), {
        max: 1,
        onnotice: () => undefined,
      });
      // One seeded (demo) Polish florist with a mapping and capital coverage, and a mapped product.
      const [row] = await scratch.sql<Fixture[]>`
        SELECT p.id AS "partnerId", m.product_id AS "productId", c.id AS "countryId"
        FROM public.fulfillment_partner p
        JOIN public.country c ON c.id = p.country_id AND c.iso2 = 'PL'
        JOIN public.partner_catalog_mapping m ON m.partner_id = p.id AND m.can_fulfil
        WHERE p.status = 'demo'
        ORDER BY p.code, m.product_id
        LIMIT 1`;
      if (row === undefined)
        throw new Error("the seed has no Polish demo florist");
      fixture = row;
    }, 600_000);

    afterAll(async () => {
      await build?.end({ timeout: 5 });
      await scratch?.sql.unsafe("ALTER ROLE app_build NOLOGIN PASSWORD NULL");
      await scratch?.drop();
    });

    it("AC-39: a seeded demo florist makes nothing saleable; the view is empty on the seed", async () => {
      const [{ count } = { count: -1 }] = await scratch.sql<
        { count: number }[]
      >`
        SELECT count(*)::int AS count FROM public.saleable_offer`;
      expect(count).toBe(0);
    });

    it("F2: a plain seed never rewrites the amount of an existing price row, and writes the rest", async () => {
      const [price] = await scratch.sql<
        { id: string; retail_minor: string; vat_rate_bp: number }[]
      >`
        SELECT id, retail_minor::text, vat_rate_bp FROM public.country_price
        WHERE product_id = ${fixture.productId} AND active_to IS NULL ORDER BY id LIMIT 1`;
      const id = price?.id ?? "";
      await withoutTriggers(
        scratch.sql,
        (tx) => tx`
        UPDATE public.country_price SET retail_minor = retail_minor + 1000, vat_rate_bp = 1
        WHERE id = ${id}`,
      );
      await runSeed(scratch.sql, buildSeedPlan(await readSeedTree(REPO_ROOT)));
      const [after] = await scratch.sql<
        { retail_minor: string; vat_rate_bp: number }[]
      >`
        SELECT retail_minor::text, vat_rate_bp FROM public.country_price WHERE id = ${id}`;
      expect(after?.retail_minor).toBe(
        String(BigInt(price?.retail_minor ?? "0") + 1000n),
      );
      expect(after?.vat_rate_bp).toBe(price?.vat_rate_bp);
      await withoutTriggers(
        scratch.sql,
        (tx) => tx`
        UPDATE public.country_price SET retail_minor = ${price?.retail_minor ?? "0"}::bigint
        WHERE id = ${id}`,
      );
    }, 240_000);

    it("AC-39: an active florist with a fulfilling mapping and coverage lists exactly its tiers; paused, can_fulfil off or no coverage list none", async () => {
      const mappedTiers = await scratch.sql<{ tier_key: string | null }[]>`
        SELECT DISTINCT coalesce(m.tier_key, t.tier_key) AS tier_key
        FROM public.partner_catalog_mapping m
        LEFT JOIN public.product_tier t ON t.product_id = m.product_id AND m.tier_key IS NULL
        WHERE m.partner_id = ${fixture.partnerId} AND m.product_id = ${fixture.productId}
          AND m.can_fulfil
        ORDER BY 1`;
      const expected = mappedTiers.map((row) => row.tier_key ?? "");
      expect(expected.length).toBeGreaterThan(0);

      await asFixture(
        (tx) => tx`
        UPDATE public.fulfillment_partner SET status = 'active' WHERE id = ${fixture.partnerId}`,
      );
      expect(await offeredTiers()).toEqual(expected);

      await asFixture(
        (tx) => tx`
        UPDATE public.fulfillment_partner SET status = 'paused' WHERE id = ${fixture.partnerId}`,
      );
      expect(await offeredTiers()).toEqual([]);

      await asFixture(
        (tx) => tx`
        UPDATE public.fulfillment_partner SET status = 'active' WHERE id = ${fixture.partnerId}`,
      );
      await scratch.sql`
        UPDATE public.partner_catalog_mapping SET can_fulfil = false
        WHERE partner_id = ${fixture.partnerId} AND product_id = ${fixture.productId}`;
      expect(await offeredTiers()).toEqual([]);
      await scratch.sql`
        UPDATE public.partner_catalog_mapping SET can_fulfil = true
        WHERE partner_id = ${fixture.partnerId} AND product_id = ${fixture.productId}`;
      expect(await offeredTiers()).toEqual(expected);

      // Coverage moved out of the country: nothing in Poland.
      const coverage = await scratch.sql<{ id: string; city_id: string }[]>`
        SELECT id, city_id FROM public.partner_coverage WHERE partner_id = ${fixture.partnerId}`;
      await asFixture(
        (tx) =>
          tx`DELETE FROM public.partner_coverage WHERE partner_id = ${fixture.partnerId}`,
      );
      expect(await offeredTiers()).toEqual([]);
      await asFixture(async (tx) => {
        for (const row of coverage) {
          await tx`INSERT INTO public.partner_coverage (id, partner_id, city_id)
                   VALUES (${row.id}, ${fixture.partnerId}, ${row.city_id})`;
        }
      });
      expect(await offeredTiers()).toEqual(expected);
    });

    it("AC-39: through the module, only the active florist's product is saleable in a live country, and pausing it ends that", async () => {
      // Poland live for this case (the registry the deployment would install), the fixture
      // florist active (left so by the case above), the database's saleability term composed.
      installCountryRegistry(
        COUNTRIES.map((country) =>
          country.iso2 === "PL" ? { ...country, status: "live" } : country,
        ),
      );
      const [{ sku } = { sku: "" }] = await scratch.sql<{ sku: string }[]>`
        SELECT sku FROM public.product WHERE id = ${fixture.productId}`;
      // A second product of the same florist, which it cannot make: the placeholder of the case.
      const [{ other, otherId } = { other: "", otherId: "" }] =
        await scratch.sql<{ other: string; otherId: string }[]>`
        SELECT p.sku AS other, p.id AS "otherId" FROM public.product p
        WHERE p.status = 'active' AND p.id <> ${fixture.productId}
          AND EXISTS (SELECT 1 FROM public.country_price cp
                      WHERE cp.product_id = p.id AND cp.country_id = ${fixture.countryId}
                        AND cp.active_to IS NULL)
        ORDER BY p.sku LIMIT 1`;
      await scratch.sql`
        UPDATE public.partner_catalog_mapping SET can_fulfil = false WHERE product_id = ${otherId}`;
      // Its own client: drizzle sets its type parsers on the client it wraps.
      const reader = postgres(scratch.url, {
        max: 1,
        onnotice: () => undefined,
      });
      const db = drizzle(reader);
      const term = () =>
        createDbSaleabilityProvider({
          read: (query) => query(db as never),
          scope: () => new Map(),
        });
      try {
        await withSaleability(term(), async () => {
          expect(await isSaleable(sku, undefined, "PL")).toBe(true);
          expect(await isSaleable(other, undefined, "PL")).toBe(false);
          expect(await isSaleable(sku, undefined, "DE")).toBe(false);
          const placeholder = await availability({
            productId: other,
            countryIso: "PL",
          });
          expect(placeholder).toEqual({
            schemaAvailability: "OutOfStock",
            reasonKey: "catalog.availability.outOfStock",
            saleable: false,
          });
        });
        await asFixture(
          (tx) => tx`
          UPDATE public.fulfillment_partner SET status = 'paused' WHERE id = ${fixture.partnerId}`,
        );
        await withSaleability(term(), async () => {
          expect(await isSaleable(sku, undefined, "PL")).toBe(false);
        });
      } finally {
        await asFixture(
          (tx) => tx`
          UPDATE public.fulfillment_partner SET status = 'active' WHERE id = ${fixture.partnerId}`,
        );
        await scratch.sql`
          UPDATE public.partner_catalog_mapping SET can_fulfil = true WHERE product_id = ${otherId}`;
        uninstallCountryRegistry();
        await reader.end({ timeout: 5 });
      }
    });

    it("AC-39: app_build reads the view and is refused fulfillment_partner, partner_catalog_mapping and partner_coverage", async () => {
      expect((await offeredTiers(build)).length).toBeGreaterThan(0);
      for (const table of [
        "fulfillment_partner",
        "partner_catalog_mapping",
        "partner_coverage",
      ]) {
        const refused = await failure(
          build.unsafe(`SELECT 1 FROM public.${table} LIMIT 1`),
        );
        expect(refused?.code, table).toBe("42501");
      }
    });

    it("AC-39: app_web in the public context reads the view and no partner row", async () => {
      const seen = await scratch.sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE app_web`;
        await tx`SELECT set_config('app.role', 'public', true)`;
        const partners = await tx<{ count: number }[]>`
          SELECT count(*)::int AS count FROM public.fulfillment_partner`;
        const offers = await tx<{ count: number }[]>`
          SELECT count(*)::int AS count FROM public.saleable_offer
          WHERE product_id = ${fixture.productId}`;
        return { partners: partners[0]?.count, offers: offers[0]?.count };
      });
      expect(seen.partners).toBe(0);
      expect(seen.offers).toBeGreaterThan(0);
    });

    it("F2: first_active_at is set once at the first activation and never cleared; the seed's active products carry it", async () => {
      const [{ missing } = { missing: -1 }] = await scratch.sql<
        { missing: number }[]
      >`
        SELECT count(*)::int AS missing FROM public.product
        WHERE status = 'active' AND first_active_at IS NULL`;
      expect(missing).toBe(0);

      const [draft] = await scratch.sql<
        { id: string; first_active_at: Date | null }[]
      >`
        INSERT INTO public.product (sku, product_type, primary_flower, colour_primary, style,
          price_tier, substitution_class, freshness_days, status)
        SELECT 'FO-IT-0026', product_type, primary_flower, colour_primary, style, price_tier,
          substitution_class, freshness_days, 'draft'
        FROM public.product WHERE id = ${fixture.productId}
        RETURNING id, first_active_at`;
      expect(draft?.first_active_at).toBeNull();
      const id = draft?.id ?? "";
      const [active] = await scratch.sql<{ first_active_at: Date | null }[]>`
        UPDATE public.product SET status = 'active' WHERE id = ${id} RETURNING first_active_at`;
      expect(active?.first_active_at).toBeInstanceOf(Date);
      const [retired] = await scratch.sql<{ first_active_at: Date | null }[]>`
        UPDATE public.product SET status = 'retired', retired_at = now(), first_active_at = NULL
        WHERE id = ${id} RETURNING first_active_at`;
      expect(retired?.first_active_at?.getTime()).toBe(
        active?.first_active_at?.getTime(),
      );
    });

    it("F2: a price of a product that has been active is never changed or deleted, only closed; a draft's is replaceable", async () => {
      const [price] = await scratch.sql<{ id: string }[]>`
        SELECT id FROM public.country_price
        WHERE product_id = ${fixture.productId} AND active_to IS NULL LIMIT 1`;
      const priceId = price?.id ?? "";
      const changed = await failure(scratch.sql`
        UPDATE public.country_price SET retail_minor = retail_minor + 100 WHERE id = ${priceId}`);
      expect(changed?.message).toMatch(/^PRICE_SUPERSEDE_ONLY/u);
      const deleted = await failure(scratch.sql`
        DELETE FROM public.country_price WHERE id = ${priceId}`);
      expect(deleted?.message).toMatch(/^PRICE_SUPERSEDE_ONLY/u);
      // Closing the row (the supersede's first half) is allowed, and so is a write that leaves
      // the amount as it is.
      await scratch.sql`UPDATE public.country_price SET retail_minor = retail_minor WHERE id = ${priceId}`;
      await scratch.sql`UPDATE public.country_price SET active_to = active_from + 1 WHERE id = ${priceId}`;
      await scratch.sql`UPDATE public.country_price SET active_to = NULL WHERE id = ${priceId}`;

      // A product never activated: its price rows may be replaced freely.
      const [draft] = await scratch.sql<{ id: string }[]>`
        INSERT INTO public.product (sku, product_type, primary_flower, colour_primary, style,
          price_tier, substitution_class, freshness_days, status)
        SELECT 'FO-IT-0026D', product_type, primary_flower, colour_primary, style, price_tier,
          substitution_class, freshness_days, 'draft'
        FROM public.product WHERE id = ${fixture.productId}
        RETURNING id`;
      const draftId = draft?.id ?? "";
      const [row] = await scratch.sql<{ id: string }[]>`
        INSERT INTO public.country_price (product_id, country_id, retail_minor, currency_code,
          vat_rate_bp, active_from)
        SELECT ${draftId}, id, 10000, currency_code, vat_rate_bp, current_date
        FROM public.country WHERE id = ${fixture.countryId}
        RETURNING id`;
      await scratch.sql`UPDATE public.country_price SET retail_minor = 12900 WHERE id = ${row?.id ?? ""}`;
      await scratch.sql`DELETE FROM public.country_price WHERE id = ${row?.id ?? ""}`;
    });

    it("first_live_at is set when a country goes live and kept when it goes back to demo", async () => {
      // Spec 012's flip guard admits a status change only in admin; the trigger under test is
      // `country_first_live_at`, so the guard is off for this case only.
      await scratch.sql`ALTER TABLE public.country DISABLE TRIGGER country_status_flip_guard`;
      try {
        const read = async () =>
          (
            await scratch.sql<{ first_live_at: Date | null }[]>`
              SELECT first_live_at FROM public.country WHERE iso2 = 'NL'`
          )[0]?.first_live_at;
        await asFixture(
          (tx) => tx`
          UPDATE public.country SET status = 'demo', first_live_at = NULL WHERE iso2 = 'NL'`,
        );
        expect(await read()).toBeNull();
        await scratch.sql`UPDATE public.country SET status = 'disabled' WHERE iso2 = 'NL'`;
        expect(await read()).toBeNull();
        await scratch.sql`UPDATE public.country SET status = 'live' WHERE iso2 = 'NL'`;
        const live = await read();
        expect(live).toBeInstanceOf(Date);
        await scratch.sql`UPDATE public.country SET status = 'demo', first_live_at = NULL WHERE iso2 = 'NL'`;
        expect((await read())?.getTime()).toBe(live?.getTime());
      } finally {
        await scratch.sql`ALTER TABLE public.country ENABLE TRIGGER country_status_flip_guard`;
      }
    });

    it("§2.7: a florist's bouquet photo names its florist; a partner delivery proof needs none", async () => {
      const insert = (
        kind: string,
        depicts: string,
        supplier: string | null,
      ) => {
        const id = randomUUID();
        return scratch.sql`
          INSERT INTO public.media_asset (id, kind, bucket, object_key, mime, width, height, bytes,
            checksum_sha256, visibility, source, depicts, exif_stripped, supplier_partner_id)
          VALUES (${id}, ${kind}, 'fo-media-test',
            ${`${kind.replace("_", "-")}/${id}/original`}, 'image/jpeg', 1200, 1500, 48213,
            ${"a".repeat(64)}, 'private', 'partner', ${depicts}, true, ${supplier})`;
      };
      const missing = await failure(insert("product", "product", null));
      expect(missing?.code).toBe("23514");
      expect(missing?.message).toContain("media_asset_supplier_partner_check");
      expect(
        await failure(insert("product", "product", fixture.partnerId)),
      ).toBeUndefined();
      expect(
        await failure(insert("delivery_proof", "delivery", null)),
      ).toBeUndefined();
    });

    it("AC-6: one open publish run per environment; a finished run needs finished_at", async () => {
      const insert = (
        environment: string,
        status: string,
        finished: boolean,
      ) => scratch.sql`
        INSERT INTO public.publish_run (environment, reason, target_ref, expected_hash,
          added_count, removed_count, status, finished_at)
        VALUES (${environment}, 'test', 'main', ${"a".repeat(64)}, 1, 0, ${status},
          ${finished ? new Date() : null})`;
      await insert("staging", "requested", false);
      const second = await failure(insert("staging", "building", false));
      expect(second?.code).toBe("23505");
      await insert("production", "requested", false);
      await insert("staging", "verified", true);
      const unfinished = await failure(insert("staging", "failed", false));
      expect(unfinished?.code).toBe("23514");
    });
  },
);
