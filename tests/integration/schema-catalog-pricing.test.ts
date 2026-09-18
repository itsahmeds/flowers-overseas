/**
 * Migration `0003` as the database actually holds it — the connected half of T-06, T-08, T-09 and
 * T-10 (spec 002 §9 AC-5, AC-8, AC-9, AC-10; §14 A5; TASK-016).
 *
 * Two kinds of assertion, and the split matters:
 *
 *  - **catalogue** (`information_schema`, `pg_constraint`, `pg_indexes`, `pg_trigger`): the eleven
 *    tables, their foreign keys, their uniqueness, the money pair of AC-5, the partial unique
 *    indexes of AC-9 and §14 A1, and the seven-value `rule_type` check of §14 A5. Read-only.
 *  - **behaviour**: a second open-ended `country_price` is *rejected* — including when `tier_key`
 *    and `surcharge_kind` are null, which is the case a plain partial unique index would miss —
 *    superseding then inserting *succeeds* and leaves the old row readable, a duplicate
 *    `(locale, slug)` is rejected per translation table, a second default tier is rejected, a
 *    `label_key` holding a literal is rejected, and an `UPDATE` that changes nothing still
 *    advances `updated_at`. Those run inside a transaction that is always rolled back, because
 *    Phase 0 has one shared database (spec 002 §13 Q5) and a test may not leave a row behind.
 *
 * The suite skips itself when no real database is reachable — `DATABASE_URL_UNPOOLED` unset or
 * still the `.env.example` placeholder — so `pnpm test:integration` stays green on a clean clone
 * and in CI, where spec 002 has no Neon credentials.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/** `KEY=value` pairs of a dotenv-style file, without interpolation or quoting rules. */
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

/** The direct connection string, or undefined when only a placeholder is available (§13 Q6). */
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

/** The eleven tables migration `0003` creates (§5.1 `catalog`, minus media — that is `0004`). */
const TABLES = [
  "category",
  "category_translation",
  "product",
  "product_translation",
  "product_tier",
  "product_category",
  "product_occasion",
  "addon",
  "addon_translation",
  "addon_country_price",
  "country_price",
] as const;

/** The constraint or index a Postgres error names, so a rejection records *what* rejected it. */
function constraintOf(error: unknown): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "constraint_name" in error
  ) {
    const name = (error as { constraint_name?: unknown }).constraint_name;
    if (typeof name === "string") return name;
  }
  return "(no constraint name)";
}

