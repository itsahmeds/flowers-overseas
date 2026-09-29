/**
 * T-63 (spec 001 §14 A20, AC-59; §13 Q19; TASK-163): a money type the compiler checks.
 *
 * Lint sees names, not values. The branded `Minor` makes the compiler refuse a computed number in
 * a money field until it has been through `toMinor()` or the module's `MinorUnitsSchema`, and lint
 * refuses the one way round both: `as Minor` anywhere but `pricing/money.ts`.
 *
 * Four parts, each of which goes red with its subject removed:
 *
 *  1. `toMinor()` throws on anything that is not a safe integer.
 *  2. `tests/fixtures/ts/minor-brand.ts` fails `tsc -p tsconfig.fixtures.json` on exactly the lines
 *     under its `// red:` comments and on no other line. The test reads tsc's output rather than
 *     trusting an `@ts-expect-error` (audit row 7), so dropping `.brand<"Minor">()` from the schema
 *     or widening a field back to `number` makes a red line compile, and this goes red.
 *  3. The compiler, asked directly, says every `*Minor` field of the pricing types is a `Minor`,
 *     and which exports hold one: the lint's `MINOR_TYPES` and `MINOR_VALUES` must be exactly those.
 *  4. The real `eslint.config.mjs` rejects a cast to a `Minor`-holding type on every root but
 *     `money.ts`, a second brand (`.brand("Minor")`, `custom<Minor>()`, `$brand`) on every root but
 *     `schemas.ts`, and `@ts-expect-error` everywhere but `tests/`.
 */
import { ESLint } from "eslint";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { MINOR_TYPES, MINOR_VALUES } from "../../eslint/sdk-adapters.js";

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
    // AC-59's two named lines, a bare literal, a sum with a plain number, each of the 11 `*Minor`
    // fields of the pricing types (/break 120 hole 4), and the schema's brand.
    expect(reds.size).toBe(16);
    const errors = tscErrorsFor(FIXTURE);
    expect(
      Object.fromEntries(errors),
      "a line that should compile does not, or a red line compiles",
    ).toEqual(
      Object.fromEntries([...reds].map(([line, code]) => [line, [code]])),
    );
  }, 120_000);
});

/**
 * What the compiler says holds a `Minor`: each export of `types.ts` (as a type) and of
 * `schemas.ts` (as `z.output<typeof X>`), walked through properties, index signatures, unions,
 * intersections and arrays; and each property whose name ends in `Minor`, with its type.
 */
