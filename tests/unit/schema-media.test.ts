/**
 * Migration `0004` read as text: the offline half of T-06 (the `bytea` rule), T-10 and T-11
 * (spec 002 §9 AC-10, AC-11, AC-22; §14 A1 (c); TASK-017).
 *
 * The connected half — the database actually refusing a second primary image and an alt row with
 * no alt — is `tests/integration/schema-media.test.ts`. Everything below is decidable from the
 * repository alone and runs on every pull request.
 *
 * The column sets are compared against spec 006's projections (`MEDIA_ASSET_ROW_COLUMNS` and its
 * siblings in `seed/schema/media.ts`), which are that spec's independent transcription of §5.1
 * plus §14 A1 (c)'s seven columns, and the CHECK lists against the value tuples the seed parses
 * with. A column renamed or a value added on one side alone fails here rather than at the first
 * import.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALT_VISIBLE_PATTERN,
  mediaAssetVisibilities,
  mediaDepicts as mirrorDepicts,
  mediaFormats as mirrorFormats,
  mediaAssetKinds as mirrorKinds,
  mediaReviewStates as mirrorReviewStates,
  mediaSources as mirrorSources,
} from "../../db/schema/media.ts";
import {
  AltEntrySchema,
  MEDIA_ASSET_ROW_COLUMNS,
  MEDIA_VARIANT_ROW_COLUMNS,
  PRODUCT_MEDIA_ALT_ROW_COLUMNS,
  PRODUCT_MEDIA_PRIMARY_INDEX_COLUMNS,
  PRODUCT_MEDIA_ROW_COLUMNS,
  mediaAssetKinds,
  mediaDepicts,
  mediaFormats as seedFormats,
  mediaReviewStates,
  mediaSources,
  mediaVisibilities,
} from "../../seed/schema/media.ts";
import { mediaFormats, OBJECT_KEY_PATTERN } from "../../src/lib/storage.ts";

/**
 * Alt texts made only of characters a screen reader announces as nothing (hole 3, PR 184): each
 * blank character alone, a CRLF, and a mix. Built from code points so this file stays ASCII.
 */
const BLANK_CHARACTERS: readonly (readonly [string, number])[] = [
  ["tab", 0x09],
  ["line feed", 0x0a],
  ["vertical tab", 0x0b],
  ["form feed", 0x0c],
  ["carriage return", 0x0d],
  ["space", 0x20],
  ["NEL U+0085", 0x85],
  ["NBSP U+00A0", 0xa0],
  ["ogham space U+1680", 0x1680],
  ["Mongolian vowel separator U+180E", 0x180e],
  ...Array.from(
    { length: 0x200d - 0x2000 + 1 },
    (_, index): readonly [string, number] => [
      `U+${(0x2000 + index).toString(16).toUpperCase()}`,
      0x2000 + index,
    ],
  ),
  ["line separator U+2028", 0x2028],
  ["paragraph separator U+2029", 0x2029],
  ["narrow NBSP U+202F", 0x202f],
  ["medium math space U+205F", 0x205f],
  ["word joiner U+2060", 0x2060],
  ["ideographic space U+3000", 0x3000],
  ["BOM / ZWNBSP U+FEFF", 0xfeff],
];
const BLANK_ALTS: readonly (readonly [string, string])[] = [
  ...BLANK_CHARACTERS.map(([name, code]): readonly [string, string] => [
    name,
    String.fromCodePoint(code).repeat(8),
  ]),
  ["CRLF", "\r\n".repeat(4)],
  ["space, tab, space", " \t ".repeat(3)],
  [
    "NBSP, ZWSP, U+3000, BOM",
    String.fromCodePoint(0xa0, 0x200b, 0x3000, 0xfeff).repeat(2),
  ],
];
const REAL_ALTS = [
  "Twelve red roses in a kraft wrap",
  `Twelve${String.fromCodePoint(0xa0)}red roses`,
  "Dwana\u015bcie czerwonych r\u00f3\u017c",
  "\u8d64\u3044\u30d0\u30e9\u306e\u82b1\u675f\u3067\u3059",
  `${String.fromCodePoint(0x3000)}   roses   ${String.fromCodePoint(0xfeff)}`,
];

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");
const SCHEMA_DIR = join(process.cwd(), "db", "schema");
const FORWARD = "0004_media.sql";
const DOWN = "0004_media.down.sql";

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
const mirror = readFileSync(join(SCHEMA_DIR, "media.ts"), "utf8");

