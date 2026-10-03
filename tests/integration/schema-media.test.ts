/**
 * Migration `0004` — media as keys, never bytes (spec 002 §5.1, AC-11, AC-22; T-11, T-22's
 * database half; TASK-017).
 *
 * Runs against a scratch database migrated from empty by the real runner
 * (`support/scratch-db.ts`); skips when no local, disposable Postgres answers.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as rows from "./support/rows.ts";
import {
  pgFailure,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();

describe.skipIf(server.url === undefined)(
  `migration 0004 — media ${server.reason}`,
  () => {
    let db: ScratchDatabase;
    beforeAll(async () => {
      db = await scratchDatabase(server.url ?? "", "media");
    }, 120_000);
    afterAll(async () => {
      await db.drop();
    });

    it("creates the four media tables, owned by app_owner", async () => {
      const tables = await db.sql<{ tablename: string; tableowner: string }[]>`
        SELECT tablename, tableowner FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('media_asset', 'media_variant', 'product_media', 'product_media_alt')
        ORDER BY tablename`;
      expect(tables).toEqual([
        { tablename: "media_asset", tableowner: "app_owner" },
        { tablename: "media_variant", tableowner: "app_owner" },
        { tablename: "product_media", tableowner: "app_owner" },
        { tablename: "product_media_alt", tableowner: "app_owner" },
      ]);
    });

    it("stores no binary data: no bytea column exists anywhere (AC-22)", async () => {
      const columns = await db.sql<
        { table_name: string; column_name: string }[]
      >`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type = 'bytea'`;
      expect(columns).toEqual([]);
    });

    describe("T-11 — one primary image per product, alt text required (AC-11)", () => {
      it("rejects a second is_primary image for the same product", async () => {
        const failure = await rolledBack(db.sql, async (tx) => {
          const productId = await rows.product(tx);
          const first = await rows.mediaAsset(tx);
          const second = await rows.mediaAsset(tx);
          await tx`INSERT INTO product_media (product_id, media_asset_id, is_primary)
                   VALUES (${productId}, ${first}, true)`;
          return pgFailure(
            tx,
            (
              sp,
            ) => sp`INSERT INTO product_media (product_id, media_asset_id, is_primary)
                        VALUES (${productId}, ${second}, true)`,
          );
        });
        expect(failure.code).toBe("23505");
        expect(failure.constraint).toBe("product_media_primary_idx");
      });

      it("accepts any number of non-primary images, and a primary on another product", async () => {
        const count = await rolledBack(db.sql, async (tx) => {
          const productId = await rows.product(tx);
          const otherProduct = await rows.product(tx);
          for (const primary of [true, false, false]) {
            const asset = await rows.mediaAsset(tx);
            await tx`INSERT INTO product_media (product_id, media_asset_id, is_primary)
                     VALUES (${productId}, ${asset}, ${primary})`;
          }
          const asset = await rows.mediaAsset(tx);
          await tx`INSERT INTO product_media (product_id, media_asset_id, is_primary)
                   VALUES (${otherProduct}, ${asset}, true)`;
          const [row] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM product_media WHERE is_primary`;
          return row?.n;
        });
        expect(count).toBe(2);
      });

      it("rejects a product_media_alt row without alt, and one whose alt is blank", async () => {
        const failures = await rolledBack(db.sql, async (tx) => {
          await rows.base(tx);
          const productId = await rows.product(tx);
          const asset = await rows.mediaAsset(tx);
          const [link] = await tx<{ id: string }[]>`
            INSERT INTO product_media (product_id, media_asset_id, is_primary)
            VALUES (${productId}, ${asset}, true) RETURNING id`;
          const missing = await pgFailure(
            tx,
            (
              sp,
            ) => sp`INSERT INTO product_media_alt (product_media_id, locale_code)
                        VALUES (${link?.id ?? ""}, 'en')`,
          );
          const blank = await pgFailure(
            tx,
            (
              sp,
            ) => sp`INSERT INTO product_media_alt (product_media_id, locale_code, alt)
                        VALUES (${link?.id ?? ""}, 'en', '   ')`,
          );
          await tx`INSERT INTO product_media_alt (product_media_id, locale_code, alt)
                   VALUES (${link?.id ?? ""}, 'en', 'Red roses in a paper wrap')`;
          return { missing, blank };
        });
        expect(failures.missing.code).toBe("23502");
        expect(failures.blank.constraint).toBe("product_media_alt_alt_check");
      });
    });

    describe("keys, provenance and the delivery-photo facts", () => {
      it("refuses an object key that could climb out of its prefix", async () => {
        const failures = await rolledBack(db.sql, async (tx) => {
          const found = [];
          // One savepoint at a time: a transaction runs one statement at a time.
          for (const key of [
            "../etc/passwd",
            "/product/a/original",
            "product/A/original",
            "product/a/../b",
          ]) {
            found.push(
              await pgFailure(
                tx,
                (
                  sp,
                ) => sp`INSERT INTO media_asset (kind, bucket, object_key, mime, width, height,
                                                    bytes, checksum_sha256, source, depicts)
                            VALUES ('product', 'fo-media-test', ${key}, 'image/jpeg', 1, 1, 1,
                                    ${"b".repeat(64)}, 'photo', 'product')`,
              ),
            );
          }
          return found;
        });
        expect(failures).toHaveLength(4);
        for (const failure of failures) {
          expect(failure.constraint).toBe("media_asset_object_key_check");
        }
      });

      it("refuses an approved asset with no reviewer, and an AI image depicting a delivery", async () => {
        const failures = await rolledBack(db.sql, async (tx) => {
          const asset = await rows.mediaAsset(tx);
          const approved = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE media_asset SET review_state = 'approved' WHERE id = ${asset}`,
          );
          const aiDelivery = await pgFailure(tx, (sp) =>
            rows.mediaAsset(sp, {
              kind: "delivery_proof",
              depicts: "delivery",
              source: "ai",
            }),
          );
          await tx`UPDATE media_asset SET review_state = 'approved', reviewed_by = 'founder',
                     reviewed_at = now() WHERE id = ${asset}`;
          return { approved, aiDelivery };
        });
        expect(failures.approved.constraint).toBe("media_asset_reviewed_check");
        expect(failures.aiDelivery.constraint).toBe(
          "media_asset_delivery_not_ai_check",
        );
      });

      it("defaults a new asset to private and not-yet-stripped, so neither fact is assumed", async () => {
        const row = await rolledBack(db.sql, async (tx) => {
          const [inserted] = await tx<
            { visibility: string; exif_stripped: boolean }[]
          >`
            INSERT INTO media_asset (kind, bucket, object_key, mime, width, height, bytes,
                                     checksum_sha256, source, depicts)
            VALUES ('delivery_proof', 'fo-media-test', 'delivery-proof/x/original', 'image/jpeg',
                    1, 1, 1, ${"c".repeat(64)}, 'partner', 'delivery')
            RETURNING visibility, exif_stripped`;
          return inserted;
        });
        expect(row).toEqual({ visibility: "private", exif_stripped: false });
      });

      it("keeps an asset that a product page still shows (RESTRICT), and cascades variants", async () => {
        const result = await rolledBack(db.sql, async (tx) => {
          const productId = await rows.product(tx);
          const asset = await rows.mediaAsset(tx);
          await tx`INSERT INTO media_variant (media_asset_id, variant, object_key, format, width,
                                              height, bytes, checksum_sha256)
                   VALUES (${asset}, '640', ${`product/${asset}/640`}, 'avif', 640, 800, 2048,
                           ${"d".repeat(64)})`;
          await tx`INSERT INTO product_media (product_id, media_asset_id) VALUES (${productId}, ${asset})`;
          const restricted = await pgFailure(
            tx,
            (sp) => sp`DELETE FROM media_asset WHERE id = ${asset}`,
          );
          await tx`DELETE FROM product_media WHERE media_asset_id = ${asset}`;
          await tx`DELETE FROM media_asset WHERE id = ${asset}`;
          const [left] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM media_variant WHERE media_asset_id = ${asset}`;
          return { restricted, variantsLeft: left?.n };
        });
        expect(result.restricted.code).toBe("23503");
        expect(result.variantsLeft).toBe(0);
      });
    });
  },
);