function minorCarriers(): {
  types: string[];
  schemas: string[];
  fields: Map<string, string>;
} {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    resolve(repoRoot, "tsconfig.json"),
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
  );
  if (parsed === undefined) throw new Error("tsconfig.json did not parse");
  const typesFile = resolve(repoRoot, "src/modules/catalog/types.ts");
  const schemasFile = resolve(repoRoot, "src/modules/catalog/schemas.ts");
  const first = ts.createProgram([typesFile, schemasFile], parsed.options);
  const firstChecker = first.getTypeChecker();
  const exportsOf = (file: string): ts.Symbol[] => {
    const source = first.getSourceFile(file);
    const moduleSymbol = source && firstChecker.getSymbolAtLocation(source);
    if (moduleSymbol === undefined) throw new Error(`no module for ${file}`);
    return firstChecker.getExportsOfModule(moduleSymbol);
  };
  const typeNames = exportsOf(typesFile)
    .filter(
      (symbol) =>
        (symbol.flags &
          (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) !==
        0,
    )
    .map((symbol) => symbol.name);
  const schemaNames = exportsOf(schemasFile)
    .filter((symbol) => (symbol.flags & ts.SymbolFlags.Variable) !== 0)
    .map((symbol) => symbol.name);
  const probe = resolve(repoRoot, "src/modules/catalog/__minor_probe__.ts");
  const text = [
    'import type { z } from "zod";',
    'import type * as T from "./types";',
    'import type * as S from "./schemas";',
    ...typeNames.map((name) => `export type T_${name} = T.${name};`),
    ...schemaNames.map(
      (name) => `export type S_${name} = z.output<typeof S.${name}>;`,
    ),
  ].join("\n");
  const host = ts.createCompilerHost(parsed.options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (file, language, ...rest) =>
    file === probe
      ? ts.createSourceFile(file, text, language, true)
      : read(file, language, ...rest);
  const program = ts.createProgram([probe], parsed.options, host);
  const checker = program.getTypeChecker();
  const probeSource = program.getSourceFile(probe);
  const probeModule = probeSource && checker.getSymbolAtLocation(probeSource);
  if (probeModule === undefined) throw new Error("the probe did not compile");

  const isMinor = (type: ts.Type): boolean =>
    type.aliasSymbol?.name === "Minor" ||
    (type.isIntersection() &&
      type.types.some((part) =>
        part
          .getProperties()
          .some((property) => property.name.includes("brand")),
      ));
  const carries = (type: ts.Type, seen: Set<ts.Type>): boolean => {
    if (seen.has(type)) return false;
    seen.add(type);
    if (isMinor(type)) return true;
    if (type.isUnionOrIntersection()) {
      return type.types.some((part) => carries(part, seen));
    }
    if (checker.isArrayType(type) || checker.isTupleType(type)) {
      return checker
        .getTypeArguments(type as ts.TypeReference)
        .some((part) => carries(part, seen));
    }
    if ((type.flags & ts.TypeFlags.Object) !== 0) {
      return (
        type
          .getProperties()
          .some((property) =>
            carries(checker.getTypeOfSymbol(property), seen),
          ) ||
        checker
          .getIndexInfosOfType(type)
          .some((info) => carries(info.type, seen))
      );
    }
    return false;
  };
  const types: string[] = [];
  const schemas: string[] = [];
  const fields = new Map<string, string>();
  for (const symbol of checker.getExportsOfModule(probeModule)) {
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    const name = symbol.name.slice(2);
    if (carries(type, new Set())) {
      (symbol.name.startsWith("T_") ? types : schemas).push(name);
    }
    if (!symbol.name.startsWith("T_")) continue;
    for (const property of type.getProperties()) {
      if (!property.name.endsWith("Minor")) continue;
      const propertyType = checker.getNonNullableType(
        checker.getTypeOfSymbol(property),
      );
      fields.set(
        `${name}.${property.name}`,
        isMinor(propertyType) ? "Minor" : checker.typeToString(propertyType),
      );
    }
  }
  return { types, schemas, fields };
}

describe("what holds a Minor, asked of the compiler (/break 120 holes 2 and 4)", () => {
  const carriers = minorCarriers();

  it("types every *Minor field of the pricing types as Minor", () => {
    expect(carriers.fields.size).toBeGreaterThanOrEqual(11);
    for (const [field, type] of carriers.fields) {
      expect(type, field).toBe("Minor");
    }
  });

  it("the lint's MINOR_TYPES are exactly the types.ts exports that hold one", () => {
    expect([...MINOR_TYPES].sort()).toEqual([...carriers.types].sort());
  });

  it("the lint's MINOR_VALUES are toMinor and exactly the schemas whose output holds one", () => {
    expect([...MINOR_VALUES].sort()).toEqual(
      ["toMinor", ...carriers.schemas].sort(),
    );
  });
}, 120_000);

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
const SCHEMAS_TS = "src/modules/catalog/schemas.ts";

const eslint = new ESLint({ cwd: repoRoot });

/** The lines ESLint reports the `as Minor` ban on, for `code` at `file`. */
async function minorCastLines(code: string, file: string): Promise<number[]> {
  const [result] = await eslint.lintText(code, {
    filePath: resolve(repoRoot, file),
  });
  return [
    ...new Set(
      (result?.messages ?? [])
        .filter(
          (message) =>
            message.ruleId === "no-restricted-syntax" &&
            message.message.includes("AC-59"),
        )
        .map((message) => message.line),
    ),
  ];
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
    // /break 120 hole 2: a type that holds a `Minor` under another name.
    [
      "an object cast to IntegerMoney",
      'export const m = { amountMinor: x, currency: "EUR" } as IntegerMoney;',
    ],
    [
      "x as unknown as PricePoint",
      "export const m = x as unknown as PricePoint;",
    ],
    ["x as VatSplit", "export const m = x as catalog.VatSplit;"],
    ["x as Quote", "export const m = x as Quote;"],
    ["an indexed access", 'export const m = x as IntegerMoney["amountMinor"];'],
    [
      "ReturnType<typeof toMinor>",
      "export const m = x as ReturnType<typeof toMinor>;",
    ],
    [
      "z.infer<typeof MinorUnitsSchema>",
      "export const m = x as z.infer<typeof MinorUnitsSchema>;",
    ],
    [
      "z.output<typeof PricePointSchema>",
      "export const m = x as z.output<typeof schemas.PricePointSchema>;",
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
    ["a cast to a type with no Minor", "export const m = x as Tier;"],
    [
      "typeof a value that is not money",
      "export const m = x as ReturnType<typeof formatMoney>;",
    ],
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
    expect(
      await minorCastLines(
        `${PRELUDE}export const m = x as Minor;`,
        SCHEMAS_TS,
      ),
    ).toEqual([AT]);
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

// /break 120 holes 1 and 3: the brand is made once, by `MinorUnitsSchema`.
describe("lint rejects a second Minor brand outside schemas.ts (AC-59)", () => {
  const BRANDS = [
    ['.brand<"Minor">()', 'export const s = z.number().brand<"Minor">();'],
    ['.brand("Minor")', 'export const s = z.number().brand("Minor");'],
    ["z.custom<Minor>()", "export const s = z.custom<Minor>();"],
    [
      "z.custom<IntegerMoney>()",
      "export const s = z.custom<catalog.IntegerMoney>();",
    ],
    ["$brand from zod/v4/core", 'import { $brand } from "zod/v4/core";'],
    ["$brand from zod", 'import { $brand as b } from "zod";'],
    [
      "a computed [$brand] key",
      "export const m = x as number & { [core.$brand]: { Minor: true } };",
    ],
  ] as const;

  it.each(BRANDS)(
    "%s is red on every root and in money.ts",
    async (_l, line) => {
      for (const file of [...LINT_ROOTS, MONEY_TS]) {
        expect(await minorCastLines(PRELUDE + line, file), file).toEqual([AT]);
      }
    },
  );

  it.each(BRANDS)("%s is allowed in schemas.ts", async (_l, line) => {
    expect(await minorCastLines(PRELUDE + line, SCHEMAS_TS)).toEqual([]);
  });

  it.each([
    ["another brand", 'export const s = z.number().brand<"Other">();'],
    ["z.custom<string>()", "export const s = z.custom<string>();"],
  ])("%s is not", async (_label, line) => {
    expect(
      await minorCastLines(PRELUDE + line, "src/modules/geo/x.ts"),
    ).toEqual([]);
  });

  it("the real schemas.ts brands once, which the ban would catch anywhere else", async () => {
    const source = readFileSync(resolve(repoRoot, SCHEMAS_TS), "utf8");
    const lines = await minorCastLines(source, "src/modules/geo/schemas.ts");
    expect(lines).toHaveLength(1);
    expect(source.split("\n")[(lines[0] ?? 0) - 1]).toContain(
      '.brand<"Minor">()',
    );
  });
});

describe("lint rejects @ts-expect-error outside tests/ (AC-59)", () => {
  const code = [
    "export const n: number = 1;",
    "// @ts-expect-error -- a reason long enough for the default option",
    'export const s: number = "x";',
    "",
  ].join("\n");
  const banned = async (file: string): Promise<number[]> => {
    const [result] = await eslint.lintText(code, {
      filePath: resolve(repoRoot, file),
    });
    return (result?.messages ?? [])
      .filter(
        (message) => message.ruleId === "@typescript-eslint/ban-ts-comment",
      )
      .map((message) => message.line);
  };

  it.each(LINT_ROOTS.filter((file) => !file.startsWith("tests/")))(
    "red at %s",
    async (file) => {
      expect(await banned(file)).toEqual([2]);
    },
  );

  it.each(["tests/unit/x.test.ts", "tests/integration/x.test.ts"])(
    "allowed at %s, where five type tests use it on purpose",
    async (file) => {
      expect(await banned(file)).toEqual([]);
    },
  );
});