const CREATED_TABLES = [
  ...statements.matchAll(/CREATE TABLE public\.(\w+) \(/g),
].map((match) => match[1] ?? "");

function tableBody(table: string): string {
  const match = new RegExp(
    `CREATE TABLE public\\.${table} \\(([\\s\\S]*?)\\n\\);`,
  ).exec(statements);
  expect(match, `${table} is not created by ${FORWARD}`).not.toBeNull();
  return match?.[1] ?? "";
}

/** Column names in declaration order; constraints are declared after the last column. */
function columnsOf(table: string): readonly string[] {
  const columns: string[] = [];
  for (const raw of tableBody(table).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    if (line.startsWith("CONSTRAINT")) break;
    const name = /^([a-z_0-9]+)\s/.exec(line)?.[1];
    if (name !== undefined) columns.push(name);
  }
  return columns;
}

/** The `CHECK (col IN ('a', 'b'))` value list of a named constraint. */
function checkList(constraint: string): readonly string[] | undefined {
  const match = new RegExp(
    `CONSTRAINT\\s+${constraint}\\s+CHECK\\s*\\(\\s*\\w+\\s+IN\\s*\\(([^)]*)\\)`,
    "i",
  ).exec(statements);
  if (match?.[1] === undefined) return undefined;
  return [...match[1].matchAll(/'([^']*)'/g)].map((value) => value[1] ?? "");
}

const TIMESTAMPS = ["created_at", "updated_at"] as const;

describe("migration 0004 — media (AC-11, AC-22, §14 A1 (c))", () => {
  it("opens with the ownership preamble, as every migration after 0001 does", () => {
    expect(statements.trimStart().startsWith("SET LOCAL ROLE app_owner;")).toBe(
      true,
    );
    expect(statements.trimEnd().endsWith("RESET ROLE;")).toBe(true);
  });

  it("creates exactly the four media tables of §5.1's `catalog` group, in dependency order", () => {
    expect(CREATED_TABLES).toEqual([
      "media_asset",
      "media_variant",
      "product_media",
      "product_media_alt",
    ]);
  });

  it("declares every table in the Drizzle mirror and exports it from the barrel", () => {
    for (const table of CREATED_TABLES) {
      expect(mirror, table).toMatch(new RegExp(`pgTable\\(\\s*"${table}"`));
    }
    expect(readFileSync(join(SCHEMA_DIR, "index.ts"), "utf8")).toContain(
      'export * from "./media.ts";',
    );
  });

  describe("column sets — §5.1 plus §14 A1 (c), as spec 006's projections write them", () => {
    it("media_asset: id, the projected columns in order, timestamps", () => {
      expect(columnsOf("media_asset")).toEqual([
        "id",
        ...MEDIA_ASSET_ROW_COLUMNS,
        ...TIMESTAMPS,
      ]);
      // §14 A1 (c), by name, so the amendment cannot be dropped from both sides at once.
      for (const column of [
        "generator_model",
        "credit",
        "licence",
        "depicts",
        "reviewed_by",
        "reviewed_at",
      ]) {
        expect(columnsOf("media_asset"), column).toContain(column);
      }
    });

    it("media_variant: the projected columns (with checksum_sha256) and timestamps", () => {
      expect(columnsOf("media_variant")).toEqual([
        ...MEDIA_VARIANT_ROW_COLUMNS,
        ...TIMESTAMPS,
      ]);
      expect(columnsOf("media_variant")).toContain("checksum_sha256");
    });

    it("product_media: an id (the alt rows point at it), the projected columns, timestamps", () => {
      expect(columnsOf("product_media")).toEqual([
        "id",
        ...PRODUCT_MEDIA_ROW_COLUMNS,
        ...TIMESTAMPS,
      ]);
    });

    it("product_media_alt: the projected columns and timestamps", () => {
      expect(columnsOf("product_media_alt")).toEqual([
        ...PRODUCT_MEDIA_ALT_ROW_COLUMNS,
        ...TIMESTAMPS,
      ]);
    });
  });

  /* ----------------------------------------------------------------- AC-11 */

  describe("AC-11 — one primary image per product; alt text is NOT NULL", () => {
    it("declares the one-primary partial unique index on the projection's key", () => {
      const match =
        /CREATE UNIQUE INDEX product_media_primary_idx\s+ON public\.product_media USING btree \(([^)]*)\) WHERE is_primary;/.exec(
          statements,
        );
      expect(match).not.toBeNull();
      expect((match?.[1] ?? "").split(",").map((c) => c.trim())).toEqual([
        ...PRODUCT_MEDIA_PRIMARY_INDEX_COLUMNS,
      ]);
    });

    it("declares is_primary NOT NULL, so a null can never slip past the predicate", () => {
      expect(tableBody("product_media")).toMatch(
        /is_primary\s+boolean\s+NOT NULL DEFAULT false/,
      );
    });

    it("declares alt NOT NULL and refuses a blank alt", () => {
      const body = tableBody("product_media_alt");
      expect(body).toMatch(/\n\s+alt\s+text\s+NOT NULL,/);
      expect(body).toContain(
        `product_media_alt_alt_check CHECK (alt ~ '${ALT_VISIBLE_PATTERN}')`,
      );
    });

    describe("refuses an alt made only of whitespace, ASCII or Unicode (hole 3)", () => {
      // The migration's own pattern, read from the SQL and run as the same bracket in JS:
      // `[:space:]` is ASCII whitespace in the C locale; every other character is named.
      const sqlPattern =
        /product_media_alt_alt_check CHECK \(alt ~ '([^']*)'\)/.exec(
          tableBody("product_media_alt"),
        )?.[1] ?? "";
      const visible = new RegExp(
        sqlPattern.replace("[:space:]", "\\t\\n\\v\\f\\r "),
      );

      it("reads the pattern from the migration", () => {
        expect(sqlPattern).toBe(ALT_VISIBLE_PATTERN);
      });

      it.each(BLANK_ALTS)("the database pattern refuses %s", (_name, alt) => {
        expect(visible.test(alt)).toBe(false);
      });

      it.each(BLANK_ALTS)(
        "the seed's AltEntrySchema refuses %s",
        (_name, alt) => {
          expect(
            AltEntrySchema.safeParse({ assetId: "fo-bq-001-hero", alt })
              .success,
          ).toBe(false);
        },
      );

      it.each(REAL_ALTS)("both accept a real alt: %s", (alt) => {
        expect(visible.test(alt)).toBe(true);
        expect(
          AltEntrySchema.safeParse({ assetId: "fo-bq-001-hero", alt }).success,
        ).toBe(true);
      });
    });

    it("keys alt text per (image, locale)", () => {
      expect(tableBody("product_media_alt")).toContain(
        "CONSTRAINT product_media_alt_pkey PRIMARY KEY (product_media_id, locale_code)",
      );
      expect(tableBody("product_media")).toContain(
        "CONSTRAINT product_media_product_asset_key UNIQUE (product_id, media_asset_id)",
      );
    });
  });

  /* ----------------------------------------------------------------- AC-22 */

  describe("AC-22 — keys, never bytes (ADR-0015)", () => {
    const banned = /\bbytea\b|\blargeobject\b|\blo_import\b|\boid\b/i;

    it("declares no binary column in any committed forward migration", () => {
      const forwards = readdirSync(MIGRATIONS_DIR).filter(
        (file) => /^\d{4}_\w+\.sql$/.test(file) && !file.endsWith(".down.sql"),
      );
      expect(forwards).toContain(FORWARD);
      for (const file of forwards) {
        const sql = withoutComments(
          readFileSync(join(MIGRATIONS_DIR, file), "utf8"),
        ).replace(/'[^']*'/g, "''");
        expect(sql, file).not.toMatch(banned);
      }
    });

    it("declares no binary column in the Drizzle mirror", () => {
      for (const file of readdirSync(SCHEMA_DIR)) {
        const source = readFileSync(join(SCHEMA_DIR, file), "utf8");
        expect(source, file).not.toMatch(/\bbytea\b|customType/);
      }
    });

    it("stores the object's address and facts: bucket, a unique key, size and SHA-256", () => {
      for (const table of ["media_asset", "media_variant"]) {
        const body = tableBody(table);
        expect(body, table).toMatch(/object_key\s+text\s+NOT NULL/);
        expect(body, table).toContain(
          `${table}_object_key_key UNIQUE (object_key)`,
        );
        expect(body, table).toContain(
          `${table}_object_key_check CHECK (object_key ~ '${OBJECT_KEY_PATTERN}')`,
        );
        expect(body, table).toMatch(/bytes\s+bigint\s+NOT NULL/);
        expect(body, table).toMatch(/checksum_sha256\s+text\s+NOT NULL/);
        expect(body, table).toContain(
          `${table}_checksum_sha256_check CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')`,
        );
      }
      expect(tableBody("media_asset")).toMatch(/bucket\s+text\s+NOT NULL/);
    });
  });

  /* ------------------------------------------------------- value lists, AC-7 */

  it("writes every closed value set as a CHECK list equal to the seed's and the mirror's tuples", () => {
    for (const [constraint, seed, mirrored] of [
      ["media_asset_kind_check", mediaAssetKinds, mirrorKinds],
      [
        "media_asset_visibility_check",
        mediaVisibilities,
        mediaAssetVisibilities,
      ],
      ["media_asset_source_check", mediaSources, mirrorSources],
      ["media_asset_review_state_check", mediaReviewStates, mirrorReviewStates],
      ["media_asset_depicts_check", mediaDepicts, mirrorDepicts],
      ["media_variant_format_check", seedFormats, mirrorFormats],
    ] as const) {
      expect(checkList(constraint), constraint).toEqual([...seed]);
      expect([...mirrored], constraint).toEqual([...seed]);
    }
    // The seam's format list is the same list, so objectKey() cannot mint a format the table refuses.
    expect([...mediaFormats]).toEqual([...seedFormats]);
    expect(statements).not.toMatch(/CREATE\s+TYPE[\s\S]{0,200}?AS\s+ENUM/i);
    expect(statements).not.toMatch(/CREATE\s+EXTENSION/i);
  });

  it("refuses an approved asset with no reviewer or no review date (spec 006 §2.4)", () => {
    expect(tableBody("media_asset")).toContain(
      "media_asset_reviewed_check CHECK (\n    review_state <> 'approved' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)\n  )",
    );
  });

  /* ------------------------------------------------------------ references */

  it("cascades only from a parent to its own variant, image and alt rows (§5.1)", () => {
    const fks = [
      ...statements.matchAll(
        /CONSTRAINT (\w+_fk) FOREIGN KEY \((\w+)\)\s+REFERENCES public\.(\w+) \((\w+)\) ON DELETE (CASCADE|RESTRICT)/g,
      ),
    ].map(
      (m) =>
        `${m[1] ?? ""}: ${m[2] ?? ""} -> ${m[3] ?? ""}.${m[4] ?? ""} ${m[5] ?? ""}`,
    );
    expect(fks.sort()).toEqual([
      "media_variant_media_asset_id_media_asset_id_fk: media_asset_id -> media_asset.id CASCADE",
      "product_media_alt_locale_code_locale_code_fk: locale_code -> locale.code RESTRICT",
      "product_media_alt_product_media_id_product_media_id_fk: product_media_id -> product_media.id CASCADE",
      "product_media_media_asset_id_media_asset_id_fk: media_asset_id -> media_asset.id RESTRICT",
      "product_media_product_id_product_id_fk: product_id -> product.id CASCADE",
    ]);
  });

  /* ----------------------------------------------------------------- AC-10 */

  it("AC-10 — gives every table an updated_at trigger on 0001's shared function", () => {
    expect(CREATED_TABLES).toHaveLength(4);
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

  /* -------------------------------------------------------------- rollback */

  describe("the rollback", () => {
    it("drops the four tables leaf first, without CASCADE, as app_owner", () => {
      expect(
        downStatements.trimStart().startsWith("SET LOCAL ROLE app_owner;"),
      ).toBe(true);
      const drops = [
        ...downStatements.matchAll(/DROP TABLE IF EXISTS public\.(\w+);/g),
      ].map((match) => match[1] ?? "");
      expect(drops).toEqual([...CREATED_TABLES].reverse());
      expect(downStatements).not.toMatch(/\bCASCADE\b/i);
    });

    it("drops nothing it did not create", () => {
      const dropped = [
        ...downStatements.matchAll(
          /DROP\s+(\w+)\s+(?:IF EXISTS\s+)?([\w.]+)/gi,
        ),
      ].map((match) => `${(match[1] ?? "").toUpperCase()} ${match[2] ?? ""}`);
      expect(dropped).toEqual(
        [...CREATED_TABLES].reverse().map((table) => `TABLE public.${table}`),
      );
    });
  });
});
