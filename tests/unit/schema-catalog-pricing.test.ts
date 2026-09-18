/**
 * Migration `0003` read as text: the offline half of T-06, T-08, T-09 and T-10 (spec 002 §9 AC-5,
 * AC-8, AC-9, AC-10, §14 A1/A2/A4/A5; TASK-016).
 *
 * The connected assertions — `information_schema`, `pg_constraint`, and the behaviour that
 * actually rejects a second active price — live in `tests/integration/schema-catalog-pricing.test
 * .ts` and need a database. Everything below is decidable from the repository alone and therefore
 * runs on every pull request, in every worktree, with no credentials.
 *
 * Two of these assertions are worth more than they look:
 *
 *  - the **column sets** are compared against `SPEC_002_ROW_COLUMNS` in `scripts/catalogue-check
 *    .ts`, which is spec 005's independent transcription of §5.1 and the shape its projections
 *    write. A column renamed on either side fails here rather than at the first import run.
 *  - the **review triple** (§14 A4) is asserted in both directions: present on the three
 *    prose-bearing translation tables of this migration, and present on *no* other table it
 *    creates. A4 exists because the triple had started spreading to name-only tables.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  addonKinds,
  categoryKinds,
  priceTiers,
  productStatuses,
  productTypes,
  surchargeKinds,
  translationStatuses,
} from "../../db/schema/catalog.ts";
import { occasionRuleTypes, rowSources } from "../../db/schema/geo.ts";

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");
const FORWARD = "0003_catalog_pricing.sql";
const DOWN = "0003_catalog_pricing.down.sql";

/** SQL with `--` line comments and block comments removed, so a rule never matches prose. */
function withoutComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

const forward = readFileSync(join(MIGRATIONS_DIR, FORWARD), "utf8");
const down = readFileSync(join(MIGRATIONS_DIR, DOWN), "utf8");
const statements = withoutComments(forward);
const downStatements = withoutComments(down);
const mirror = readFileSync(
  join(process.cwd(), "db", "schema", "catalog.ts"),
  "utf8",
);

