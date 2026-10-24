/**
 * T-23 as spec 004 §14 A-founder-2026-10-19d amends it (AC-21; TASK-279): the one reader that
 * decides whether anything needs consent, `consentSources(env)`, and the source rule that keeps it
 * the only one.
 *
 *  - **The reader table.** The committed register with the id blank asks nothing; `G-FIXTURE00`
 *    activates analytics and carries the id; a `GTM-…` container id or whitespace is no id; a
 *    register whose `_ga` row is `set` activates analytics with no id; one `set` marketing row
 *    activates marketing. Each row asserts the one value (`toEqual` the whole result), so a reader
 *    that ignored the register, or returned a constant, fails a named row.
 *  - **One caller of `ga4MeasurementId(`.** No file under `src/` other than `src/lib/env.schema.ts`
 *    (which defines it) and the reader calls it outside a comment. Comments are skipped by the
 *    TypeScript scanner, not by a regex, so a mention in a doc comment (`src/app/robots.ts`,
 *    `src/modules/seo/environment.ts`) is not a call and a call on a commented-looking line is.
 *
 * The layout half (the tag's `src` and the banner's `prompt` from one result) is the integration
 * render in `tests/unit/app-shell.test.tsx`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  COOKIE_REGISTRY,
  type CookieRegistryEntry,
} from "../../src/config/cookies";
import { GA4_MEASUREMENT_ID_KEY } from "../../src/lib/env.schema";
import { consentPrompt, consentSources } from "../../src/modules/analytics";

const repoRoot = resolve(__dirname, "../..");

/** The committed register with one row changed, as the fixtures of AC-21's table need. */
function withRow(
  name: string,
  change: Partial<CookieRegistryEntry>,
): CookieRegistryEntry[] {
  const found = COOKIE_REGISTRY.some((row) => row.name === name);
  expect(found, `register row ${name}`).toBe(true);
  return COOKIE_REGISTRY.map((row) =>
    row.name === name ? { ...row, ...change } : row,
  );
}

/** A register with one extra marketing row that is `set` (no such row exists today). */
function withMarketingRow(): CookieRegistryEntry[] {
  const ga = COOKIE_REGISTRY.find((row) => row.name === "_ga");
  expect(ga).toBeDefined();
  return [
    ...COOKIE_REGISTRY,
    {
      ...ga!,
      name: "_fixture_ads",
      category: "marketing",
      status: "set",
      purposeKey: "consent.cookies.fixtureAds.purpose",
    },
  ];
}

describe("consentSources(): AC-21's table", () => {
  it("the committed register with the id blank: nothing active, no id", () => {
    expect(consentSources({})).toEqual({
      ga4MeasurementId: undefined,
      active: [],
    });
    expect(consentSources({ [GA4_MEASUREMENT_ID_KEY]: "" })).toEqual({
      ga4MeasurementId: undefined,
      active: [],
    });
  });

  it("`G-FIXTURE00`: analytics active, and the id is the tag's", () => {
    expect(consentSources({ [GA4_MEASUREMENT_ID_KEY]: "G-FIXTURE00" })).toEqual(
      { ga4MeasurementId: "G-FIXTURE00", active: ["analytics"] },
    );
  });

  it("a `GTM-…` container id, or whitespace, is no id and activates nothing", () => {
    for (const value of ["GTM-ABC123", "   ", "\t"]) {
      expect(
        consentSources({ [GA4_MEASUREMENT_ID_KEY]: value }),
        value,
      ).toEqual({ ga4MeasurementId: undefined, active: [] });
    }
  });

  it("a register whose `_ga` row is `set`, with the id blank: analytics active, no id", () => {
    expect(consentSources({}, withRow("_ga", { status: "set" }))).toEqual({
      ga4MeasurementId: undefined,
      active: ["analytics"],
    });
  });

  it("a register with one marketing row `set`: marketing active", () => {
    expect(consentSources({}, withMarketingRow())).toEqual({
      ga4MeasurementId: undefined,
      active: ["marketing"],
    });
  });

  it("both sources: register order, analytics before marketing", () => {
    expect(
      consentSources(
        { [GA4_MEASUREMENT_ID_KEY]: "G-FIXTURE00" },
        withMarketingRow(),
      ),
    ).toEqual({
      ga4MeasurementId: "G-FIXTURE00",
      active: ["analytics", "marketing"],
    });
  });

  it("a `declared` row is not a source: today's register activates nothing on its own", () => {
    // Both GA4 rows are `declared` and no row is `marketing` (spec 004 §14 19d "Trigger").
    expect(
      COOKIE_REGISTRY.filter(
        (row) => row.category !== "essential" && row.status === "set",
      ),
    ).toEqual([]);
    expect(consentSources({}, COOKIE_REGISTRY).active).toEqual([]);
  });
});

describe("consentPrompt(): the banner asks exactly when a category is active", () => {
  it("false for nothing active, true for one or two", () => {
    expect(consentPrompt({ ga4MeasurementId: undefined, active: [] })).toBe(
      false,
    );
    expect(
      consentPrompt({ ga4MeasurementId: undefined, active: ["marketing"] }),
    ).toBe(true);
    expect(
      consentPrompt(
        consentSources({ [GA4_MEASUREMENT_ID_KEY]: "G-FIXTURE00" }),
      ),
    ).toBe(true);
    expect(consentPrompt(consentSources({}))).toBe(false);
  });
});

const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))
      ? [path]
      : [];
  });
}

/**
 * Whether a source text calls `ga4MeasurementId(` in code, read token by token with comments
 * skipped. A declaration (`function ga4MeasurementId(`) counts as a call here too: only the file
 * that defines it may contain one.
 */
export function callsGa4MeasurementId(text: string, tsx: boolean): boolean {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ true,
    tsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    text,
  );
  let previous: { kind: ts.SyntaxKind; text: string } | null = null;
  for (
    let kind = scanner.scan();
    kind !== ts.SyntaxKind.EndOfFileToken;
    kind = scanner.scan()
  ) {
    if (
      kind === ts.SyntaxKind.OpenParenToken &&
      previous?.kind === ts.SyntaxKind.Identifier &&
      previous.text === "ga4MeasurementId"
    ) {
      return true;
    }
    previous = { kind, text: scanner.getTokenText() };
  }
  return false;
}

describe("one reader: no other file under `src/` calls `ga4MeasurementId(` (AC-21)", () => {
  it("the scanner skips comments and still sees code", () => {
    expect(
      callsGa4MeasurementId("// ga4MeasurementId(process.env)", false),
    ).toBe(false);
    expect(
      callsGa4MeasurementId(
        " * `ga4MeasurementId(process.env)` already",
        false,
      ),
    ).toBe(false);
    expect(
      callsGa4MeasurementId("/* ga4MeasurementId(x) */ const a = 1;", false),
    ).toBe(false);
    expect(
      callsGa4MeasurementId("const id = ga4MeasurementId(process.env);", false),
    ).toBe(true);
    expect(
      callsGa4MeasurementId(
        "<AnalyticsScripts measurementId={ga4MeasurementId(process.env)} />",
        true,
      ),
    ).toBe(true);
  });

  it("only `src/lib/env.schema.ts` and the reader contain a call", () => {
    const callers = sourceFilesUnder(resolve(repoRoot, "src"))
      .filter((file) =>
        callsGa4MeasurementId(
          readFileSync(file, "utf8"),
          file.endsWith(".tsx"),
        ),
      )
      .map((file) => relative(repoRoot, file))
      .sort();
    expect(callers).toEqual([
      "src/lib/env.schema.ts",
      "src/modules/analytics/consent-sources.ts",
    ]);
  });
});
