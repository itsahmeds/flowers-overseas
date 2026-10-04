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
 * Skips itself when no real database is reachable — `DATABASE_URL_UNPOOLED` unset, a placeholder,
 * or the CI service container that has no migrations applied — exactly as
 * `schema-catalog-pricing.test.ts` does.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

function readDotEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const entries: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    entries[trimmed.slice(0, separator).replace(/^export\s+/, "")] = trimmed
      .slice(separator + 1)
      .trim();
  }
  return entries;
}

function liveDatabaseUrl(): string | undefined {
  const local = readDotEnv(join(process.cwd(), ".env.local"));
  const url =
    process.env.DATABASE_URL_UNPOOLED ??
    local.DATABASE_URL_UNPOOLED ??
    process.env.DATABASE_URL ??
    local.DATABASE_URL;
  if (url === undefined || url === "") return undefined;
  return /localhost|127\.0\.0\.1/.test(url) ? undefined : url;
}

const databaseUrl = liveDatabaseUrl();
const sql =
  databaseUrl === undefined ? undefined : postgres(databaseUrl, { max: 1 });

afterAll(async () => {
  await sql?.end();
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

/**
 * Alt texts a screen reader announces as nothing (hole 3, PR 184): each blank character on its
 * own, a CRLF and a mix. The database must refuse every one with `product_media_alt_alt_check`.
 * Built from code points so this file stays ASCII.
 */
const BLANK_ALTS: readonly (readonly [string, string])[] = [
  ["tab", "\t"],
  ["line feed", "\n"],
  ["carriage return", "\r"],
  ["CRLF", "\r\n"],
  ["space, tab, space", " \t "],
  ...[
    0x85, 0xa0, 0x1680, 0x180e, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
    0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x200b, 0x200c, 0x200d, 0x2028,
    0x2029, 0x202f, 0x205f, 0x2060, 0x3000, 0xfeff,
  ].map((code): readonly [string, string] => [
    `U+${code.toString(16).toUpperCase().padStart(4, "0")}`,
    String.fromCodePoint(code, code),
  ]),
  [
    "NBSP, ZWSP, U+3000, BOM",
    String.fromCodePoint(0xa0, 0x200b, 0x3000, 0xfeff),
  ],
];

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

    it("AC-22 — holds no bytea column in any schema of ours", async () => {
      const rows = await db<{ where: string }[]>`
        SELECT table_schema || '.' || table_name || '.' || column_name AS where
        FROM information_schema.columns
        WHERE data_type = 'bytea'
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
          AND table_schema NOT LIKE 'pg\_%'
      `;
      expect(rows.map((row) => row.where)).toEqual([]);
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
          for (const [name, alt] of BLANK_ALTS) {
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
          ...BLANK_ALTS.map(
            ([name]) =>
              `product_media_alt blank alt (${name}): product_media_alt_alt_check`,
          ),
          "product_media_alt null alt: not-null alt",
          "product_media_alt second row for a locale: product_media_alt_pkey",
          "product_media_alt without alt: not-null alt",
        ].sort(),
      );
      expect(accepted.sort()).toEqual([
        "media_asset a PDF with no pixel size",
        "media_asset approved with reviewer and date",
        "media_variant two formats of one width",
        "product_media primary moved",
        "product_media primary of another product",
        "product_media second image, not primary",
        "product_media_alt one row per locale",
      ]);
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
