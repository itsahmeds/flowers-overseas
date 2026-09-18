/**
 * Migration `0002` as the database actually holds it — the connected half of T-06 and of T-08
 * (spec 002 §9 AC-7, §10 T-06/T-08; TASK-015).
 *
 * Two kinds of assertion, and the split matters:
 *
 *  - **catalogue** (`pg_extension`, `pg_type`, `information_schema`, `pg_constraint`): no
 *    extension beyond `plpgsql`, no `enum` type anywhere, a `CHECK` value list on every closed
 *    value column, no `numeric`/float column, and the tables, foreign keys and uniqueness of §5.1
 *    exactly as declared. Read-only.
 *  - **behaviour** (T-08 proper): a duplicate `(locale_code, slug)` is *rejected*, and the same
 *    city slug in two different countries is *accepted* while the same slug twice in one country
 *    is not. Those run inside a transaction that is always rolled back, because Phase 0 has one
 *    shared database (spec 002 §13 Q5) and a test may not leave a row behind.
 *
 * The suite skips itself when no real database is reachable — `DATABASE_URL_UNPOOLED` unset or
 * still the `.env.example` placeholder — so `pnpm test:integration` stays green on a clean clone
 * and in CI, where spec 002 has no Neon credentials. AC-4's own migrate/rollback round trip is
 * TASK-022's; this file asserts the *result* of a migration somebody has applied.
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

/**
 * The direct connection string, or undefined when only the placeholder is available. The runner,
 * `db:check` and this suite all use the *unpooled* URL (spec 002 §13 Q6): a transaction pooler
 * keeps no session state, and these assertions read catalogues and open transactions.
 */
function liveDatabaseUrl(): string | undefined {
  const local = readDotEnv(join(process.cwd(), ".env.local"));
  const url =
    process.env.DATABASE_URL_UNPOOLED ??
    local.DATABASE_URL_UNPOOLED ??
    process.env.DATABASE_URL ??
    local.DATABASE_URL;
  if (url === undefined || url === "") return undefined;
  // The `.env.example` placeholder, and any other localhost default, is not a database to assert
  // against: skipping is honest, failing would be noise.
  return /localhost|127\.0\.0\.1/.test(url) ? undefined : url;
}

const databaseUrl = liveDatabaseUrl();
const sql =
  databaseUrl === undefined ? undefined : postgres(databaseUrl, { max: 1 });

afterAll(async () => {
  await sql?.end();
});

/** The fifteen tables migration `0002` creates (§5.1 `i18n` + `geo`). */
const TABLES = [
  "locale",
  "message_catalog",
  "currency",
  "country",
  "country_translation",
  "country_locale_content",
  "region",
  "city",
  "city_translation",
  "postcode_zone",
  "country_holiday",
  "occasion",
  "occasion_translation",
  "occasion_country",
  "fx_rate",
] as const;