describe.skipIf(sql === undefined)(
  "migration 0003 applied — catalog + pricing",
  () => {
    const db = sql as NonNullable<typeof sql>;

    /* ---------------------------------------------------------------- T-06 */

    describe("T-06 — the money pair, and nothing float-shaped (AC-5)", () => {
      it("has created all eleven tables, owned by app_owner", async () => {
        const rows = await db<{ tablename: string; tableowner: string }[]>`
          SELECT tablename, tableowner FROM pg_tables
          WHERE schemaname = 'public' AND tablename = ANY(${db.array([...TABLES])})
          ORDER BY tablename
        `;
        expect(rows.map((row) => row.tablename)).toEqual([...TABLES].sort());
        for (const row of rows) {
          expect(row.tableowner, row.tablename).toBe("app_owner");
        }
      });

      it("pairs every *_minor column with a currency column in the same table", async () => {
        const money = await db<
          { table_name: string; column_name: string; data_type: string }[]
        >`
          SELECT table_name, column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = ANY(${db.array([...TABLES])})
            AND column_name LIKE '%_minor'
          ORDER BY table_name, column_name
        `;
        expect(money).toEqual([
          {
            table_name: "addon_country_price",
            column_name: "retail_minor",
            data_type: "bigint",
          },
          {
            table_name: "country_price",
            column_name: "retail_minor",
            data_type: "bigint",
          },
        ]);

        const currencies = await db<
          { table_name: string; is_nullable: string }[]
        >`
          SELECT table_name, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = ANY(${db.array(money.map((row) => row.table_name))})
            AND column_name = 'currency_code'
          ORDER BY table_name
        `;
        expect(currencies).toEqual([
          { table_name: "addon_country_price", is_nullable: "NO" },
          { table_name: "country_price", is_nullable: "NO" },
        ]);
      });

      it("has no numeric, float, money or bytea column anywhere in the migration's tables", async () => {
        const rows = await db<
          { table_name: string; column_name: string; data_type: string }[]
        >`
          SELECT table_name, column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = ANY(${db.array([...TABLES])})
            AND data_type IN ('numeric', 'real', 'double precision', 'money', 'bytea')
        `;
        expect(rows).toEqual([]);
      });

      it("declares the foreign keys of §5.1 and the two declared strengthenings", async () => {
        const rows = await db<{ table_name: string; definition: string }[]>`
          SELECT rel.relname AS table_name, pg_get_constraintdef(con.oid) AS definition
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
          WHERE con.contype = 'f'
            AND nsp.nspname = 'public'
            AND rel.relname = ANY(${db.array([...TABLES])})
        `;
        expect(
          rows.map((row) => `${row.table_name}: ${row.definition}`).sort(),
        ).toEqual([
          "addon_country_price: FOREIGN KEY (addon_id) REFERENCES addon(id) ON DELETE RESTRICT",
          "addon_country_price: FOREIGN KEY (country_id) REFERENCES country(id) ON DELETE RESTRICT",
          "addon_country_price: FOREIGN KEY (currency_code) REFERENCES currency(code) ON DELETE RESTRICT",
          "addon_translation: FOREIGN KEY (addon_id) REFERENCES addon(id) ON DELETE CASCADE",
          "addon_translation: FOREIGN KEY (locale_code) REFERENCES locale(code) ON DELETE RESTRICT",
          "category_translation: FOREIGN KEY (category_id) REFERENCES category(id) ON DELETE CASCADE",
          "category_translation: FOREIGN KEY (locale_code) REFERENCES locale(code) ON DELETE RESTRICT",
          "country_price: FOREIGN KEY (country_id) REFERENCES country(id) ON DELETE RESTRICT",
          "country_price: FOREIGN KEY (currency_code) REFERENCES currency(code) ON DELETE RESTRICT",
          "country_price: FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE RESTRICT",
          "country_price: FOREIGN KEY (product_id, tier_key) REFERENCES product_tier(product_id, tier_key) ON DELETE RESTRICT",
          "product_category: FOREIGN KEY (category_id) REFERENCES category(id) ON DELETE RESTRICT",
          "product_category: FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE",
          "product_occasion: FOREIGN KEY (occasion_id) REFERENCES occasion(id) ON DELETE RESTRICT",
          "product_occasion: FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE",
          "product_tier: FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE",
          "product_translation: FOREIGN KEY (locale_code) REFERENCES locale(code) ON DELETE RESTRICT",
          "product_translation: FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE",
        ]);
      });

      it("declares the uniqueness of §6 and §5.1", async () => {
        const rows = await db<{ table_name: string; definition: string }[]>`
          SELECT rel.relname AS table_name, pg_get_constraintdef(con.oid) AS definition
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
          WHERE con.contype IN ('p', 'u')
            AND nsp.nspname = 'public'
            AND rel.relname = ANY(${db.array([...TABLES])})
        `;
        expect(
          rows.map((row) => `${row.table_name}: ${row.definition}`).sort(),
        ).toEqual([
          "addon: PRIMARY KEY (id)",
          "addon: UNIQUE (key)",
          "addon_country_price: PRIMARY KEY (addon_id, country_id, active_from)",
          "addon_translation: PRIMARY KEY (addon_id, locale_code)",
          "category: PRIMARY KEY (id)",
          "category: UNIQUE (key)",
          "category_translation: PRIMARY KEY (category_id, locale_code)",
          "category_translation: UNIQUE (locale_code, slug)",
          "country_price: PRIMARY KEY (id)",
          "product: PRIMARY KEY (id)",
          "product: UNIQUE (sku)",
          "product_category: PRIMARY KEY (product_id, category_id)",
          "product_occasion: PRIMARY KEY (product_id, occasion_id)",
          "product_tier: PRIMARY KEY (product_id, tier_key)",
          "product_translation: PRIMARY KEY (product_id, locale_code)",
          "product_translation: UNIQUE (locale_code, slug)",
        ]);
      });

      it("creates exactly the indexes this migration measured for, and no others", async () => {
        const rows = await db<{ indexname: string; indexdef: string }[]>`
          SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = ANY(${db.array([...TABLES])})
          ORDER BY indexname
        `;
        // Primary keys and unique constraints bring their own index; everything else on this list
        // is an index the migration header argues for by naming the read it serves.
        expect(rows.map((row) => row.indexname)).toEqual([
          "addon_country_price_active_idx",
          "addon_country_price_country_active_idx",
          "addon_country_price_pkey",
          "addon_key_key",
          "addon_pkey",
          "addon_translation_pkey",
          "category_key_key",
          "category_pkey",
          "category_translation_locale_slug_key",
          "category_translation_pkey",
          "country_price_active_idx",
          "country_price_country_active_idx",
          "country_price_pkey",
          "product_category_category_idx",
          "product_category_pkey",
          "product_occasion_occasion_idx",
          "product_occasion_pkey",
          "product_pkey",
          "product_sku_key",
          "product_tier_default_idx",
          "product_tier_pkey",
          "product_translation_locale_slug_key",
          "product_translation_pkey",
        ]);

        const definition = (name: string): string =>
          rows.find((row) => row.indexname === name)?.indexdef ?? "";

        // AC-9 proper: unique, on the four key columns, restricted to the live rows, and
        // `NULLS NOT DISTINCT` — without which two null-tier rows would not collide at all.
        const active = definition("country_price_active_idx");
        expect(active).toContain("CREATE UNIQUE INDEX");
        expect(active).toContain(
          "(product_id, country_id, tier_key, surcharge_kind)",
        );
        expect(active).toContain("NULLS NOT DISTINCT");
        expect(active).toMatch(/WHERE \(?active_to IS NULL\)?/);

        // §14 A1 (a): one active add-on price per (add-on, country).
        const addonActive = definition("addon_country_price_active_idx");
        expect(addonActive).toContain("CREATE UNIQUE INDEX");
        expect(addonActive).toContain("(addon_id, country_id)");
        expect(addonActive).toMatch(/WHERE \(?active_to IS NULL\)?/);

        // §14 A1 (b): one default tier per product — the product is the key, `is_default` the
        // predicate.
        const defaultTier = definition("product_tier_default_idx");
        expect(defaultTier).toContain("CREATE UNIQUE INDEX");
        expect(defaultTier).toContain("(product_id)");
        expect(defaultTier).toContain("is_default");
      });

      it("gives every table an updated_at trigger on the shared function (AC-10)", async () => {
        const rows = await db<{ table_name: string }[]>`
          SELECT rel.relname AS table_name
          FROM pg_trigger trg
          JOIN pg_class rel ON rel.oid = trg.tgrelid
          JOIN pg_proc pro ON pro.oid = trg.tgfoid
          WHERE NOT trg.tgisinternal
            AND pro.proname = 'set_updated_at'
            AND rel.relname = ANY(${db.array([...TABLES])})
          ORDER BY rel.relname
        `;
        expect(rows.map((row) => row.table_name)).toEqual([...TABLES].sort());
      });

      it("§14 A5 — occasion_country accepts seven rule types", async () => {
        const [row] = await db<{ definition: string }[]>`
          SELECT pg_get_constraintdef(oid) AS definition
          FROM pg_constraint WHERE conname = 'occasion_country_rule_type_check'
        `;
        for (const value of [
          "fixed",
          "nth_weekday",
          "last_weekday",
          "easter_offset",
          "orthodox_easter_offset",
          "lent_sunday",
          "none",
        ]) {
          expect(row?.definition, value).toContain(`'${value}'`);
        }
      });
    });

    /* ------------------------------------------------- T-08, T-09 and T-10 */

    /**
     * One transaction, always rolled back: the shared Phase 0 database is byte-identical
     * afterwards, and the `savepoint` calls let an expected failure be caught without poisoning
     * the outer transaction.
     */
    it(
      "rejects a second active price, a duplicate slug and a second default tier; supersedes cleanly",
      { timeout: 60_000 },
      async () => {
        const failures: string[] = [];
        const accepted: string[] = [];
        let supersededActiveTo: string | null = null;
        const advanced: string[] = [];

        await db
          .begin(async (tx) => {
            await tx`INSERT INTO locale (code, bcp47, name) VALUES ('zz', 'zz', 'Test locale')`;
            await tx`INSERT INTO currency (code, minor_unit_exponent) VALUES ('ZZZ', 2)`;
            const [countryRow] = await tx<{ id: string }[]>`
              INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
              VALUES ('ZZ', 'ZZZ', 2300, 'Europe/Warsaw') RETURNING id
            `;
            const countryId = countryRow?.id ?? "";

            // `updated_at` is backdated on insert so that the trigger's `now()` — which is the
            // *transaction* timestamp, constant inside this block — is observably later.
            const [productRow] = await tx<{ id: string; updated_at: string }[]>`
              INSERT INTO product (
                sku, product_type, primary_flower, colour_primary, style, price_tier,
                substitution_class, freshness_days, updated_at
              )
              VALUES (
                'FO-ZZ-001', 'bouquet', 'roses', 'red', 'classic', 'classic',
                'main_flower', 5, now() - interval '1 day'
              )
              RETURNING id, updated_at
            `;
            const productId = productRow?.id ?? "";
            const [otherProduct] = await tx<{ id: string }[]>`
              INSERT INTO product (
                sku, product_type, primary_flower, colour_primary, style, price_tier,
                substitution_class, freshness_days
              )
              VALUES (
                'FO-ZZ-002', 'plant', 'orchids', 'white', 'minimal', 'premium',
                'florists_choice', 14
              )
              RETURNING id
            `;

            /* ------------------------------------------------------- T-08 */

            await tx`
              INSERT INTO product_translation (product_id, locale_code, name, slug, updated_at)
              VALUES (${productId}, 'zz', 'Alpha bouquet', 'alpha-bouquet', now() - interval '1 day')
            `;
            await tx
              .savepoint(async (sp) => {
                try {
                  await sp`
                    INSERT INTO product_translation (product_id, locale_code, name, slug)
                    VALUES (${otherProduct?.id ?? ""}, 'zz', 'Beta bouquet', 'alpha-bouquet')
                  `;
                } catch (error: unknown) {
                  failures.push(
                    `product_translation duplicate slug: ${constraintOf(error)}`,
                  );
                  throw new Error("expected rejection");
                }
              })
              .catch(() => undefined);

            const [categoryA] = await tx<{ id: string }[]>`
              INSERT INTO category (key, kind) VALUES ('bouquet', 'productType') RETURNING id
            `;
            const [categoryB] = await tx<{ id: string }[]>`
              INSERT INTO category (key, kind) VALUES ('roses', 'flowerType') RETURNING id
            `;
            await tx`
              INSERT INTO category_translation (category_id, locale_code, name, slug)
              VALUES (${categoryA?.id ?? ""}, 'zz', 'Bouquets', 'bouquets')
            `;
            await tx
              .savepoint(async (sp) => {
                try {
                  await sp`
                    INSERT INTO category_translation (category_id, locale_code, name, slug)
                    VALUES (${categoryB?.id ?? ""}, 'zz', 'Roses', 'bouquets')
                  `;
                } catch (error: unknown) {
                  failures.push(
                    `category_translation duplicate slug: ${constraintOf(error)}`,
                  );
                  throw new Error("expected rejection");
                }
              })
              .catch(() => undefined);

            // An unlisted category kind is rejected by the CHECK list rather than by an enum.
            await tx
              .savepoint(async (sp) => {
                try {
                  await sp`INSERT INTO category (key, kind) VALUES ('tulips', 'flower-type')`;
                } catch (error: unknown) {
                  failures.push(
                    `category unlisted kind: ${constraintOf(error)}`,
                  );
                  throw new Error("expected rejection");
                }
              })
              .catch(() => undefined);

            /* ------------------------------------------- tiers (§7, A1 b) */

            await tx`
              INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort, is_default)
              VALUES (${productId}, 'stems_12', 'catalog.tier.stems.twelve', 12, 0, true)
            `;
            await tx`
              INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort, is_default)
              VALUES (${productId}, 'stems_24', 'catalog.tier.stems.twentyFour', 24, 1, false)
            `;
            accepted.push("product_tier two tiers, one default");
            await tx
              .savepoint(async (sp) => {
                try {
                  await sp`
                    UPDATE product_tier SET is_default = true
                    WHERE product_id = ${productId} AND tier_key = 'stems_24'
                  `;
                } catch (error: unknown) {
                  failures.push(
                    `product_tier second default: ${constraintOf(error)}`,
                  );
                  throw new Error("expected rejection");
                }
              })
              .catch(() => undefined);
            // §7: a label is a message key, never a rendered literal.
            await tx
              .savepoint(async (sp) => {
                try {
                  await sp`
                    INSERT INTO product_tier (product_id, tier_key, label_key)
                    VALUES (${productId}, 'size_m', 'Medium (12 stems)')
                  `;
                } catch (error: unknown) {
                  failures.push(
                    `product_tier literal label: ${constraintOf(error)}`,
                  );
                  throw new Error("expected rejection");
                }
              })
              .catch(() => undefined);

            /* ------------------------------------------------------- T-09 */

            // The null-tier, null-surcharge base price: the case a plain partial unique index
            // would let through twice (AC-9).
            await tx`
              INSERT INTO country_price (
                product_id, country_id, retail_minor, currency_code, vat_rate_bp, active_from,
                updated_at
              )
              VALUES (
                ${productId}, ${countryId}, 12900, 'ZZZ', 800, DATE '2026-01-01',
                now() - interval '1 day'
              )
            `;
            await tx
              .savepoint(async (sp) => {
                try {
                  await sp`
                    INSERT INTO country_price (
                      product_id, country_id, retail_minor, currency_code, vat_rate_bp, active_from
                    )
                    VALUES (${productId}, ${countryId}, 13900, 'ZZZ', 800, DATE '2026-02-01')
                  `;
                } catch (error: unknown) {
                  failures.push(
                    `country_price second active row, null tier: ${constraintOf(error)}`,
                  );
                  throw new Error("expected rejection");
                }
              })
              .catch(() => undefined);

            // The same rule with a named tier, and a tier the product does not offer.
            await tx`
              INSERT INTO country_price (
                product_id, country_id, tier_key, retail_minor, currency_code, vat_rate_bp,
                active_from
              )
              VALUES (${productId}, ${countryId}, 'stems_12', 14900, 'ZZZ', 800, DATE '2026-01-01')
            `;
            await tx
              .savepoint(async (sp) => {
                try {
                  await sp`
                    INSERT INTO country_price (
                      product_id, country_id, tier_key, retail_minor, currency_code, vat_rate_bp,
                      active_from
                    )
                    VALUES (${productId}, ${countryId}, 'stems_12', 15900, 'ZZZ', 800, DATE '2026-03-01')
                  `;
                } catch (error: unknown) {
                  failures.push(
                    `country_price second active row, named tier: ${constraintOf(error)}`,
                  );
                  throw new Error("expected rejection");
                }
              })
              .catch(() => undefined);
            await tx
              .savepoint(async (sp) => {
                try {
                  await sp`
                    INSERT INTO country_price (
                      product_id, country_id, tier_key, retail_minor, currency_code, vat_rate_bp,
                      active_from
                    )
                    VALUES (${productId}, ${countryId}, 'size_l', 15900, 'ZZZ', 800, DATE '2026-03-01')
                  `;
                } catch (error: unknown) {
                  failures.push(
                    `country_price unknown tier: ${constraintOf(error)}`,
                  );
                  throw new Error("expected rejection");
                }
              })
              .catch(() => undefined);
            // A surcharge is its own row, so it does not collide with the base price.
            await tx`
              INSERT INTO country_price (
                product_id, country_id, retail_minor, currency_code, vat_rate_bp, surcharge_kind,
                active_from
              )
              VALUES (${productId}, ${countryId}, 1900, 'ZZZ', 800, 'sunday', DATE '2026-01-01')
            `;
            accepted.push(
              "country_price sunday surcharge beside the base price",
            );
            // A closed interval that ends before it starts is rejected.
            await tx
              .savepoint(async (sp) => {
                try {
                  await sp`
                    INSERT INTO country_price (
                      product_id, country_id, retail_minor, currency_code, vat_rate_bp,
                      surcharge_kind, active_from, active_to
                    )
                    VALUES (
                      ${productId}, ${countryId}, 1900, 'ZZZ', 800, 'peak_day',
                      DATE '2026-02-01', DATE '2026-01-01'
                    )
                  `;
                } catch (error: unknown) {
                  failures.push(
                    `country_price inverted interval: ${constraintOf(error)}`,
                  );
                  throw new Error("expected rejection");
                }
              })
              .catch(() => undefined);

            // Supersede, then insert: the new price is active and the old row survives with its
            // `active_to` — the Omnibus 30-day history (§8).
            await tx`
              UPDATE country_price SET active_to = DATE '2026-02-01'
              WHERE product_id = ${productId} AND country_id = ${countryId}
                AND tier_key IS NULL AND surcharge_kind IS NULL AND active_to IS NULL
            `;
            await tx`
              INSERT INTO country_price (
                product_id, country_id, retail_minor, currency_code, vat_rate_bp, active_from
              )
              VALUES (${productId}, ${countryId}, 13900, 'ZZZ', 800, DATE '2026-02-01')
            `;
            accepted.push("country_price supersede then insert");
            const history = await tx<
              { retail_minor: string; active_to: string | null }[]
            >`
              SELECT retail_minor::text, active_to::text FROM country_price
              WHERE product_id = ${productId} AND tier_key IS NULL AND surcharge_kind IS NULL
              ORDER BY active_from
            `;
            expect(history.map((row) => row.retail_minor)).toEqual([
              "12900",
              "13900",
            ]);
            supersededActiveTo = history[0]?.active_to ?? null;

            /* --------------------------------------- add-on prices (A1 a) */

            const [addonRow] = await tx<{ id: string }[]>`
              INSERT INTO addon (key, kind, allergen_note_required)
              VALUES ('chocolates', 'confectionery', true) RETURNING id
            `;
            await tx`
              INSERT INTO addon_country_price (
                addon_id, country_id, retail_minor, currency_code, vat_rate_bp, active_from
              )
              VALUES (${addonRow?.id ?? ""}, ${countryId}, 2900, 'ZZZ', 2300, DATE '2026-01-01')
            `;
            await tx
              .savepoint(async (sp) => {
                try {
                  await sp`
                    INSERT INTO addon_country_price (
                      addon_id, country_id, retail_minor, currency_code, vat_rate_bp, active_from
                    )
                    VALUES (${addonRow?.id ?? ""}, ${countryId}, 3100, 'ZZZ', 2300, DATE '2026-02-01')
                  `;
                } catch (error: unknown) {
                  failures.push(
                    `addon_country_price second active row: ${constraintOf(error)}`,
                  );
                  throw new Error("expected rejection");
                }
              })
              .catch(() => undefined);

            /* ------------------------------------------------------- T-10 */

            // An UPDATE that changes no other column still advances `updated_at`, so sitemap
            // `<lastmod>` cannot go stale (AC-10). `now()` is the *transaction* timestamp and this
            // whole block is one transaction, so each row under test was inserted with a backdated
            // `updated_at`: the trigger moving it to the transaction clock is the observable fact.
            // `SET created_at = created_at` writes nothing — the update has no other column.
            const [productBefore] = await tx<{ updated_at: string }[]>`
              SELECT updated_at::text FROM product WHERE id = ${productId}
            `;
            await tx`UPDATE product SET created_at = created_at WHERE id = ${productId}`;
            const [productAfter] = await tx<{ updated_at: string }[]>`
              SELECT updated_at::text FROM product WHERE id = ${productId}
            `;
            expect(
              Date.parse(productAfter?.updated_at ?? ""),
              "product.updated_at advanced",
            ).toBeGreaterThan(Date.parse(productBefore?.updated_at ?? ""));
            advanced.push("product");

            const [translationBefore] = await tx<{ updated_at: string }[]>`
              SELECT updated_at::text FROM product_translation
              WHERE product_id = ${productId} AND locale_code = 'zz'
            `;
            await tx`
              UPDATE product_translation SET created_at = created_at
              WHERE product_id = ${productId} AND locale_code = 'zz'
            `;
            const [translationAfter] = await tx<{ updated_at: string }[]>`
              SELECT updated_at::text FROM product_translation
              WHERE product_id = ${productId} AND locale_code = 'zz'
            `;
            expect(
              Date.parse(translationAfter?.updated_at ?? ""),
              "product_translation.updated_at advanced",
            ).toBeGreaterThan(Date.parse(translationBefore?.updated_at ?? ""));
            advanced.push("product_translation");

            // A price row untouched by the supersede above, so its `updated_at` is still the
            // backdated one this block inserted it with.
            await tx`
              INSERT INTO country_price (
                product_id, country_id, retail_minor, currency_code, vat_rate_bp, surcharge_kind,
                active_from, updated_at
              )
              VALUES (
                ${productId}, ${countryId}, 2400, 'ZZZ', 800, 'peak_day', DATE '2026-01-01',
                now() - interval '1 day'
              )
            `;
            const [priceBefore] = await tx<{ updated_at: string }[]>`
              SELECT updated_at::text FROM country_price
              WHERE product_id = ${productId} AND surcharge_kind = 'peak_day'
            `;
            await tx`
              UPDATE country_price SET created_at = created_at
              WHERE product_id = ${productId} AND surcharge_kind = 'peak_day'
            `;
            const [priceAfter] = await tx<{ updated_at: string }[]>`
              SELECT updated_at::text FROM country_price
              WHERE product_id = ${productId} AND surcharge_kind = 'peak_day'
            `;
            expect(
              Date.parse(priceAfter?.updated_at ?? ""),
              "country_price.updated_at advanced",
            ).toBeGreaterThan(Date.parse(priceBefore?.updated_at ?? ""));
            advanced.push("country_price");

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

        // The label *and* which constraint rejected: a primary-key collision or a slug-regex
        // CHECK would satisfy "it was rejected" just as the intended constraint does.
        expect(failures.sort()).toEqual([
          "addon_country_price second active row: addon_country_price_active_idx",
          "category unlisted kind: category_kind_check",
          "category_translation duplicate slug: category_translation_locale_slug_key",
          "country_price inverted interval: country_price_active_range_check",
          "country_price second active row, named tier: country_price_active_idx",
          "country_price second active row, null tier: country_price_active_idx",
          "country_price unknown tier: country_price_tier_fkey",
          "product_tier literal label: product_tier_label_key_check",
          "product_tier second default: product_tier_default_idx",
          "product_translation duplicate slug: product_translation_locale_slug_key",
        ]);
        expect(accepted.sort()).toEqual([
          "country_price sunday surcharge beside the base price",
          "country_price supersede then insert",
          "product_tier two tiers, one default",
        ]);
        expect(supersededActiveTo).toBe("2026-02-01");
        expect(advanced).toEqual([
          "product",
          "product_translation",
          "country_price",
        ]);

        // and nothing survived the rollback
        const [left] = await db<{ count: string }[]>`
          SELECT count(*)::text AS count FROM product WHERE sku LIKE 'FO-ZZ-%'
        `;
        expect(left?.count).toBe("0");
      },
    );
  },
);
