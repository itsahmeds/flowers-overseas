/**
 * T-63 (spec 001 §14 A20, AC-59; §13 Q19; TASK-163): a money type the compiler checks.
 *
 * Lint sees names, not values. The branded `Minor` makes the compiler refuse a computed number in
 * a money field until it has been through `toMinor()` or the module's `MinorUnitsSchema`, and lint
 * refuses the one way round both: `as Minor` anywhere but `pricing/money.ts`.
 *
 * Three halves, each of which goes red with its subject removed:
 *
 *  1. `toMinor()` throws on anything that is not a safe integer.
 *  2. `tests/fixtures/ts/minor-brand.ts` fails `tsc -p tsconfig.fixtures.json` on exactly the lines
 *     under its `// red:` comments and on no other line. The test reads tsc's output rather than
 *     trusting an `@ts-expect-error` (audit row 7), so dropping `.brand<"Minor">()` from the schema
 *     or widening a field back to `number` makes a red line compile, and this goes red.
 *  3. The real `eslint.config.mjs` rejects `as Minor` (and `<Minor>x`, and a forged brand) on every
 *     root but `money.ts`, and `@ts-expect-error` everywhere but `tests/`.
 */
import { ESLint } from "eslint";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { toMinor } from "@/modules/catalog/pricing/money";
import { MinorUnitsSchema } from "@/modules/catalog/schemas";

const repoRoot = resolve(__dirname, "../..");
const FIXTURE = "tests/fixtures/ts/minor-brand.ts";

describe("toMinor() (AC-59)", () => {
  it("returns a whole number unchanged", () => {
    expect(toMinor(4590)).toBe(4590);
    expect(toMinor(0)).toBe(0);
    expect(toMinor(-120)).toBe(-120);
    expect(toMinor(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([
    ["a fraction", 12.5],
    ["a float that looks whole to a person", 0.1 + 0.2],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["past the safe-integer range", Number.MAX_SAFE_INTEGER + 1],
  ])("throws on %s", (_label, value) => {
    expect(() => toMinor(value)).toThrow(/safe integer/);
  });

  it("and the module's schema is the other way in: it refuses a fraction", () => {
    expect(MinorUnitsSchema.parse(4590)).toBe(4590);
    expect(MinorUnitsSchema.safeParse(12.5).success).toBe(false);
  });
});

/** `file(line,col): error TSnnnn: …` lines of tsc's output for one file, by line. */
function tscErrorsFor(file: string): Map<number, string[]> {
  let output = "";
  try {
    execFileSync(
      process.execPath,
      [
        "node_modules/typescript/bin/tsc",
        "--noEmit",
        "--pretty",
        "false",
        "-p",
        "tsconfig.fixtures.json",
      ],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    output = (error as { stdout?: string }).stdout ?? "";
  }
  const errors = new Map<number, string[]>();
  for (const line of output.split("\n")) {
    const match = /^(.+?)\((\d+),\d+\): error (TS\d+):/.exec(line);
    if (match?.[1] !== file) continue;
    const at = Number.parseInt(match[2] ?? "", 10);
    errors.set(at, [...(errors.get(at) ?? []), match[3] ?? ""]);
  }
  return errors;
}

/** The line under each `// red: TSnnnn` comment of the fixture, with the code it names. */
function expectedReds(file: string): Map<number, string> {
  const reds = new Map<number, string>();
  readFileSync(resolve(repoRoot, file), "utf8")
    .split("\n")
    .forEach((text, index) => {
      const match = /^\s*\/\/ red: (TS\d+)$/.exec(text);
      if (match?.[1] !== undefined) reds.set(index + 2, match[1]);
    });
  return reds;
}

describe("the brand, through the compiler (T-63)", () => {
  it("fails tsc on each red line of minor-brand.ts, with its code, and nowhere else", () => {
    const reds = expectedReds(FIXTURE);
    // AC-59's two named lines, a bare literal, a sum with a plain number, the schema's brand.
    expect(reds.size).toBe(5);
    const errors = tscErrorsFor(FIXTURE);
    expect(
      Object.fromEntries(errors),
      "a line that should compile does not, or a red line compiles",
    ).toEqual(
      Object.fromEntries([...reds].map(([line, code]) => [line, [code]])),
    );
  }, 120_000);
});

const LINT_ROOTS = [
  "src/modules/geo/x.ts",
  "src/modules/catalog/pricing/resolve.ts",
  "src/config/catalogue/x.ts",
  "scripts/x.ts",
  "seed/x.ts",
  "db/x.ts",
  "tests/unit/x.test.ts",
  "x.config.ts",
];
const MONEY_TS = "src/modules/catalog/pricing/money.ts";

const eslint = new ESLint({ cwd: repoRoot });

/** The lines ESLint reports the `as Minor` ban on, for `code` at `file`. */
async function minorCastLines(code: string, file: string): Promise<number[]> {
  const [result] = await eslint.lintText(code, {
    filePath: resolve(repoRoot, file),
  });
  return (result?.messages ?? [])
    .filter(
      (message) =>
        message.ruleId === "no-restricted-syntax" &&
        message.message.includes("AC-59"),
    )
    .map((message) => message.line);
}

const PRELUDE = [
  'import type { z } from "zod";',
  'import type * as catalog from "@/modules/catalog/types";',
  'import type { Minor } from "@/modules/catalog/types";',
  "declare const x: number;",
  "",
].join("\n");
const AT = PRELUDE.split("\n").length;

describe("lint rejects `as Minor` outside money.ts (AC-59, AC-52's row)", () => {
  it.each([
    ["x as Minor", "export const m = x as Minor;"],
    ["<Minor>x", "export const m = <Minor>x;"],
    ["x as unknown as Minor", "export const m = x as unknown as Minor;"],
    ["x as catalog.Minor", "export const m = x as catalog.Minor;"],
    ["x as Minor | null", "export const m = x as Minor | null;"],
    [
      "an object cast to a Minor field",
      "export const m = { amountMinor: x } as { amountMinor: Minor };",
    ],
    ["a forged brand", 'export const m = x as number & z.$brand<"Minor">;'],
    [
      "a forged brand, qualified",
      'export const m = x as number & z.core.$brand<"Minor">;',
    ],
  ])("%s is red on every root", async (_label, line) => {
    for (const file of LINT_ROOTS) {
      expect(await minorCastLines(PRELUDE + line, file), file).toEqual([AT]);
    }
  });

  it.each([
    ["x as number", "export const m = x as number;"],
    ["a type named like it", "export const m = x as MinorThing;"],
    ["an annotation", "export const m: Minor | null = null;"],
    ["a parameter", "export const f = (m: Minor): number => m;"],
  ])("%s is not", async (_label, line) => {
    expect(
      await minorCastLines(
        `${PRELUDE}type MinorThing = number;\n${line}`,
        "src/modules/geo/x.ts",
      ),
    ).toEqual([]);
  });

  it("is allowed in money.ts, where toMinor() makes the one Minor", async () => {
    expect(
      await minorCastLines(`${PRELUDE}export const m = x as Minor;`, MONEY_TS),
    ).toEqual([]);
  });

  it("the real money.ts casts once, in toMinor(), which the ban would catch anywhere else", async () => {
    const source = readFileSync(resolve(repoRoot, MONEY_TS), "utf8");
    const lines = await minorCastLines(source, "src/modules/geo/money.ts");
    expect(lines).toHaveLength(1);
    expect(source.split("\n")[(lines[0] ?? 0) - 1]?.trim()).toBe(
      "return n as Minor;",
    );
  });
});
