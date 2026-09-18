/**
 * Migration `0002` read as text: the offline half of T-06 and the structural half of T-08
 * (spec 002 §9 AC-7, §10 T-06/T-08; TASK-015).
 *
 * The connected assertions — `pg_extension`, `pg_type`, `information_schema` — live in
 * `tests/integration/schema-i18n-geo.test.ts` and need a database. Everything below is decidable
 * from the repository alone and therefore runs on every pull request, in every worktree, with no
 * credentials: "no extension", "no enum", "every closed value set is a CHECK list", "no float or
 * numeric next to money", and "the rollback drops exactly what the migration created".
 *
 * The scan is over **every** migration, not only `0002`, so the rules keep holding as `0003`…
 * land: a `CREATE EXTENSION` added in migration `0007` fails this file too.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  contentStates,
  countryStatuses,
  occasionKinds,
  occasionRuleTypes,
  roundingStyles,
  rowSources,
  sundayDeliveryModes,
  supplyModels,
} from "../../db/schema/geo.ts";
import { messageSources } from "../../db/schema/i18n.ts";

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

/** Every forward migration, newest last, as `[name, sql]`. */
function forwardMigrations(): readonly (readonly [string, string])[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".sql") &&
        !entry.name.endsWith(".down.sql"),
    )
    .map((entry) => entry.name)
    .sort()
    .map(
      (name) =>
        [name, readFileSync(join(MIGRATIONS_DIR, name), "utf8")] as const,
    );
}

/** SQL with `--` line comments and `/* *\/` block comments removed, so a rule never matches prose. */
function withoutComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

const migrations = forwardMigrations();
const geo = readFileSync(join(MIGRATIONS_DIR, "0002_i18n_geo.sql"), "utf8");
const geoDown = readFileSync(
  join(MIGRATIONS_DIR, "0002_i18n_geo.down.sql"),
  "utf8",
);
const geoStatements = withoutComments(geo);

/**
 * SQL with every single-quoted literal blanked, so that a column-type scan cannot trip over the
 * word `real` inside `CHECK (source IN ('seed', 'real'))`.
 */
function withoutLiterals(sql: string): string {
  return sql.replace(/'[^']*'/g, "''");
}

/**
 * The `CHECK (… IN ('a', 'b'))` value list of the named constraint, or undefined. Keyed on the
 * constraint name rather than the column, because two tables of this migration both have a
 * `source` column with two different value lists.
 */
function checkList(
  sql: string,
  constraint: string,
): readonly string[] | undefined {
  const match = new RegExp(
    `CONSTRAINT\\s+${constraint}\\s+CHECK\\s*\\(\\s*\\w+\\s+IN\\s*\\(([^)]*)\\)`,
    "i",
  ).exec(sql);
  if (match?.[1] === undefined) return undefined;
  return [...match[1].matchAll(/'([^']*)'/g)].map((value) => value[1] ?? "");
}