/** The eleven tables this migration creates, in creation order. */
const CREATED_TABLES = [
  ...statements.matchAll(/CREATE TABLE public\.(\w+) \(/g),
].map((match) => match[1] ?? "");

/** The body of one `CREATE TABLE public.<name> ( … );` block. */
function tableBody(table: string): string {
  const match = new RegExp(
    `CREATE TABLE public\\.${table} \\(([\\s\\S]*?)\\n\\);`,
  ).exec(statements);
  expect(match, `${table} is not created by ${FORWARD}`).not.toBeNull();
  return match?.[1] ?? "";
}

/**
 * The column names of a table, in declaration order. Every constraint clause of this migration is
 * declared after the last column, so the scan stops at the first `CONSTRAINT` line: a multi-line
 * `CHECK` body would otherwise contribute its first identifier as a phantom column.
 */
function columnsOf(table: string): readonly string[] {
  const columns: string[] = [];
  for (const raw of tableBody(table).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    if (line.startsWith("CONSTRAINT")) break;
    const name = /^([a-z_]+)\s/.exec(line)?.[1];
    if (name !== undefined) columns.push(name);
  }
  return columns;
}

/** The `CHECK (… IN ('a', 'b'))` value list of a named constraint, or undefined. */
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

/** The generated and audit columns every table of this migration carries. */
const TIMESTAMPS = ["created_at", "updated_at"] as const;

/**
 * §5.1's column lists, as `scripts/catalogue-check.ts` transcribes them for spec 005's
 * projections, plus the columns a projection never writes: the generated `id` and the timestamps.
 * Imported rather than restated — the whole point is that the two sides cannot drift apart.
 */
async function specColumns(): Promise<
  Readonly<Record<string, readonly string[]>>
> {
  const { SPEC_002_ROW_COLUMNS } =
    await import("../../scripts/catalogue-check.ts");
  return SPEC_002_ROW_COLUMNS;
}

describe("migration 0003 — catalog + pricing (AC-5, AC-8, AC-9, AC-10)", () => {
  it("creates exactly the eleven tables of §5.1's `catalog` group, minus media", () => {
    expect([...CREATED_TABLES].sort()).toEqual([
      "addon",
      "addon_country_price",
      "addon_translation",
      "category",
      "category_translation",
      "country_price",
      "product",
      "product_category",
      "product_occasion",
      "product_tier",
      "product_translation",
    ]);
    // Media is migration `0004` (TASK-017): nothing here may reference an asset.
    expect(statements).not.toMatch(/media_asset|media_variant|product_media/);
  });

  it("declares every table of the migration in the Drizzle mirror (drift, offline half)", () => {
    for (const table of CREATED_TABLES) {
      expect(mirror, table).toMatch(new RegExp(`pgTable\\(\\s*"${table}"`));
    }
  });

  it("matches spec 005's transcription of §5.1 column by column", async () => {
    const spec = await specColumns();
    // `id` is generated, and the projections never write the timestamps.
    const generatedId = new Set([
      "category",
      "product",
      "addon",
      "country_price",
    ]);
    for (const table of [
      "product",
      "product_translation",
      "product_tier",
      "category",
      "addon",
      "addon_country_price",
      "country_price",
    ]) {
      const expected = [
        ...(generatedId.has(table) ? ["id"] : []),
        ...(spec[table] ?? []),
        ...TIMESTAMPS,
      ];
      expect(columnsOf(table), table).toEqual(expected);
    }
  });

  /* ------------------------------------------------------------------ AC-5 */

  describe("AC-5 — money is a `*_minor bigint` paired with a currency column", () => {
    it("declares every monetary column as bigint with a currency beside it", () => {
      const minorColumns = [
        ...statements.matchAll(/^\s{2}(\w*_minor)\s+(\w+)/gm),
      ].map((match) => [match[1] ?? "", match[2] ?? ""] as const);
      expect(minorColumns.length).toBeGreaterThan(0);
      for (const [column, type] of minorColumns) {
        expect(type, column).toBe("bigint");
      }
      for (const table of ["addon_country_price", "country_price"]) {
        const body = tableBody(table);
        expect(body, table).toMatch(/retail_minor\s+bigint\s+NOT NULL/);
        expect(body, table).toMatch(/currency_code\s+text\s+NOT NULL/);
        expect(body, table).toContain(
          `FOREIGN KEY (currency_code)\n    REFERENCES public.currency (code)`,
        );
        expect(body, table).toMatch(
          new RegExp(
            `${table}_currency_code_check CHECK \\(currency_code ~ '\\^\\[A-Z\\]\\{3\\}\\$'\\)`,
          ),
        );
        // VAT stays an integer in basis points, exactly as on `country` (`plan/12` §2).
        expect(body, table).toMatch(/vat_rate_bp\s+integer\s+NOT NULL/);
      }
    });

    it("uses no float, numeric or money type and no `bytea`", () => {
      const literals = statements.replace(/'[^']*'/g, "''");
      for (const banned of [
        /\bnumeric\b/i,
        /\bdecimal\b/i,
        /\bdouble\s+precision\b/i,
        /\breal\b/i,
        /\bfloat\d*\b/i,
        /\bmoney\b/i,
        /\bbytea\b/i,
      ]) {
        expect(literals, String(banned)).not.toMatch(banned);
      }
    });
  });

  /* ------------------------------------------------------------------ AC-8 */

  describe("AC-8 — one slug per locale on every translation table that names a page", () => {
    it("declares UNIQUE (locale_code, slug) on product and category translations", () => {
      for (const table of ["product_translation", "category_translation"]) {
        expect(tableBody(table), table).toMatch(
          new RegExp(`${table}_locale_slug_key UNIQUE \\(locale_code, slug\\)`),
        );
        expect(tableBody(table), table).toMatch(
          new RegExp(`${table}_slug_check CHECK \\(slug ~ `),
        );
      }
    });

    it("gives an add-on no slug, because an add-on has no page", () => {
      expect(tableBody("addon_translation")).not.toMatch(/\bslug\b/);
    });
  });

  /* ------------------------------------------------------------------ AC-9 */

  describe("AC-9 — at most one active price per (product, country, tier, surcharge)", () => {
    it("declares the partial unique index with NULLS NOT DISTINCT", () => {
      expect(statements).toMatch(
        /CREATE UNIQUE INDEX country_price_active_idx\s+ON public\.country_price USING btree \(product_id, country_id, tier_key, surcharge_kind\)\s+NULLS NOT DISTINCT\s+WHERE active_to IS NULL;/,
      );
    });

    it("bounds every dated price row with active_to > active_from", () => {
      for (const table of ["country_price", "addon_country_price"]) {
        expect(tableBody(table), table).toMatch(
          new RegExp(
            `${table}_active_range_check CHECK \\(\\s*active_to IS NULL OR active_to > active_from\\s*\\)`,
          ),
        );
        expect(tableBody(table), table).toMatch(
          /active_from\s+date\s+NOT NULL/,
        );
        expect(tableBody(table), table).toMatch(/active_to\s+date\s+NULL/);
      }
    });

    it("keys the two partial unique indexes on §14 A1's columns", async () => {
      const { SPEC_002_UNIQUE_INDEX_COLUMNS } =
        await import("../../scripts/catalogue-check.ts");
      const indexed = (name: string): readonly string[] => {
        const match = new RegExp(
          `CREATE UNIQUE INDEX ${name}\\s+ON public\\.\\w+ USING btree \\(([^)]*)\\)`,
        ).exec(statements);
        return (match?.[1] ?? "").split(",").map((column) => column.trim());
      };
      expect(indexed("country_price_active_idx")).toEqual([
        ...(SPEC_002_UNIQUE_INDEX_COLUMNS.country_price ?? []),
      ]);
      expect(indexed("addon_country_price_active_idx")).toEqual([
        ...(SPEC_002_UNIQUE_INDEX_COLUMNS.addon_country_price ?? []),
      ]);
      // §14 A1 (b): one default tier per product, the key is the product and `is_default` is the
      // predicate rather than a key column.
      expect(indexed("product_tier_default_idx")).toEqual([
        ...(SPEC_002_UNIQUE_INDEX_COLUMNS.product_tier ?? []),
      ]);
      expect(statements).toMatch(
        /CREATE UNIQUE INDEX product_tier_default_idx\s+ON public\.product_tier USING btree \(product_id\) WHERE is_default;/,
      );
    });

    it("prices on the destination country only — no buyer-country column (§8)", () => {
      expect(tableBody("country_price")).not.toMatch(/buyer|billing_country/i);
    });
  });

  /* ----------------------------------------------------------------- AC-10 */

  it("AC-10 — gives every created table an updated_at trigger on 0001's shared function", () => {
    expect(CREATED_TABLES).toHaveLength(11);
    for (const table of CREATED_TABLES) {
      expect(tableBody(table), table).toMatch(
        /updated_at\s+timestamptz NOT NULL DEFAULT now\(\)/,
      );
      expect(statements, table).toMatch(
        new RegExp(
          `CREATE TRIGGER ${table}_set_updated_at BEFORE UPDATE ON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.set_updated_at\\(\\);`,
        ),
      );
    }
  });

  /* -------------------------------------------------------------- §7, §14 */

  describe("§7 and §14 A4 — message keys and the review triple", () => {
    it("constrains product_tier.label_key to spec 005 §7's message-key alphabet", () => {
      expect(tableBody("product_tier")).toContain(
        String.raw`product_tier_label_key_check CHECK (label_key ~ '^catalog(\.[a-z][A-Za-z0-9]*)+$')`,
      );
    });

    it("leaves description_md nullable so a thin PDP is non-indexable by data (§6)", () => {
      expect(tableBody("product_translation")).toMatch(
        /description_md\s+text\s+NULL/,
      );
    });

    it("puts the review triple on the three prose translation tables and nowhere else", () => {
      const triple = [
        "translation_status",
        "reviewed",
        "reviewed_by",
        "reviewed_at",
        "source_hash",
      ];
      for (const table of [
        "product_translation",
        "category_translation",
        "addon_translation",
      ]) {
        for (const column of triple) {
          expect(columnsOf(table), `${table}.${column}`).toContain(column);
        }
        expect(tableBody(table), table).toMatch(
          new RegExp(
            `${table}_status_check CHECK \\(translation_status IN \\('machine', 'human'\\)\\)`,
          ),
        );
      }
      const bearers = CREATED_TABLES.filter((table) =>
        columnsOf(table).includes("source_hash"),
      );
      expect(bearers.sort()).toEqual([
        "addon_translation",
        "category_translation",
        "product_translation",
      ]);
      // And `0002`'s name-only translation tables are untouched by this migration (§14 A4).
      expect(statements).not.toMatch(
        /ALTER TABLE public\.(country|city)_translation/,
      );
    });
  });

  /* ------------------------------------------------------------- §14 A2/A5 */

  it("§14 A2 — category(key, kind) with the kinds toCategoryRow() projects", () => {
    expect(checkList(statements, "category_kind_check")).toEqual([
      ...categoryKinds,
    ]);
    expect(categoryKinds).toEqual(["productType", "occasion", "flowerType"]);
    // A2 (b): a tier's stem count is nullable, because an S/M/L arrangement has none.
    expect(tableBody("product_tier")).toMatch(/stems\s+integer\s+NULL/);
  });

  it("§14 A5 — widens occasion_country_rule_type_check to seven values", () => {
    expect(statements).toMatch(
      /ALTER TABLE public\.occasion_country DROP CONSTRAINT occasion_country_rule_type_check;/,
    );
    const widened =
      /ADD CONSTRAINT occasion_country_rule_type_check CHECK \(\s*rule_type IN \(([\s\S]*?)\)\s*\);/.exec(
        statements,
      );
    const values = [...(widened?.[1] ?? "").matchAll(/'([^']*)'/g)].map(
      (match) => match[1] ?? "",
    );
    expect(values).toEqual([...occasionRuleTypes]);
    expect(values).toContain("orthodox_easter_offset");
    expect(values).toHaveLength(7);
  });

  it("keeps every other closed value set a CHECK list, and no enum", () => {
    for (const [constraint, values] of [
      ["product_product_type_check", productTypes],
      ["product_price_tier_check", priceTiers],
      ["product_status_check", productStatuses],
      ["product_source_check", rowSources],
      ["country_price_source_check", rowSources],
      ["country_price_surcharge_kind_check", surchargeKinds],
      ["addon_kind_check", addonKinds],
      ["category_kind_check", categoryKinds],
      ["product_translation_status_check", translationStatuses],
    ] as const) {
      expect(checkList(statements, constraint), constraint).toEqual([
        ...values,
      ]);
    }
    expect(statements).not.toMatch(/CREATE\s+TYPE[\s\S]{0,200}?AS\s+ENUM/i);
    expect(statements).not.toMatch(/CREATE\s+EXTENSION/i);
  });

  /* ------------------------------------------------------------- rollback */

  describe("the rollback (AC-4)", () => {
    it("opens with the ownership preamble and closes with RESET ROLE, both files", () => {
      for (const sql of [forward, down]) {
        expect(
          withoutComments(sql).trim().startsWith("SET LOCAL ROLE app_owner;"),
        ).toBe(true);
        expect(withoutComments(sql)).toMatch(/RESET ROLE;\s*$/);
      }
    });

    it("drops exactly what the migration created, and nothing else", () => {
      const dropped = [
        ...downStatements.matchAll(/DROP TABLE IF EXISTS public\.(\w+);/g),
      ]
        .map((match) => match[1] ?? "")
        .sort();
      expect(dropped).toEqual([...CREATED_TABLES].sort());
      expect(downStatements).not.toMatch(/DROP (ROLE|SCHEMA|TYPE|FUNCTION)/i);
      expect(downStatements).not.toMatch(/CASCADE/i);
    });

    it("drops leaf tables before the tables they reference", () => {
      const order = [
        ...downStatements.matchAll(/DROP TABLE IF EXISTS public\.(\w+);/g),
      ].map((match) => match[1] ?? "");
      const at = (table: string): number => order.indexOf(table);
      for (const [child, parent] of [
        ["country_price", "product"],
        ["country_price", "product_tier"],
        ["product_tier", "product"],
        ["product_translation", "product"],
        ["product_category", "product"],
        ["product_category", "category"],
        ["product_occasion", "product"],
        ["addon_country_price", "addon"],
        ["addon_translation", "addon"],
        ["category_translation", "category"],
      ] as const) {
        expect(at(child), `${child} before ${parent}`).toBeLessThan(at(parent));
      }
    });

    it("restores the six-value rule_type check after removing seventh-type rows (§14 A5)", () => {
      expect(downStatements).toMatch(
        /DELETE FROM public\.occasion_country WHERE rule_type = 'orthodox_easter_offset';/,
      );
      const restored =
        /ADD CONSTRAINT occasion_country_rule_type_check CHECK \(\s*rule_type IN \(([\s\S]*?)\)\s*\);/.exec(
          downStatements,
        );
      const values = [...(restored?.[1] ?? "").matchAll(/'([^']*)'/g)].map(
        (match) => match[1] ?? "",
      );
      expect(values).toEqual([
        "fixed",
        "nth_weekday",
        "last_weekday",
        "easter_offset",
        "lent_sunday",
        "none",
      ]);
      // The delete comes before the constraint is narrowed, or the ADD would fail on its own rows.
      expect(
        downStatements.indexOf("DELETE FROM public.occasion_country"),
      ).toBeLessThan(
        downStatements.indexOf(
          "ADD CONSTRAINT occasion_country_rule_type_check",
        ),
      );
    });
  });

  it("pairs the migration with a rollback and claims one version", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((name) =>
      name.startsWith("0003_"),
    );
    expect(files.sort()).toEqual([DOWN, FORWARD]);
  });
});
