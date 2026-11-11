/**
 * The product editor's commands against migrated tables (spec 012b §2.5, §2.6; TASK-297,
 * TASK-298):
 *
 *  - T-15 (admin half): a hard rule refuses the save with the shared rule id and changes nothing;
 *    a soft rule saves only with a reason, and the reason is on the audit row.
 *  - T-16: one fixture per `draft → active` precondition; retire, removal from a country and a
 *    slug edit refused for an exposed product (priced in a country with `first_live_at`, window
 *    off or product real), accepted for a never-live one and for a seed product with the window on.
 *  - T-17: a supplier save writes the product and the florist's mapping together; a forced
 *    mapping failure leaves neither; a name with a florist's legal name and a description with
 *    "partner" are refused.
 *  - T-19: supersede closes the open row today in the country's zone (23:30 UTC is already the
 *    next day in Warsaw) without touching `retail_minor`, refuses a second change the same day,
 *    and the 30-day lowest includes the superseded amount; a draft's price is replaced three
 *    times in a day, then after `draft → active` a raw `DELETE` and a raw `retail_minor` update
 *    raise and `replaceDraftPrice` is refused.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AdminRunner } from "../../src/modules/admin/users.ts";
import {
  type CatalogueActor,
  type CatalogueDeps,
  removeFromCountry,
  replaceDraftPrice,
  saveCopy,
  saveProduct,
  saveTiers,
  setProductStatus,
  supersedePrice,
  previewPriceChange,
  marginTab,
} from "../../src/modules/admin/catalogue.ts";
import * as make from "./support/rows.ts";
import { drizzleOver } from "./support/drizzle-tx.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  withoutTriggers,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

/** 23:30 UTC on 10 November: already 00:30 on 11 November in Warsaw. */
const LATE = new Date("2026-11-10T23:30:00Z");
const WARSAW_TODAY = "2026-11-11";

const SEVENTY_WORDS = Array.from({ length: 70 }, () => "bloom").join(" ");

