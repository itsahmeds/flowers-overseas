/**
 * T-04 / AC-3 (spec 007 §9, §10; TASK-087): `toCountryLocaleContentRow()` and `toCountryRow()`
 * return exactly spec 002 §5.1's column lists, and neither side can be edited alone.
 *
 * The pin is not a transcription sitting beside the code it pins. The `country_locale_content(…)`
 * and `country(…)` column lists are **read out of `specs/002-schema-v1.md`** at test time, so a
 * column added to the table without a projection, or a projection field invented without a column,
 * fails here — which is the whole point of AC-3 and the reason spec 012's admin can inherit this
 * content instead of re-keying it.
 *
 * The two columns spec 007 §5.1 requests as an amendment (`seo_title`, `seo_description`, §13 Q10,
 * accepted 2026-09-15) are asserted **through the amendment record in spec 002 §14**, not as an
 * exception: if the amendment is ever rolled back, this test fails rather than silently projecting
 * columns that do not exist.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COUNTRIES,
  COUNTRY_ROW_COLUMNS,
  toCountryRow,
} from "../../src/config/countries.ts";
import { readCorridorCorpus } from "../../src/modules/geo/content/corpus.ts";
import { parseCorridorContentOrThrow } from "../../src/modules/geo/content/parse.ts";
import {
  COUNTRY_LOCALE_CONTENT_NATURAL_KEY_COLUMNS,
  COUNTRY_LOCALE_CONTENT_ROW_COLUMNS,
  toCountryLocaleContentRow,
} from "../../src/modules/geo/content/projections.ts";

const spec002 = readFileSync(
  resolve(__dirname, "../../specs/002-schema-v1.md"),
  "utf8",
);

/** The column names inside a `table(...)` declaration of spec 002 §5.1. */
function specColumns(table: string): string[] {
  const match = new RegExp(`\`${table}\\(([^\`]*)\\)\``, "u").exec(spec002);
  if (match?.[1] === undefined) {
    throw new Error(`no \`${table}(...)\` in spec 002 §5.1`);
  }
  // Stop at the table constraints: a trailing `UNIQUE (country_id, locale_code, state)` repeats
  // column names that are already declared and would double them in the list. A column-level
  // `iso2 UNIQUE` is not a constraint clause and must survive, hence the `(` in the pattern.
  const declaration = match[1].split(/\bUNIQUE\s*\(/u)[0] ?? "";
  return [
    ...new Set(
      declaration
        .split(",")
        .map((part) => part.trim().split(/[\s(]/u)[0] ?? "")
        .filter((name) => /^[a-z_][a-z0-9_]*$/u.test(name)),
    ),
  ];
}

const contentColumns = specColumns("country_locale_content");

/** The two columns of the spec 007 §5.1 amendment (spec 002 §14, recorded by this task). */
const AMENDED_COLUMNS = ["seo_title", "seo_description"] as const;

describe("toCountryLocaleContentRow() against spec 002 §5.1 (AC-3)", () => {
  it("projects every column spec 002 declares, plus the two amended ones, and nothing else", () => {
    expect([...COUNTRY_LOCALE_CONTENT_ROW_COLUMNS].sort()).toStrictEqual(
      [
        ...contentColumns.filter((column) => column !== "id"),
        ...AMENDED_COLUMNS,
      ].sort(),
    );
  });

  it("reads the amendment from spec 002 §14 rather than assuming it", () => {
    const amendments = spec002.slice(spec002.indexOf("## 14. Amendments"));
    for (const column of AMENDED_COLUMNS) {
      expect(amendments, column).toContain(column);
    }
  });

  it("keeps spec 002's natural key `(country_id, locale_code, state)`", () => {
    expect([...COUNTRY_LOCALE_CONTENT_NATURAL_KEY_COLUMNS]).toStrictEqual([
      "country_id",
      "locale_code",
      "state",
    ]);
    for (const column of COUNTRY_LOCALE_CONTENT_NATURAL_KEY_COLUMNS) {
      expect([...COUNTRY_LOCALE_CONTENT_ROW_COLUMNS], column).toContain(column);
    }
  });

  it("emits exactly the pinned keys for every committed file", () => {
    const corpus = readCorridorCorpus();
    expect(corpus.length).toBeGreaterThan(0);
    for (const file of corpus) {
      const content = parseCorridorContentOrThrow(file.path, file.source);
      const row = toCountryLocaleContentRow(content, {
        countryId: "00000000-0000-0000-0000-000000000001",
      });
      expect(Object.keys(row), file.path).toStrictEqual([
        ...COUNTRY_LOCALE_CONTENT_ROW_COLUMNS,
      ]);
      expect(row.locale_code).toBe(content.locale);
      expect(row.state).toBe(content.state);
      expect(row.seo_title).toBe(content.seoTitle);
      expect(row.intro_md).toBe(content.intro);
      expect(row.faq).toStrictEqual(content.faq);
      // The review triple projects as authored; an absence is NULL, never an empty string
      // (the founder reviewed the whole `en`/`en-gb` set on 2026-09-16).
      expect(row.reviewed).toBe(content.reviewed);
      expect(row.reviewed_by).toBe(content.reviewedBy ?? null);
      expect(row.reviewed_at).toBe(content.reviewedAt ?? null);
    }
  });

  it("does not project a surrogate key or a trigger timestamp", () => {
    for (const column of ["id", "created_at", "updated_at"]) {
      expect([...COUNTRY_LOCALE_CONTENT_ROW_COLUMNS], column).not.toContain(
        column,
      );
    }
  });
});

describe("toCountryRow() is unchanged by this task (AC-3)", () => {
  it("still projects exactly the three Phase 0 columns", () => {
    expect([...COUNTRY_ROW_COLUMNS]).toStrictEqual([
      "iso2",
      "status",
      "guide_published",
    ]);
    for (const column of COUNTRY_ROW_COLUMNS) {
      expect(specColumns("country"), column).toContain(column);
    }
  });

  it("does not project the `operations` block, which no destination has authored", () => {
    for (const country of COUNTRIES) {
      expect(country.operations, country.iso2).toBeUndefined();
      expect(Object.keys(toCountryRow(country))).toStrictEqual([
        ...COUNTRY_ROW_COLUMNS,
      ]);
    }
    for (const column of [
      "iana_zone",
      "same_day_cutoff_local",
      "delivery_days",
      "sunday_delivery",
    ]) {
      expect(specColumns("country"), column).toContain(column);
      expect([...COUNTRY_ROW_COLUMNS], column).not.toContain(column);
    }
  });
});