describe("migration 0002 — i18n + geo (AC-7, T-06)", () => {
  it("creates no Postgres extension in any migration", () => {
    for (const [name, sql] of migrations) {
      expect(withoutComments(sql), name).not.toMatch(/CREATE\s+EXTENSION/i);
    }
  });

  it("creates no enum type in any migration", () => {
    for (const [name, sql] of migrations) {
      expect(withoutComments(sql), name).not.toMatch(
        /CREATE\s+TYPE[\s\S]{0,200}?AS\s+ENUM/i,
      );
    }
  });

  it("declares no enum on the Drizzle side either", () => {
    const schemaDir = join(process.cwd(), "db", "schema");
    for (const file of readdirSync(schemaDir)) {
      const source = readFileSync(join(schemaDir, file), "utf8");
      expect(source, file).not.toMatch(/\bpgEnum\s*\(/);
    }
  });

  it("uses no float, double precision, numeric or money column type", () => {
    for (const [name, sql] of migrations) {
      const statements = withoutLiterals(withoutComments(sql));
      for (const banned of [
        /\bnumeric\b/i,
        /\bdecimal\b/i,
        /\bdouble\s+precision\b/i,
        /\breal\b/i,
        /\bfloat\d*\b/i,
        /\bmoney\b/i,
      ]) {
        expect(statements, `${name} / ${String(banned)}`).not.toMatch(banned);
      }
    }
  });

  it("stores the money-adjacent quantities as integers", () => {
    expect(geoStatements).toMatch(/vat_rate_bp\s+integer\s+NOT NULL/);
    expect(geoStatements).toMatch(/rate_ppm\s+bigint\s+NOT NULL/);
    expect(geoStatements).toMatch(/minor_unit_exponent\s+smallint\s+NOT NULL/);
  });

  it("gives every closed value set a CHECK list and no enum", () => {
    const expected: readonly (readonly [string, readonly string[]])[] = [
      ["country_status_check", countryStatuses],
      ["country_sunday_delivery_check", sundayDeliveryModes],
      ["country_supply_model_check", supplyModels],
      ["country_source_check", rowSources],
      ["country_locale_content_state_check", contentStates],
      ["country_locale_content_source_check", rowSources],
      ["currency_rounding_style_check", roundingStyles],
      ["occasion_kind_check", occasionKinds],
      // `occasion_country_rule_type_check` is asserted in the case below instead: `0002` declares
      // `plan/03` §9's six values and migration `0003` widens the constraint to seven (spec 002
      // §14 A5), so the mirror's tuple and this file's SQL no longer agree by construction.
      ["message_catalog_source_check", messageSources],
    ];
    for (const [constraint, values] of expected) {
      expect(checkList(geoStatements, constraint), constraint).toEqual([
        ...values,
      ]);
    }
  });

  it("uses plan/03 §9's rule_type values verbatim, and only those", () => {
    // `0002` as merged: the six rule types of `plan/03` §9, in that section's order. The seventh,
    // `orthodox_easter_offset`, arrives by `ALTER TABLE` in `0003` because `0002` is on `main`
    // (spec 002 §14 A5) — migration text is history and is never edited in place.
    expect(
      checkList(geoStatements, "occasion_country_rule_type_check"),
    ).toEqual([
      "fixed",
      "nth_weekday",
      "last_weekday",
      "easter_offset",
      "lent_sunday",
      "none",
    ]);
    // The Drizzle mirror describes the schema *after* every applied migration, so it carries the
    // widened list; `tests/unit/schema-catalog-pricing.test.ts` pins the widening to `0003`.
    expect(occasionRuleTypes).toEqual([
      "fixed",
      "nth_weekday",
      "last_weekday",
      "easter_offset",
      "orthodox_easter_offset",
      "lent_sunday",
      "none",
    ]);
  });

  it("carries the §7 RTL columns on locale from this migration on", () => {
    expect(geoStatements).toMatch(/rtl\s+boolean\s+NOT NULL DEFAULT false/);
    expect(geoStatements).toMatch(/fallback_code\s+text\s+NULL/);
    expect(geoStatements).toMatch(
      /locale_fallback_code_locale_code_fk FOREIGN KEY \(fallback_code\)/,
    );
  });

  it("declares the slug uniqueness of §6 (AC-8 is TASK-016's to verify)", () => {
    expect(geoStatements).toMatch(
      /country_translation_locale_slug_key UNIQUE \(locale_code, slug\)/,
    );
    expect(geoStatements).toMatch(
      /occasion_translation_locale_slug_key UNIQUE \(locale_code, slug\)/,
    );
    expect(geoStatements).toMatch(
      /city_translation_locale_country_slug_key UNIQUE \(locale_code, country_id, slug\)/,
    );
  });

  it("creates locale and currency before every table that references them", () => {
    const position = (table: string): number =>
      geoStatements.indexOf(`CREATE TABLE public.${table} (`);
    expect(position("locale")).toBeGreaterThan(-1);
    expect(position("currency")).toBeGreaterThan(-1);
    for (const dependant of [
      "message_catalog",
      "country_translation",
      "country_locale_content",
      "city_translation",
      "occasion_translation",
    ]) {
      expect(position(dependant), dependant).toBeGreaterThan(
        position("locale"),
      );
    }
    for (const dependant of ["country", "fx_rate"]) {
      expect(position(dependant), dependant).toBeGreaterThan(
        position("currency"),
      );
    }
  });

  it("opens with the ownership preamble and closes with RESET ROLE, both files", () => {
    for (const sql of [geo, geoDown]) {
      expect(
        withoutComments(sql).trim().startsWith("SET LOCAL ROLE app_owner;"),
      ).toBe(true);
      expect(withoutComments(sql)).toMatch(/RESET ROLE;\s*$/);
    }
  });

  it("gives every created table an updated_at trigger on 0001's shared function", () => {
    const created = [
      ...geoStatements.matchAll(/CREATE TABLE public\.(\w+) \(/g),
    ].map((match) => match[1]);
    expect(created).toHaveLength(15);
    for (const table of created) {
      expect(geoStatements, table).toMatch(
        new RegExp(
          `CREATE TRIGGER ${table}_set_updated_at BEFORE UPDATE ON public\\.${table}`,
        ),
      );
      expect(geoStatements, table).toMatch(
        new RegExp(`${table}\\s+\\(([\\s\\S]*?)\\n\\);`),
      );
    }
  });

  it("rolls back exactly what it created, and nothing else", () => {
    const created = [
      ...geoStatements.matchAll(/CREATE TABLE public\.(\w+) \(/g),
    ]
      .map((match) => match[1] ?? "")
      .sort();
    const dropped = [
      ...withoutComments(geoDown).matchAll(
        /DROP TABLE IF EXISTS public\.(\w+);/g,
      ),
    ]
      .map((match) => match[1] ?? "")
      .sort();
    expect(dropped).toEqual(created);
    // The shared trigger function belongs to 0001 and must survive this rollback.
    expect(withoutComments(geoDown)).not.toMatch(/set_updated_at\s*\(\)\s*;/);
    expect(withoutComments(geoDown)).not.toMatch(
      /DROP (ROLE|SCHEMA|TYPE|FUNCTION)/i,
    );
    expect(withoutComments(geoDown)).not.toMatch(/CASCADE/i);
  });

  it("drops leaf tables before the tables they reference", () => {
    const dropOrder = [
      ...withoutComments(geoDown).matchAll(
        /DROP TABLE IF EXISTS public\.(\w+);/g,
      ),
    ].map((match) => match[1] ?? "");
    const at = (table: string): number => dropOrder.indexOf(table);
    for (const [child, parent] of [
      ["country_translation", "country"],
      ["country_locale_content", "country"],
      ["city_translation", "city"],
      ["city", "region"],
      ["region", "country"],
      ["postcode_zone", "city"],
      ["country_holiday", "country"],
      ["occasion_translation", "occasion"],
      ["occasion_country", "occasion"],
      ["occasion_country", "country"],
      ["fx_rate", "currency"],
      ["country", "currency"],
      ["message_catalog", "locale"],
    ] as const) {
      expect(at(child), `${child} before ${parent}`).toBeLessThan(at(parent));
    }
  });
});
