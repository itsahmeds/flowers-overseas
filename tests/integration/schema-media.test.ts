/**
 * Migration `0004` as the database actually holds it — T-11 and the connected half of T-06's
 * `bytea` rule (spec 002 §9 AC-11, AC-22; AC-10; TASK-017).
 *
 *  - **catalogue**: the four tables exist and belong to `app_owner`; **no column of type `bytea`
 *    exists anywhere** in the database's own schemas (ADR-0015: keys, never bytes); the AC-11
 *    index is unique, keyed on `product_id`, restricted to `is_primary`; `alt` is `NOT NULL`.
 *  - **behaviour**, in one transaction that is always rolled back (Phase 0 has one shared
 *    database, spec 002 §13 Q5): a second primary image for a product is rejected **by
 *    `product_media_primary_idx`** while a primary for another product and a second non-primary
 *    image are accepted; an alt row without `alt`, with a null `alt` or with a blank `alt` is
 *    rejected and a real one accepted; plus the key, checksum, review and delete rules.
 *
 * Every rejection is recorded with the constraint (or the not-null column) that produced it, so a
 * primary-key collision cannot stand in for the rule under test.
 *
 * Runs on a migrated scratch database of a disposable local Postgres 16 (CI's service container
 * included) and skips when none answers (`support/scratch-db.ts`; TASK-022 turned it on in CI).
 */
import type postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { ALT_CHECK_SQL } from "../../db/schema/media.ts";
import { ALT_LETTER_OR_DIGIT } from "../../seed/schema/media.ts";
import { REAL_ALTS, UNANNOUNCED_ALTS } from "../fixtures/alt-text.ts";
import { probeLocalServer, scratchDatabase } from "./support/scratch-db.ts";

// TASK-022: runs on a migrated scratch database of a disposable local Postgres 16 — CI's
// service container included, which turns T-11 on in CI — and never on the shared database.
const server = await probeLocalServer();
const scratch =
  server.url === undefined
    ? undefined
    : await scratchDatabase(server.url, "media");
const sql = scratch?.sql;

afterAll(async () => {
  await scratch?.drop();
});

const TABLES = [
  "media_asset",
  "media_variant",
  "product_media",
  "product_media_alt",
] as const;

/** What rejected a statement: the constraint, or the column a not-null violation names. */
function rejectedBy(error: unknown): string {
  if (error === null || typeof error !== "object")
    return "(not a database error)";
  const record = error as {
    code?: unknown;
    constraint_name?: unknown;
    column_name?: unknown;
  };
  if (record.code === "23502" && typeof record.column_name === "string") {
    return `not-null ${record.column_name}`;
  }
  return typeof record.constraint_name === "string"
    ? record.constraint_name
    : "(no constraint name)";
}

/** Keys outside the alphabet (hole 4, PR 184): dot segments, empty segments, edge slashes. */
const BAD_KEYS: readonly string[] = [
  "/originals/product/x",
  "originals/../../etc/passwd",
  "media/product/..",
  "a/./b",
  "./a",
  "media//x",
  "media//x/",
  "a/",
  "media/product/a..b/640.avif",
];

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SHA_D = "d".repeat(64);