describe.skipIf(sql === undefined)(
  "migration 0002 applied — i18n + geo",
  () => {
    const db = sql as NonNullable<typeof sql>;

    /* ---------------------------------------------------------------- T-06 */

    describe("T-06 — no extension, no enum, a CHECK list on every status column", () => {
      it("has created no extension beyond plpgsql", async () => {
        const rows = await db<{ extname: string }[]>`
        SELECT extname FROM pg_extension ORDER BY extname
      `;
        expect(rows.map((row) => row.extname)).toEqual(["plpgsql"]);
      });

      it("has created no enum type", async () => {
        const rows = await db<{ typname: string }[]>`
        SELECT t.typname
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typtype = 'e' AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      `;
        expect(rows).toEqual([]);
      });

      it("gives every closed value column a CHECK value list", async () => {
        // "Status column" as the reviewer would read it: a text column whose name is or ends in
        // one of the words this schema uses for a closed value set.
        const rows = await db<{ table_name: string; column_name: string }[]>`
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = ANY(${db.array([...TABLES])})
          AND (
            c.column_name IN ('status', 'state', 'kind', 'source', 'rule_type')
            OR c.column_name LIKE '%_status'
            OR c.column_name LIKE '%_state'
            OR c.column_name LIKE '%_kind'
            OR c.column_name LIKE '%_style'
            OR c.column_name LIKE '%_model'
          )
        ORDER BY c.table_name, c.column_name
      `;
        expect(rows.length).toBeGreaterThan(0);

        // One documented exemption: `fx_rate.source` names the *provider* of a rate ("ecb"), an
        // open set that grows without a migration, and is not a status. Every other match is a
        // closed value set and must carry its list.
        const closed = rows.filter(
          (row) =>
            !(row.table_name === "fx_rate" && row.column_name === "source"),
        );

        const checks = await db<{ table_name: string; definition: string }[]>`
        SELECT rel.relname AS table_name, pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE con.contype = 'c' AND nsp.nspname = 'public'
      `;

        for (const { table_name: table, column_name: column } of closed) {
          const list = checks.find(
            (check) =>
              check.table_name === table &&
              new RegExp(`\\b${column}\\b`).test(check.definition) &&
              /ANY \(ARRAY\[|IN \(/.test(check.definition),
          );
          expect(
            list,
            `${table}.${column} has no CHECK value list`,
          ).toBeDefined();
        }
      });

      it("has no numeric, float or money column anywhere in the migration's tables", async () => {
        const rows = await db<
          { table_name: string; column_name: string; data_type: string }[]
        >`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY(${db.array([...TABLES])})
          AND data_type IN ('numeric', 'real', 'double precision', 'money')
      `;
        expect(rows).toEqual([]);
      });

      it("keeps the money-adjacent quantities integral", async () => {
        const rows = await db<
          { table_name: string; column_name: string; data_type: string }[]
        >`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name, column_name) IN (
            ('country', 'vat_rate_bp'),
            ('fx_rate', 'rate_ppm'),
            ('currency', 'minor_unit_exponent')
          )
        ORDER BY table_name, column_name
      `;
        expect(rows).toEqual([
          {
            table_name: "country",
            column_name: "vat_rate_bp",
            data_type: "integer",
          },
          {
            table_name: "currency",
            column_name: "minor_unit_exponent",
            data_type: "smallint",
          },
          {
            table_name: "fx_rate",
            column_name: "rate_ppm",
            data_type: "bigint",
          },
        ]);
      });
    });

    /* ---------------------------------------------------------------- T-08 */

    describe("T-08 — the geo tables, their foreign keys and their uniqueness", () => {
      it("has created all fifteen tables, owned by app_owner", async () => {
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

      it("declares the foreign keys of §5.1", async () => {
        const rows = await db<{ table_name: string; definition: string }[]>`
        SELECT rel.relname AS table_name, pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE con.contype = 'f'
          AND nsp.nspname = 'public'
          AND rel.relname = ANY(${db.array([...TABLES])})
      `;
        const actual = rows
          .map((row) => `${row.table_name}: ${row.definition}`)
          .sort();
        const expected = [
          "city: FOREIGN KEY (country_id) REFERENCES country(id) ON DELETE RESTRICT",
          "city: FOREIGN KEY (region_id, country_id) REFERENCES region(id, country_id) ON DELETE RESTRICT",
          "city_translation: FOREIGN KEY (city_id, country_id) REFERENCES city(id, country_id) ON DELETE CASCADE",
          "city_translation: FOREIGN KEY (locale_code) REFERENCES locale(code) ON DELETE RESTRICT",
          "country: FOREIGN KEY (currency_code) REFERENCES currency(code) ON DELETE RESTRICT",
          "country_holiday: FOREIGN KEY (country_id) REFERENCES country(id) ON DELETE CASCADE",
          "country_locale_content: FOREIGN KEY (country_id) REFERENCES country(id) ON DELETE CASCADE",
          "country_locale_content: FOREIGN KEY (locale_code) REFERENCES locale(code) ON DELETE RESTRICT",
          "country_translation: FOREIGN KEY (country_id) REFERENCES country(id) ON DELETE CASCADE",
          "country_translation: FOREIGN KEY (locale_code) REFERENCES locale(code) ON DELETE RESTRICT",
          "fx_rate: FOREIGN KEY (base_code) REFERENCES currency(code) ON DELETE RESTRICT",
          "fx_rate: FOREIGN KEY (quote_code) REFERENCES currency(code) ON DELETE RESTRICT",
          "locale: FOREIGN KEY (fallback_code) REFERENCES locale(code) ON DELETE RESTRICT",
          "message_catalog: FOREIGN KEY (locale_code) REFERENCES locale(code) ON DELETE RESTRICT",
          "occasion_country: FOREIGN KEY (country_id) REFERENCES country(id) ON DELETE CASCADE",
          "occasion_country: FOREIGN KEY (occasion_id) REFERENCES occasion(id) ON DELETE CASCADE",
          "occasion_translation: FOREIGN KEY (locale_code) REFERENCES locale(code) ON DELETE RESTRICT",
          "occasion_translation: FOREIGN KEY (occasion_id) REFERENCES occasion(id) ON DELETE CASCADE",
          "postcode_zone: FOREIGN KEY (city_id, country_id) REFERENCES city(id, country_id) ON DELETE RESTRICT",
          "region: FOREIGN KEY (country_id) REFERENCES country(id) ON DELETE RESTRICT",
        ];
        expect(actual).toEqual(expected);
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
        const actual = rows
          .map((row) => `${row.table_name}: ${row.definition}`)
          .sort();
        const expected = [
          "city: PRIMARY KEY (id)",
          "city: UNIQUE (id, country_id)",
          "city_translation: PRIMARY KEY (city_id, locale_code)",
          "city_translation: UNIQUE (locale_code, country_id, slug)",
          "country: PRIMARY KEY (id)",
          "country: UNIQUE (id, iso2)",
          "country: UNIQUE (iso2)",
          "country_holiday: PRIMARY KEY (country_id, date)",
          "country_locale_content: PRIMARY KEY (country_id, locale_code, state)",
          "country_translation: PRIMARY KEY (country_id, locale_code)",
          "country_translation: UNIQUE (locale_code, slug)",
          "currency: PRIMARY KEY (code)",
          "fx_rate: PRIMARY KEY (base_code, quote_code, as_of)",
          "locale: PRIMARY KEY (code)",
          "message_catalog: PRIMARY KEY (id)",
          "message_catalog: UNIQUE (locale_code, namespace, key)",
          "occasion: PRIMARY KEY (id)",
          "occasion: UNIQUE (key)",
          "occasion_country: PRIMARY KEY (occasion_id, country_id)",
          "occasion_translation: PRIMARY KEY (occasion_id, locale_code)",
          "occasion_translation: UNIQUE (locale_code, slug)",
          "postcode_zone: PRIMARY KEY (country_id, prefix)",
          "region: PRIMARY KEY (id)",
          "region: UNIQUE (country_id, code)",
          "region: UNIQUE (id, country_id)",
        ];
        expect(actual).toEqual(expected);
      });

      it("gives every table an updated_at trigger on the shared function", async () => {
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

      /**
       * The behavioural half. Everything happens inside one transaction that ends in a rollback,
       * so the shared Phase 0 database is byte-identical afterwards; the `savepoint` calls let an
       * expected failure be caught without poisoning the outer transaction.
       */
      it(
        "rejects a duplicate slug per locale and accepts the same city slug in two countries",
        { timeout: 60_000 },
        async () => {
          const failures: string[] = [];
          const accepted: string[] = [];

          await db
            .begin(async (tx) => {
              await tx`INSERT INTO locale (code, bcp47, name) VALUES ('zz', 'zz', 'Test locale')`;
              const [eur] = await tx<{ code: string }[]>`
            INSERT INTO currency (code, minor_unit_exponent) VALUES ('ZZZ', 2) RETURNING code
          `;
              const [first] = await tx<{ id: string }[]>`
            INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
            VALUES ('ZZ', ${eur?.code ?? "ZZZ"}, 2300, 'Europe/Warsaw') RETURNING id
          `;
              const [second] = await tx<{ id: string }[]>`
            INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
            VALUES ('ZY', ${eur?.code ?? "ZZZ"}, 1900, 'Europe/Berlin') RETURNING id
          `;
              const countryA = first?.id ?? "";
              const countryB = second?.id ?? "";

              // country_translation: UNIQUE (locale_code, slug)
              await tx`
            INSERT INTO country_translation (country_id, locale_code, name, slug)
            VALUES (${countryA}, 'zz', 'Alpha', 'alpha')
          `;
              await tx
                .savepoint(async (sp) => {
                  try {
                    await sp`
                INSERT INTO country_translation (country_id, locale_code, name, slug)
                VALUES (${countryB}, 'zz', 'Beta', 'alpha')
              `;
                  } catch {
                    failures.push("country_translation duplicate slug");
                    throw new Error("expected rejection");
                  }
                })
                .catch(() => undefined);

              // occasion_translation: UNIQUE (locale_code, slug)
              const [occasionA] = await tx<{ id: string }[]>`
            INSERT INTO occasion (key, kind) VALUES ('zz_test_a', 'evergreen') RETURNING id
          `;
              const [occasionB] = await tx<{ id: string }[]>`
            INSERT INTO occasion (key, kind) VALUES ('zz_test_b', 'seasonal') RETURNING id
          `;
              await tx`
            INSERT INTO occasion_translation (occasion_id, locale_code, name, slug)
            VALUES (${occasionA?.id ?? ""}, 'zz', 'Alpha', 'alpha-occasion')
          `;
              await tx
                .savepoint(async (sp) => {
                  try {
                    await sp`
                INSERT INTO occasion_translation (occasion_id, locale_code, name, slug)
                VALUES (${occasionB?.id ?? ""}, 'zz', 'Beta', 'alpha-occasion')
              `;
                  } catch {
                    failures.push("occasion_translation duplicate slug");
                    throw new Error("expected rejection");
                  }
                })
                .catch(() => undefined);

              // city_translation: UNIQUE (locale_code, country_id, slug)
              const [cityA] = await tx<{ id: string }[]>`
            INSERT INTO city (country_id) VALUES (${countryA}) RETURNING id
          `;
              const [cityA2] = await tx<{ id: string }[]>`
            INSERT INTO city (country_id) VALUES (${countryA}) RETURNING id
          `;
              const [cityB] = await tx<{ id: string }[]>`
            INSERT INTO city (country_id) VALUES (${countryB}) RETURNING id
          `;
              await tx`
            INSERT INTO city_translation (city_id, country_id, locale_code, name, slug)
            VALUES (${cityA?.id ?? ""}, ${countryA}, 'zz', 'Alpha city', 'alpha-city')
          `;
              // the same slug, same locale, a different country — legitimate, two real URLs
              await tx`
            INSERT INTO city_translation (city_id, country_id, locale_code, name, slug)
            VALUES (${cityB?.id ?? ""}, ${countryB}, 'zz', 'Alpha city', 'alpha-city')
          `;
              accepted.push("city_translation same slug across countries");
              // the same slug, same locale, same country — a collision
              await tx
                .savepoint(async (sp) => {
                  try {
                    await sp`
                INSERT INTO city_translation (city_id, country_id, locale_code, name, slug)
                VALUES (${cityA2?.id ?? ""}, ${countryA}, 'zz', 'Alpha city', 'alpha-city')
              `;
                  } catch {
                    failures.push(
                      "city_translation duplicate slug within a country",
                    );
                    throw new Error("expected rejection");
                  }
                })
                .catch(() => undefined);

              // a city_translation may not claim a country its city does not belong to
              await tx
                .savepoint(async (sp) => {
                  try {
                    await sp`
                INSERT INTO city_translation (city_id, country_id, locale_code, name, slug)
                VALUES (${cityA?.id ?? ""}, ${countryB}, 'zz', 'Wrong country', 'wrong-country')
              `;
                  } catch {
                    failures.push("city_translation country mismatch");
                    throw new Error("expected rejection");
                  }
                })
                .catch(() => undefined);

              // an unlisted rule_type is rejected by the CHECK list rather than by an enum (AC-7)
              await tx
                .savepoint(async (sp) => {
                  try {
                    await sp`
                INSERT INTO occasion_country (occasion_id, country_id, rule_type)
                VALUES (${occasionA?.id ?? ""}, ${countryA}, 'phase_of_moon')
              `;
                  } catch {
                    failures.push("occasion_country unlisted rule_type");
                    throw new Error("expected rejection");
                  }
                })
                .catch(() => undefined);

              // every rule_type of plan/03 §9 is accepted
              await tx`
            INSERT INTO occasion_country (occasion_id, country_id, rule_type, rule)
            VALUES (${occasionA?.id ?? ""}, ${countryA}, 'lent_sunday', ${tx.json({ n: 4 })})
          `;
              accepted.push("occasion_country lent_sunday");

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

          expect(failures.sort()).toEqual([
            "city_translation country mismatch",
            "city_translation duplicate slug within a country",
            "country_translation duplicate slug",
            "occasion_country unlisted rule_type",
            "occasion_translation duplicate slug",
          ]);
          expect(accepted.sort()).toEqual([
            "city_translation same slug across countries",
            "occasion_country lent_sunday",
          ]);

          // and nothing survived the rollback
          const [left] = await db<{ count: string }[]>`
        SELECT count(*)::text AS count FROM locale WHERE code = 'zz'
      `;
          expect(left?.count).toBe("0");
        },
      );
    });
  },
);