describe.skipIf(server.url === undefined)(
  `the product editor's commands${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let run: AdminRunner;
    let plId: string;
    let deId: string;
    let floristId: string;
    const invalidated: string[][] = [];
    const adminId = randomUUID();
    const contentId = randomUUID();
    const admin: CatalogueActor = { userId: adminId, roles: ["admin"] };
    const content: CatalogueActor = { userId: contentId, roles: ["content"] };
    let deps: Partial<CatalogueDeps>;
    let skuCounter = 900;

    const nextSku = (): string => {
      skuCounter += 1;
      return `FO-BQ-${String(skuCounter)}`;
    };

    const DETAILS = {
      productType: "bouquet",
      primaryFlower: "roses",
      colourPrimary: "red",
      style: "classic",
      priceTier: "classic",
      substitutionClass: "main_flower",
      vaseIncluded: false,
      stemCount: null,
      freshnessDays: 7,
      partnerOnly: false,
    } as const;

    async function productRow(id: string) {
      const [row] = await scratch.sql<
        {
          sku: string;
          status: string;
          version: string;
          first_active_at: Date | null;
        }[]
      >`SELECT sku, status, first_active_at,
               to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version
          FROM product WHERE id = ${id}`;
      if (row === undefined) throw new Error(`no product ${id}`);
      return row;
    }

    const version = async (id: string): Promise<string> =>
      (await productRow(id)).version;

    async function newProduct(supplier?: unknown): Promise<string> {
      const saved = await saveProduct(
        admin,
        {
          sku: nextSku(),
          ...DETAILS,
          ...(supplier === undefined ? {} : { supplier }),
        },
        deps,
      );
      if (!saved.ok) throw new Error(`saveProduct refused: ${saved.reason}`);
      return saved.value.productId;
    }

    const TIERS = [
      { tierKey: "stems_9", stems: 9, sort: 0, isDefault: false },
      { tierKey: "stems_15", stems: 15, sort: 1, isDefault: true },
    ];

    const COPY = {
      locale: "en",
      name: "Garden Hour",
      slug: "garden-hour",
      description: SEVENTY_WORDS,
      seoTitle: "Garden Hour: hand-tied roses",
      seoDescription: "Roses, hand-tied.",
    };

    async function withTiers(id: string): Promise<void> {
      const saved = await saveTiers(
        admin,
        { productId: id, updatedAt: await version(id), tiers: TIERS },
        deps,
      );
      expect(saved).toMatchObject({ ok: true });
    }

    async function withCopy(id: string, slug: string): Promise<void> {
      const saved = await saveCopy(
        admin,
        { productId: id, updatedAt: await version(id), ...COPY, slug },
        deps,
      );
      expect(saved).toMatchObject({ ok: true });
    }

    async function withPhoto(id: string): Promise<void> {
      await withoutTriggers(scratch.sql, async (tx) => {
        const asset = await make.mediaAsset(tx, {
          kind: "product",
          visibility: "public",
        });
        await tx`UPDATE media_asset SET review_state = 'approved', reviewed_by = 'founder', reviewed_at = now() WHERE id = ${asset}`;
        await tx`INSERT INTO product_media (product_id, media_asset_id, is_primary)
                 VALUES (${id}, ${asset}, true)`;
      });
    }

    const price = (
      id: string,
      iso2: string,
      amountText: string,
      tierKey = "stems_15",
    ) => ({
      productId: id,
      countryIso2: iso2,
      tierKey,
      amountText,
    });

    async function activeProduct(slug: string): Promise<string> {
      const id = await newProduct();
      await withTiers(id);
      await withCopy(id, slug);
      await withPhoto(id);
      expect(
        await replaceDraftPrice(admin, price(id, "PL", "229.00"), deps),
      ).toMatchObject({
        ok: true,
      });
      expect(
        await setProductStatus(
          admin,
          { productId: id, updatedAt: await version(id), status: "active" },
          deps,
        ),
      ).toMatchObject({ ok: true });
      return id;
    }

    async function setWindow(open: boolean): Promise<void> {
      await scratch.sql`
        INSERT INTO feature_flag_scope (flag_key, scope, scope_ref, enabled)
        VALUES ('catalogue.placeholder_window', 'global', '*', ${open})
        ON CONFLICT (flag_key, scope, scope_ref) DO UPDATE SET enabled = EXCLUDED.enabled`;
    }

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "catalogcms");
      await scratch.sql.begin(async (tx) => {
        plId = await make.country(tx, "PL");
        const [de] = await tx<{ id: string }[]>`
          INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
          VALUES ('DE', 'EUR', 700, 'Europe/Berlin') RETURNING id`;
        deId = de?.id ?? "";
        await tx`INSERT INTO users (id, email) VALUES (${adminId}, 'founder@example.test'),
                                                    (${contentId}, 'content@example.test')`;
        await tx`INSERT INTO fx_rate (base_code, quote_code, rate_ppm, as_of, source)
                 VALUES ('EUR', 'PLN', 4250000, '2026-11-01', 'ecb')`;
        floristId = await make.partner(tx, plId, "onboarding");
        await tx`UPDATE fulfillment_partner SET legal_name = 'Kwiaciarnia pod Lipą'
                  WHERE id = ${floristId}`;
        // A reference row per country: the VAT rate a new price takes (8 % PL, 7 % DE).
        const [ref] = await tx<{ id: string }[]>`
          INSERT INTO product (sku, product_type, primary_flower, colour_primary, style,
                               price_tier, substitution_class, freshness_days)
          VALUES ('FO-BQ-899', 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
          RETURNING id`;
        await tx`INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort, is_default)
                 VALUES (${ref?.id ?? ""}, 'stems_15', 'catalog.tier.stems', 15, 0, true)`;
        await tx`INSERT INTO country_price (product_id, country_id, tier_key, retail_minor,
                   currency_code, vat_rate_bp, active_from)
                 VALUES (${ref?.id ?? ""}, ${plId}, 'stems_15', 19900, 'PLN', 800, '2026-10-01'),
                        (${ref?.id ?? ""}, ${deId}, 'stems_15', 4990, 'EUR', 700, '2026-10-01')`;
      });
      // Poland has been live: `first_live_at` is set (the trigger's job, done directly here).
      await withoutTriggers(scratch.sql, async (tx) => {
        await tx`UPDATE country SET status = 'live', first_live_at = '2026-10-15T00:00:00Z'
                  WHERE id = ${plId}`;
      });
      run = ((context, fn) =>
        scratch.sql.begin(async (tx) => {
          await tx`SELECT set_config('app.audit_action', ${context.action}, true)`;
          await tx`SELECT set_config('app.audit_reason', ${context.reason ?? ""}, true)`;
          await asApp(tx, {
            role: "admin",
            ...(context.userId === undefined ? {} : { userId: context.userId }),
          });
          return fn(drizzleOver(tx, scratch.sql));
        })) as AdminRunner;
      deps = {
        run,
        invalidate: (tags) => {
          invalidated.push([...tags]);
          return Promise.resolve();
        },
        now: () => LATE,
      };
      await setWindow(true);
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    describe("T-15: the admin save applies the shared rules", () => {
      it("a hard rule refuses with its id and changes nothing", async () => {
        const id = await newProduct();
        const before = await version(id);
        const refused = await saveCopy(
          admin,
          {
            productId: id,
            updatedAt: before,
            ...COPY,
            slug: "garden-hour-a",
            name: "Roses 229 zł",
          },
          deps,
        );
        expect(refused).toMatchObject({
          ok: false,
          reason: "rules",
          violations: [
            { rule: "copy.price_literal", field: "name", severity: "hard" },
          ],
        });
        expect(await version(id)).toBe(before);
        const tiers = await saveTiers(
          admin,
          {
            productId: id,
            updatedAt: before,
            tiers: [
              { tierKey: "stems_16", stems: 16, sort: 0, isDefault: true },
            ],
          },
          deps,
        );
        expect(tiers).toMatchObject({
          ok: false,
          reason: "rules",
          violations: [{ rule: "tier.stem_count_odd" }],
        });
        const [count] = await scratch.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM product_tier WHERE product_id = ${id}`;
        expect(count?.n).toBe(0);
      });

      it("a soft rule saves only with a reason, and the reason is on the audit row", async () => {
        const id = await newProduct();
        const short = {
          ...COPY,
          slug: "garden-hour-b",
          description: "Ten words only, which is far below the band.",
        };
        const asked = await saveCopy(
          admin,
          { productId: id, updatedAt: await version(id), ...short },
          deps,
        );
        expect(asked).toMatchObject({
          ok: false,
          reason: "reason_required",
          violations: [{ rule: "copy.description_words", severity: "soft" }],
        });
        const saved = await saveCopy(
          admin,
          {
            productId: id,
            updatedAt: await version(id),
            ...short,
            overrideReason: "the florist's own short text",
          },
          deps,
        );
        expect(saved).toMatchObject({ ok: true });
        const audit = await scratch.sql<
          { reason: string | null; action: string }[]
        >`
          SELECT reason, action FROM audit_log
           WHERE entity_table = 'product_translation' AND action = 'catalogue.copy_save'
             AND after->>'product_id' = ${id}`;
        expect(audit.map((row) => row.reason)).toEqual([
          "the florist's own short text",
        ]);
      });

      it("a non-admin may save copy only in a reviewer locale", async () => {
        const id = await newProduct();
        const refused = await saveCopy(
          content,
          {
            productId: id,
            updatedAt: await version(id),
            ...COPY,
            slug: "garden-hour-c",
          },
          deps,
        );
        expect(refused).toMatchObject({
          ok: false,
          reason: "forbidden_locale",
        });
        await scratch.sql`INSERT INTO reviewer_locale (user_id, locale_code) VALUES (${contentId}, 'en')`;
        expect(
          await saveCopy(
            content,
            {
              productId: id,
              updatedAt: await version(id),
              ...COPY,
              slug: "garden-hour-c",
            },
            deps,
          ),
        ).toMatchObject({ ok: true });
      });

      it("slug.unique: the same slug in the same locale is refused", async () => {
        const id = await newProduct();
        await withCopy(id, "garden-hour-d");
        const other = await newProduct();
        expect(
          await saveCopy(
            admin,
            {
              productId: other,
              updatedAt: await version(other),
              ...COPY,
              slug: "garden-hour-d",
            },
            deps,
          ),
        ).toMatchObject({
          ok: false,
          reason: "rules",
          violations: [{ rule: "slug.unique" }],
        });
      });

      it("a save against a newer row is a conflict", async () => {
        const id = await newProduct();
        const stale = await version(id);
        await withTiers(id);
        expect(
          await saveCopy(
            admin,
            { productId: id, updatedAt: stale, ...COPY, slug: "garden-hour-e" },
            deps,
          ),
        ).toMatchObject({ ok: false, reason: "conflict" });
      });
    });

    describe("T-16: status, exposure and the placeholder window", () => {
      it("draft → active is refused while each precondition is unmet, one by one", async () => {
        const id = await newProduct();
        const activate = async () =>
          setProductStatus(
            admin,
            { productId: id, updatedAt: await version(id), status: "active" },
            deps,
          );
        expect(await activate()).toMatchObject({
          reason: "preconditions",
          unmet: ["en_copy", "sizes", "primary_photo", "price"],
        });
        await withCopy(id, "precondition-hour");
        expect(await activate()).toMatchObject({
          unmet: ["sizes", "primary_photo", "price"],
        });
        await withTiers(id);
        expect(await activate()).toMatchObject({
          unmet: ["primary_photo", "price"],
        });
        await withPhoto(id);
        expect(await activate()).toMatchObject({ unmet: ["price"] });
        expect(
          await replaceDraftPrice(admin, price(id, "DE", "49.90"), deps),
        ).toMatchObject({ ok: true });
        const before = invalidated.length;
        expect(await activate()).toMatchObject({ ok: true });
        // T-09's structural row: a status change waits for a publish, nothing is invalidated.
        expect(invalidated.length).toBe(before);
        const row = await productRow(id);
        expect(row.status).toBe("active");
        expect(row.first_active_at).not.toBeNull();
      });

      it("an exposed real product: retire, removal from Poland and a slug edit are refused", async () => {
        const id = await activeProduct("exposed-hour");
        const retire = await setProductStatus(
          admin,
          { productId: id, updatedAt: await version(id), status: "retired" },
          deps,
        );
        expect(retire).toMatchObject({ ok: false, reason: "exposed" });
        expect(
          await removeFromCountry(
            admin,
            { productId: id, countryIso2: "PL" },
            deps,
          ),
        ).toMatchObject({ ok: false, reason: "exposed" });
        expect(
          await saveCopy(
            admin,
            {
              productId: id,
              updatedAt: await version(id),
              ...COPY,
              slug: "exposed-hour-2",
            },
            deps,
          ),
        ).toMatchObject({ ok: false, reason: "exposed" });
        // The same text with the same slug still saves.
        expect(
          await saveCopy(
            admin,
            {
              productId: id,
              updatedAt: await version(id),
              ...COPY,
              slug: "exposed-hour",
              name: "Exposed Hour",
            },
            deps,
          ),
        ).toMatchObject({ ok: true });
        // T-09's copy row: the product's tag, its countries' and the sitemap, once.
        const sku = (await productRow(id)).sku;
        expect(invalidated.at(-1)).toEqual([
          "catalog:PL",
          `product:${sku}`,
          "sitemap",
        ]);
      });

      it("a never-live product is free: priced only in Germany, it renames, leaves and retires", async () => {
        const id = await newProduct();
        await withTiers(id);
        await withCopy(id, "never-live-hour");
        await withPhoto(id);
        await replaceDraftPrice(admin, price(id, "DE", "49.90"), deps);
        await setProductStatus(
          admin,
          { productId: id, updatedAt: await version(id), status: "active" },
          deps,
        );
        expect(
          await saveCopy(
            admin,
            {
              productId: id,
              updatedAt: await version(id),
              ...COPY,
              slug: "never-live-hour-2",
            },
            deps,
          ),
        ).toMatchObject({ ok: true });
        expect(
          await setProductStatus(
            admin,
            { productId: id, updatedAt: await version(id), status: "retired" },
            deps,
          ),
        ).toMatchObject({ ok: true });
      });

      it("a seed product priced in live Poland is not exposed while the window is on, and is once it is off", async () => {
        const make1 = async (): Promise<string> => {
          const id = await activeProduct(`seed-hour-${String(skuCounter)}`);
          await scratch.sql`UPDATE product SET source = 'seed' WHERE id = ${id}`;
          return id;
        };
        const open = await make1();
        expect(
          await setProductStatus(
            admin,
            {
              productId: open,
              updatedAt: await version(open),
              status: "retired",
            },
            deps,
          ),
        ).toMatchObject({ ok: true });
        const closed = await make1();
        await setWindow(false);
        try {
          expect(
            await setProductStatus(
              admin,
              {
                productId: closed,
                updatedAt: await version(closed),
                status: "retired",
              },
              deps,
            ),
          ).toMatchObject({ ok: false, reason: "exposed" });
        } finally {
          await setWindow(true);
        }
      });
    });

    describe("T-17: florist bouquets", () => {
      async function floristVersion(): Promise<void> {
        // `saveMapping` reads the partner's version itself; nothing to pass.
      }

      it("a supplier save writes the product and the florist's mapping in one transaction", async () => {
        await floristVersion();
        const id = await newProduct({
          partnerId: floristId,
          payouts: [{ tierKey: null, payoutText: "149.00" }],
        });
        const rows = await scratch.sql<
          { payout: string; currency: string; can_fulfil: boolean }[]
        >`
          SELECT partner_payout_minor::text AS payout, currency_code AS currency, can_fulfil
            FROM partner_catalog_mapping WHERE product_id = ${id} AND partner_id = ${floristId}`;
        expect(rows).toEqual([
          { payout: "14900", currency: "PLN", can_fulfil: true },
        ]);
        await withTiers(id);
        const sized = await saveTiers(
          admin,
          {
            productId: id,
            updatedAt: await version(id),
            tiers: TIERS,
            supplier: {
              partnerId: floristId,
              payouts: [
                { tierKey: "stems_9", payoutText: "99" },
                { tierKey: "stems_15", payoutText: "149,00" },
              ],
            },
          },
          deps,
        );
        expect(sized).toMatchObject({ ok: true });
        const perSize = await scratch.sql<
          { tier: string | null; payout: string }[]
        >`
          SELECT tier_key AS tier, partner_payout_minor::text AS payout
            FROM partner_catalog_mapping WHERE product_id = ${id} ORDER BY tier_key NULLS FIRST`;
        expect(perSize).toEqual([
          { tier: null, payout: "14900" },
          { tier: "stems_15", payout: "14900" },
          { tier: "stems_9", payout: "9900" },
        ]);
      });

      it("a forced mapping failure leaves neither the product nor the mapping", async () => {
        const sku = nextSku();
        const refused = await saveProduct(
          admin,
          {
            sku,
            ...DETAILS,
            supplier: {
              partnerId: floristId,
              payouts: [{ tierKey: "stems_99", payoutText: "99" }],
            },
          },
          deps,
        );
        expect(refused).toMatchObject({ ok: false, reason: "mapping_failed" });
        const [left] = await scratch.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM product WHERE sku = ${sku}`;
        expect(left?.n).toBe(0);
      });

      it("a demo florist is not a supplier", async () => {
        const demo = await scratch.sql.begin((tx) =>
          make.partner(tx, plId, "demo"),
        );
        const sku = nextSku();
        expect(
          await saveProduct(
            admin,
            {
              sku,
              ...DETAILS,
              supplier: {
                partnerId: demo,
                payouts: [{ tierKey: null, payoutText: "99" }],
              },
            },
            deps,
          ),
        ).toMatchObject({ ok: false, reason: "supplier" });
      });

      it('copy with the florist\'s legal name, or with "partner", is refused', async () => {
        const id = await newProduct();
        expect(
          await saveCopy(
            admin,
            {
              productId: id,
              updatedAt: await version(id),
              ...COPY,
              slug: "lipa-hour",
              name: "Kwiaciarnia pod Lipą roses",
            },
            deps,
          ),
        ).toMatchObject({
          ok: false,
          violations: [{ rule: "copy.florist_name" }],
        });
        expect(
          await saveCopy(
            admin,
            {
              productId: id,
              updatedAt: await version(id),
              ...COPY,
              slug: "lipa-hour",
              description: `${SEVENTY_WORDS} made by our partner`,
            },
            deps,
          ),
        ).toMatchObject({
          ok: false,
          violations: [{ rule: "copy.banned_word" }],
        });
      });
    });

    describe("T-19: supersede and the draft price", () => {
      it("a draft's price is replaced three times in one day; once active, DELETE and UPDATE raise and replace is refused", async () => {
        const id = await newProduct();
        await withTiers(id);
        await withCopy(id, "draft-price-hour");
        await withPhoto(id);
        for (const amount of ["199.00", "209", "219,00"]) {
          expect(
            await replaceDraftPrice(admin, price(id, "PL", amount), deps),
          ).toMatchObject({ ok: true });
        }
        const rows = await scratch.sql<{ retail: string }[]>`
          SELECT retail_minor::text AS retail FROM country_price WHERE product_id = ${id}`;
        expect(rows).toEqual([{ retail: "21900" }]);
        await setProductStatus(
          admin,
          { productId: id, updatedAt: await version(id), status: "active" },
          deps,
        );
        await scratch.sql.begin(async (tx) => {
          const deleted = await pgFailure(
            tx,
            (sp) => sp`DELETE FROM country_price WHERE product_id = ${id}`,
          );
          expect(deleted.code).not.toBeUndefined();
          const updated = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE country_price SET retail_minor = 1 WHERE product_id = ${id}`,
          );
          expect(updated.code).not.toBeUndefined();
        });
        expect(
          await replaceDraftPrice(admin, price(id, "PL", "229"), deps),
        ).toMatchObject({
          ok: false,
          reason: "not_draft",
        });
      });

      it("supersede closes the open row today in Warsaw, never updates retail_minor, refuses a second change today", async () => {
        const id = await activeProduct("supersede-hour");
        // The open row as if entered on an earlier day.
        await withoutTriggers(scratch.sql, async (tx) => {
          await tx`UPDATE country_price SET active_from = '2026-11-01' WHERE product_id = ${id}`;
        });
        const changed = await supersedePrice(
          admin,
          price(id, "PL", "249.00"),
          deps,
        );
        expect(changed).toEqual({
          ok: true,
          value: { amountMinor: 24900, activeFrom: WARSAW_TODAY },
        });
        const rows = await scratch.sql<
          { retail: string; from: string; to: string | null }[]
        >`
          SELECT retail_minor::text AS retail, active_from::text AS from, active_to::text AS to
            FROM country_price WHERE product_id = ${id} ORDER BY active_from`;
        expect(rows).toEqual([
          { retail: "22900", from: "2026-11-01", to: WARSAW_TODAY },
          { retail: "24900", from: WARSAW_TODAY, to: null },
        ]);
        const audit = await scratch.sql<
          { before: Record<string, unknown>; after: Record<string, unknown> }[]
        >`
          SELECT before, after FROM audit_log
           WHERE entity_table = 'country_price' AND action = 'catalogue.price_supersede'
             AND before IS NOT NULL
             AND entity_id IN (SELECT id::text FROM country_price WHERE product_id = ${id})`;
        // The one UPDATE the change issued names only the columns it changed: `active_to`.
        expect(audit).toHaveLength(1);
        expect(Object.keys(audit[0]?.after ?? {})).toContain("active_to");
        expect(Object.keys(audit[0]?.after ?? {})).not.toContain(
          "retail_minor",
        );
        expect(invalidated.at(-1)).toContain("catalog:PL");
        expect(
          await supersedePrice(admin, price(id, "PL", "259.00"), deps),
        ).toMatchObject({ ok: false, reason: "same_day" });
        const preview = await previewPriceChange(
          admin,
          price(id, "PL", "199.00"),
          deps,
        );
        expect(preview).toMatchObject({
          ok: true,
          value: { amountMinor: 19900 },
        });
        if (!preview.ok) return;
        // The 30-day lowest includes the superseded 229.00.
        expect(preview.value.preview.lowest?.replaceAll(/\s/gu, " ")).toBe(
          "229.00 PLN",
        );
        expect(preview.value.preview.lowestAfterMinor).toBe(19900);
      });

      it("a price below the highest payout is refused; a high share needs a reason", async () => {
        const id = await activeProduct("margin-hour");
        await withoutTriggers(scratch.sql, async (tx) => {
          await tx`UPDATE country_price SET active_from = '2026-11-01' WHERE product_id = ${id}`;
          await tx`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key, can_fulfil,
                     partner_payout_minor, currency_code)
                   VALUES (${floristId}, ${id}, 'stems_15', true, 21204, 'PLN')`;
        });
        expect(
          await supersedePrice(admin, price(id, "PL", "229.00"), deps),
        ).toMatchObject({
          ok: false,
          reason: "below_payout",
        });
        expect(
          await supersedePrice(admin, price(id, "PL", "299.00"), deps),
        ).toMatchObject({
          ok: false,
          reason: "reason_required",
        });
        expect(
          await supersedePrice(
            admin,
            { ...price(id, "PL", "299.00"), overrideReason: "launch price" },
            deps,
          ),
        ).toMatchObject({ ok: true });
        const margin = await marginTab(admin, id, "PL", deps);
        expect(margin.map((row) => row.tierKey)).toEqual(["stems_15"]);
        expect(margin[0]?.margin.highestPayoutMinor).toBe(21204);
        expect(margin[0]?.verdict).toBe("share_high");
      });
    });
  },
);
