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