describe.skipIf(sql === undefined)("migration 0004 applied — media", () => {
  const db = sql as NonNullable<typeof sql>;

  describe("catalogue", () => {
    it("has created the four tables, owned by app_owner", async () => {
      const rows = await db<{ tablename: string; tableowner: string }[]>`
        SELECT tablename, tableowner FROM pg_tables
        WHERE schemaname = 'public' AND tablename IN ${db([...TABLES])}
        ORDER BY tablename
      `;
      expect(rows.map((row) => row.tablename)).toEqual([...TABLES]);
      for (const row of rows) {
        expect(row.tableowner, row.tablename).toBe("app_owner");
      }
    });

    it("AC-22 — holds no bytea or oid column in any schema of ours, pgboss included", async () => {
      // `pg_attribute`, not `information_schema.columns`: the catalogue sees every relation
      // whatever the connecting role may read, and `oid` (a large-object handle) is binary storage
      // by another name. Every non-system schema, so pg-boss's vendor schema is held to AC-22 too
      // (breaker hole 6, PR 224).
      // One scan, two readings: the binary columns, and the schemas the scan covered — so the
      // filter is proven to reach `pgboss`. (`'pg\\_%'`: a template literal cooks `\_` to `_`,
      // a LIKE wildcard that would silently drop `pgboss` from the scan.)
      const rows = await db<
        { schema: string; where: string; binary: boolean }[]
      >`
        SELECT n.nspname AS schema,
               n.nspname || '.' || c.relname || '.' || a.attname AS where,
               a.atttypid IN ('bytea'::regtype, 'oid'::regtype) AS binary
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE a.attnum > 0 AND NOT a.attisdropped
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg\\_%'
      `;
      expect(rows.filter((row) => row.binary).map((row) => row.where)).toEqual(
        [],
      );
      expect([...new Set(rows.map((row) => row.schema))].sort()).toEqual([
        "pgboss",
        "public",
      ]);
    });

    it("AC-11 — declares the one-primary index unique, on product_id, where is_primary", async () => {
      const [row] = await db<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'product_media_primary_idx'
      `;
      expect(row?.indexdef).toMatch(
        /^CREATE UNIQUE INDEX product_media_primary_idx ON public\.product_media USING btree \(product_id\) WHERE is_primary$/,
      );
    });

    it("AC-11 — checks alt for a letter or a digit under ICU, not under the database's LC_CTYPE", async () => {
      const [row] = await db<{ definition: string }[]>`
        SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conname = 'product_media_alt_alt_check'
      `;
      expect(row?.definition).toContain(
        "COLLATE \"und-x-icu\") ~ '[[:alnum:]]'",
      );
    });

    it("AC-11 — accepts no single character as alt text that the seed's AltEntrySchema refuses", async () => {
      // Every code point the deployed rule calls a letter or a digit must be one to the seed too,
      // so nothing invisible gets into the table by a route the seed would have stopped. The
      // other direction differs only by letters newer than the server's ICU.
      const [row] = await db.unsafe<{ accepted: number[] | null }[]>(`
        SELECT array_agg(cp ORDER BY cp) AS accepted
        FROM generate_series(1, 1114111) AS cp, LATERAL (SELECT chr(cp) AS alt) AS probe
        WHERE (cp < 55296 OR cp > 57343) AND ${ALT_CHECK_SQL}
      `);
      const accepted = row?.accepted ?? [];
      expect(accepted.length).toBeGreaterThan(100_000);
      expect(
        accepted
          .filter(
            (code) => !ALT_LETTER_OR_DIGIT.test(String.fromCodePoint(code)),
          )
          .map((code) => code.toString(16)),
      ).toEqual([]);
    });

    it("AC-11 — declares product_media_alt.alt NOT NULL", async () => {
      const [row] = await db<{ is_nullable: string }[]>`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_media_alt'
          AND column_name = 'alt'
      `;
      expect(row?.is_nullable).toBe("NO");
    });

    it("gives every table an updated_at trigger on the shared function (AC-10)", async () => {
      const rows = await db<{ table_name: string }[]>`
        SELECT rel.relname AS table_name
        FROM pg_trigger trg
        JOIN pg_class rel ON rel.oid = trg.tgrelid
        JOIN pg_proc pro ON pro.oid = trg.tgfoid
        WHERE NOT trg.tgisinternal
          AND pro.proname = 'set_updated_at'
          AND rel.relname IN ${db([...TABLES])}
        ORDER BY rel.relname
      `;
      expect(rows.map((row) => row.table_name)).toEqual([...TABLES]);
    });
  });

  it(
    "T-11 — rejects a second primary image and an alt row without alt; accepts the valid rows",
    { timeout: 60_000 },
    async () => {
      const failures: string[] = [];
      const accepted: string[] = [];
      let primaries: string[] = [];
      let variantsAfterDelete = -1;
      let advanced = false;

      await db
        .begin(async (tx) => {
          /**
           * Run a statement that must fail, inside a savepoint, and record what refused it. The
           * savepoint is rolled back on both paths, so a statement that is wrongly *accepted* is
           * recorded as `ACCEPTED` and leaves no row behind to disturb the cases after it.
           */
          const refuse = async (
            label: string,
            statement: (sp: postgres.TransactionSql) => Promise<unknown>,
          ): Promise<void> => {
            await tx
              .savepoint(async (sp) => {
                try {
                  await statement(sp);
                } catch (error: unknown) {
                  failures.push(`${label}: ${rejectedBy(error)}`);
                  throw new Error("expected rejection");
                }
                failures.push(`${label}: ACCEPTED`);
                throw new Error("undo the accepted statement");
              })
              .catch(() => undefined);
          };

          await tx`INSERT INTO locale (code, bcp47, name) VALUES ('zz', 'zz', 'Test locale')`;
          await tx`INSERT INTO locale (code, bcp47, name) VALUES ('zy', 'zy', 'Test locale 2')`;

          const product = async (sku: string): Promise<string> => {
            const [row] = await tx<{ id: string }[]>`
              INSERT INTO product (
                sku, product_type, primary_flower, colour_primary, style, price_tier,
                substitution_class, freshness_days
              )
              VALUES (${sku}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
              RETURNING id
            `;
            return row?.id ?? "";
          };
          const asset = async (
            key: string,
            checksum: string,
            updatedAt: string | null = null,
          ): Promise<string> => {
            const [row] = await tx<{ id: string }[]>`
              INSERT INTO media_asset (
                kind, bucket, object_key, mime, width, height, bytes, checksum_sha256,
                visibility, source, depicts, updated_at
              )
              VALUES (
                'product', 'fo-media-test', ${key}, 'image/avif', 2000, 2500, 123456,
                ${checksum}, 'public', 'ai', 'product',
                COALESCE(${updatedAt}::timestamptz, now())
              )
              RETURNING id
            `;
            return row?.id ?? "";
          };

          const productA = await product("FO-ZZ-901");
          const productB = await product("FO-ZZ-902");
          const hero = await asset(
            "originals/product/zz-901-hero",
            SHA_A,
            new Date(Date.now() - 86_400_000).toISOString(),
          );
          const detail = await asset("originals/product/zz-901-detail", SHA_B);
          const other = await asset("originals/product/zz-902-hero", SHA_C);

          /* --------------------------------------------- AC-11: one primary */

          const [heroImage] = await tx<{ id: string }[]>`
            INSERT INTO product_media (product_id, media_asset_id, sort, is_primary)
            VALUES (${productA}, ${hero}, 0, true) RETURNING id
          `;
          const heroImageId = heroImage?.id ?? "";

          await refuse(
            "product_media second primary",
            (sp) => sp`
            INSERT INTO product_media (product_id, media_asset_id, sort, is_primary)
            VALUES (${productA}, ${detail}, 1, true)
          `,
          );

          await tx`
            INSERT INTO product_media (product_id, media_asset_id, sort, is_primary)
            VALUES (${productA}, ${detail}, 1, false)
          `;
          accepted.push("product_media second image, not primary");

          await refuse(
            "product_media promote a second primary",
            (sp) => sp`
            UPDATE product_media SET is_primary = true
            WHERE product_id = ${productA} AND media_asset_id = ${detail}
          `,
          );

          await tx`
            INSERT INTO product_media (product_id, media_asset_id, sort, is_primary)
            VALUES (${productB}, ${other}, 0, true)
          `;
          accepted.push("product_media primary of another product");

          // Moving the primary is two statements: demote, then promote.
          await tx`
            UPDATE product_media SET is_primary = false
            WHERE product_id = ${productA} AND media_asset_id = ${hero}
          `;
          await tx`
            UPDATE product_media SET is_primary = true
            WHERE product_id = ${productA} AND media_asset_id = ${detail}
          `;
          accepted.push("product_media primary moved");
          primaries = (
            await tx<{ object_key: string }[]>`
              SELECT a.object_key FROM product_media pm
              JOIN media_asset a ON a.id = pm.media_asset_id
              WHERE pm.is_primary AND pm.product_id IN (${productA}, ${productB})
              ORDER BY a.object_key
            `
          ).map((row) => row.object_key);

          await refuse(
            "product_media same asset twice",
            (sp) => sp`
            INSERT INTO product_media (product_id, media_asset_id, sort, is_primary)
            VALUES (${productA}, ${hero}, 2, false)
          `,
          );

          /* --------------------------------------------- AC-11: alt NOT NULL */

          await refuse(
            "product_media_alt without alt",
            (sp) => sp`
            INSERT INTO product_media_alt (product_media_id, locale_code)
            VALUES (${heroImageId}, 'zz')
          `,
          );
          await refuse(
            "product_media_alt null alt",
            (sp) => sp`
            INSERT INTO product_media_alt (product_media_id, locale_code, alt)
            VALUES (${heroImageId}, 'zz', NULL)
          `,
          );
          await refuse(
            "product_media_alt blank alt",
            (sp) => sp`
            INSERT INTO product_media_alt (product_media_id, locale_code, alt)
            VALUES (${heroImageId}, 'zz', '   ')
          `,
          );
          for (const [name, alt] of UNANNOUNCED_ALTS) {
            await refuse(
              `product_media_alt blank alt (${name})`,
              (sp) => sp`
              INSERT INTO product_media_alt (product_media_id, locale_code, alt)
              VALUES (${heroImageId}, 'zz', ${alt})
            `,
            );
          }
          await tx`
            INSERT INTO product_media_alt (product_media_id, locale_code, alt)
            VALUES (${heroImageId}, 'zz', 'Twelve red roses in a kraft wrap')
          `;
          await tx`
            INSERT INTO product_media_alt (product_media_id, locale_code, alt)
            VALUES (${heroImageId}, 'zy', 'Dwanaście czerwonych róż')
          `;
          accepted.push("product_media_alt one row per locale");
          for (const [index, alt] of REAL_ALTS.entries()) {
            await tx
              .savepoint(async (sp) => {
                await sp`
                  UPDATE product_media_alt SET alt = ${alt}
                  WHERE product_media_id = ${heroImageId} AND locale_code = 'zz'
                `;
                accepted.push(`product_media_alt real alt ${String(index)}`);
                throw new Error("undo the probe");
              })
              .catch((error: unknown) => {
                if (
                  !(error instanceof Error) ||
                  error.message !== "undo the probe"
                ) {
                  failures.push(
                    `product_media_alt real alt ${String(index)}: ${rejectedBy(error)}`,
                  );
                }
              });
          }
          await refuse(
            "product_media_alt second row for a locale",
            (sp) => sp`
            INSERT INTO product_media_alt (product_media_id, locale_code, alt)
            VALUES (${heroImageId}, 'zz', 'Another alt')
          `,
          );

          /* ----------------------------------------- AC-22: keys and facts */

          for (const [index, key] of BAD_KEYS.entries()) {
            const variant = `bad-${String(index)}`;
            await refuse(
              `media_asset key ${key}`,
              (sp) => sp`
              INSERT INTO media_asset (
                kind, bucket, object_key, mime, width, height, bytes, checksum_sha256,
                visibility, source, depicts
              )
              VALUES (
                'product', 'fo-media-test', ${key}, 'image/avif', 1, 1, 1,
                ${SHA_D}, 'public', 'ai', 'product'
              )
            `,
            );
            await refuse(
              `media_variant key ${key}`,
              (sp) => sp`
              INSERT INTO media_variant (
                media_asset_id, variant, object_key, format, width, height, bytes,
                checksum_sha256
              )
              VALUES (${hero}, ${variant}, ${key}, 'avif', 1, 1, 1, ${SHA_C})
            `,
            );
          }
          await refuse(
            "media_asset duplicate key",
            (sp) => sp`
            INSERT INTO media_asset (
              kind, bucket, object_key, mime, width, height, bytes, checksum_sha256,
              visibility, source, depicts
            )
            VALUES (
              'product', 'fo-media-test', 'originals/product/zz-901-hero', 'image/avif', 1, 1,
              1, ${SHA_D}, 'public', 'ai', 'product'
            )
          `,
          );
          await refuse(
            "media_asset upper-case checksum",
            (sp) => sp`
            INSERT INTO media_asset (
              kind, bucket, object_key, mime, width, height, bytes, checksum_sha256,
              visibility, source, depicts
            )
            VALUES (
              'product', 'fo-media-test', 'originals/product/upper', 'image/avif', 1, 1, 1,
              ${"A".repeat(64)}, 'public', 'ai', 'product'
            )
          `,
          );
          await refuse(
            "media_asset without visibility",
            (sp) => sp`
            INSERT INTO media_asset (
              kind, bucket, object_key, mime, width, height, bytes, checksum_sha256,
              source, depicts
            )
            VALUES (
              'product', 'fo-media-test', 'originals/product/novis', 'image/avif', 1, 1, 1,
              ${SHA_D}, 'ai', 'product'
            )
          `,
          );
          await refuse(
            "media_asset image without dimensions",
            (sp) => sp`
            INSERT INTO media_asset (
              kind, bucket, object_key, mime, bytes, checksum_sha256, visibility, source,
              depicts
            )
            VALUES (
              'product', 'fo-media-test', 'originals/product/nodims', 'image/avif', 1,
              ${SHA_D}, 'public', 'ai', 'product'
            )
          `,
          );
          await tx`
            INSERT INTO media_asset (
              kind, bucket, object_key, mime, bytes, checksum_sha256, visibility, source,
              depicts
            )
            VALUES (
              'partner', 'fo-media-test', 'originals/partner/statement-zz', 'application/pdf',
              4096, ${SHA_D}, 'private', 'partner', 'context'
            )
          `;
          accepted.push("media_asset a PDF with no pixel size");
          // Since `0023` (spec 012b, TASK-293) an approval also needs the review ledger: the
          // flag `attest()` sets and an approved row for the asset's checksum in this
          // transaction. With both in place, the check below is what refuses.
          await tx`SELECT set_config('app.allow_review_write', 'on', true)`;
          await tx`
            INSERT INTO review_attestation (subject_kind, subject_ref, value_hash, decision,
                                            attester_name, channel)
            VALUES ('media_asset', ${SHA_B}, ${SHA_B}, 'approved', 'A. Reviewer', 'import')
          `;
          await refuse(
            "media_asset approved without reviewer",
            (sp) => sp`
            UPDATE media_asset SET review_state = 'approved' WHERE id = ${detail}
          `,
          );
          await tx`
            UPDATE media_asset
            SET review_state = 'approved', reviewed_by = 'A. Reviewer', reviewed_at = now()
            WHERE id = ${detail}
          `;
          accepted.push("media_asset approved with reviewer and date");

          /* ------------------------------------------ variants and deletes */

          await tx`
            INSERT INTO media_variant (
              media_asset_id, variant, object_key, format, width, height, bytes, checksum_sha256
            )
            VALUES
              (${other}, '640', 'media/product/zz-902-hero/640.avif', 'avif', 640, 800, 9000, ${SHA_A}),
              (${other}, '640', 'media/product/zz-902-hero/640.webp', 'webp', 640, 800, 9500, ${SHA_B})
          `;
          accepted.push("media_variant two formats of one width");
          await refuse(
            "media_variant same (asset, variant, format)",
            (sp) => sp`
            INSERT INTO media_variant (
              media_asset_id, variant, object_key, format, width, height, bytes, checksum_sha256
            )
            VALUES (${other}, '640', 'media/product/zz-902-hero/640-b.avif', 'avif', 640, 800, 1, ${SHA_C})
          `,
          );
          await refuse(
            "media_variant unknown format",
            (sp) => sp`
            INSERT INTO media_variant (
              media_asset_id, variant, object_key, format, width, height, bytes, checksum_sha256
            )
            VALUES (${other}, '640', 'media/product/zz-902-hero/640.png', 'png', 640, 800, 1, ${SHA_C})
          `,
          );

          await refuse(
            "media_asset delete while shown on a product",
            (sp) => sp`
            DELETE FROM media_asset WHERE id = ${other}
          `,
          );
          await tx`DELETE FROM product_media WHERE media_asset_id = ${other}`;
          await tx`DELETE FROM media_asset WHERE id = ${other}`;
          const [left] = await tx<{ count: string }[]>`
            SELECT count(*)::text AS count FROM media_variant WHERE media_asset_id = ${other}
          `;
          variantsAfterDelete = Number(left?.count ?? -1);

          /* --------------------------------------------------------- AC-10 */

          const [before] = await tx<{ updated_at: string }[]>`
            SELECT updated_at::text FROM media_asset WHERE id = ${hero}
          `;
          await tx`UPDATE media_asset SET created_at = created_at WHERE id = ${hero}`;
          const [after] = await tx<{ updated_at: string }[]>`
            SELECT updated_at::text FROM media_asset WHERE id = ${hero}
          `;
          advanced =
            Date.parse(after?.updated_at ?? "") >
            Date.parse(before?.updated_at ?? "");

          throw new Error(
            "rollback: this test leaves the shared database untouched",
          );
        })
        .catch((error: unknown) => {
          if (
            !(error instanceof Error) ||
            !error.message.startsWith("rollback:")
          ) {
            throw error;
          }
        });

      expect(failures.sort()).toEqual(
        [
          "media_asset approved without reviewer: media_asset_reviewed_check",
          "media_asset delete while shown on a product: product_media_media_asset_id_media_asset_id_fk",
          "media_asset duplicate key: media_asset_object_key_key",
          "media_asset image without dimensions: media_asset_image_dimensions_check",
          ...BAD_KEYS.map(
            (key) => `media_asset key ${key}: media_asset_object_key_check`,
          ),
          "media_asset upper-case checksum: media_asset_checksum_sha256_check",
          "media_asset without visibility: not-null visibility",
          "media_variant same (asset, variant, format): media_variant_pkey",
          ...BAD_KEYS.map(
            (key) => `media_variant key ${key}: media_variant_object_key_check`,
          ),
          "media_variant unknown format: media_variant_format_check",
          "product_media promote a second primary: product_media_primary_idx",
          "product_media same asset twice: product_media_product_asset_key",
          "product_media second primary: product_media_primary_idx",
          "product_media_alt blank alt: product_media_alt_alt_check",
          ...UNANNOUNCED_ALTS.map(
            ([name]) =>
              `product_media_alt blank alt (${name}): product_media_alt_alt_check`,
          ),
          "product_media_alt null alt: not-null alt",
          "product_media_alt second row for a locale: product_media_alt_pkey",
          "product_media_alt without alt: not-null alt",
        ].sort(),
      );
      expect(accepted.sort()).toEqual(
        [
          "media_asset a PDF with no pixel size",
          "media_asset approved with reviewer and date",
          "media_variant two formats of one width",
          "product_media primary moved",
          "product_media primary of another product",
          "product_media second image, not primary",
          "product_media_alt one row per locale",
          ...REAL_ALTS.map(
            (_alt, index) => `product_media_alt real alt ${String(index)}`,
          ),
        ].sort(),
      );
      expect(primaries).toEqual([
        "originals/product/zz-901-detail",
        "originals/product/zz-902-hero",
      ]);
      expect(variantsAfterDelete).toBe(0);
      expect(advanced, "media_asset.updated_at advanced").toBe(true);

      const [survivors] = await db<{ count: string }[]>`
        SELECT count(*)::text AS count FROM product WHERE sku LIKE 'FO-ZZ-9%'
      `;
      expect(survivors?.count).toBe("0");
    },
  );
});
