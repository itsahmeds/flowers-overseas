/**
 * T-56 (spec 001 §14 A20, AC-52 and AC-50; TASK-158): the config cannot quietly switch a lock off.
 *
 * AC-50 makes every inline comment powerless, but `noInlineConfig` is itself one line of
 * `eslint.config.mjs`, and so is every lock. This test asks ESLint's own API
 * (`calculateConfigForFile`, `isPathIgnored`) about every tracked file in each root the table
 * names, and reads the config objects themselves, so a one-line edit that turns a lock off or down
 * goes red here and names the lock:
 *
 * - a file in a table root is ignored, or a root has no file to ask about;
 * - `noInlineConfig` is not `true` for a file `eslint .` lints, or no config object without a
 *   `files` key sets it;
 * - a lock is not `error` on a file of a root the table names (outside its "allowed off" cell);
 * - a config object turns a lock off or down for any file outside that cell;
 * - an `fo/exception/<path>` object is not exactly one path turning off one rule that is not ours;
 * - `globalIgnores` differs from today's list.
 *
 * **The table grows with the locks and never names one that is not built yet** (AC-52). TASK-158
 * wrote it as the config stood then. TASK-160 added AC-56's locks to the `no-console` row,
 * `src/lib/step-summary.ts` to its "allowed off" cell, the AC-57 row, and both ACs' entries to the
 * "missing from the options" check (`ENTRY_CHECKS`): in flat config a later object's options
 * replace an earlier one's, so a second object setting `no-restricted-imports` would silently
 * drop the SDK list while the rule still reads `error`. TASK-162 widens
 * `fo/no-direct-order-status-write` to `scripts/`, `seed/` and `db/`; TASK-163 added the
 * `as Minor` row and its entries, which are checked by what they do: the options ESLint resolves
 * for a file are run over each cast specimen, and must report it.
 *
 * The entries are written out here, not read from `eslint/sdk-adapters.js`: a test that took its
 * expectation from the function it checks would follow that function anywhere.
 *
 * T-56's red cases are scratch copies of `eslint.config.mjs` with one edit each, passed to ESLint
 * as `overrideConfigFile`. They live under `node_modules/.cache/`, which git, ESLint, Prettier and
 * the comment scan all skip, so the copy's bare imports (`eslint/config`, `eslint-config-next/…`)
 * resolve from the repository's own `node_modules`; its two relative imports and
 * `import.meta.dirname` are rewritten to absolute paths.
 */
import { ESLint, Linter } from "eslint";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import fo from "../../eslint/fo/index.js";
import {
  SDK_ADAPTERS,
  SIDE_DOOR_FILES as SIDE_DOOR_FILES_CONFIG,
} from "../../eslint/sdk-adapters.js";
import { tsParser } from "./support/ts-parser";

const repoRoot = resolve(__dirname, "../..");
const REAL_CONFIG = resolve(repoRoot, "eslint.config.mjs");

/** One row of AC-52's table, as it stands when TASK-158 merges. */
interface LockRow {
  /** The row's name in AC-52's table. */
  readonly lock: string;
  readonly rules: readonly string[];
  /** Roots (a trailing `/`) on which every rule of the row must be `error`. */
  readonly errorOn: readonly string[];
  /** Roots (a trailing `/`) inside `errorOn` that the row does not cover. */
  readonly exceptUnder?: readonly string[];
  /**
   * File paths, or `dir/**` globs, where the row may be off; everywhere else it may not. A
   * config object may turn a rule of the row off only when its `files` are exactly such entries.
   */
  readonly allowedOff: readonly string[];
}

const FO_RULES = Object.keys(fo.rules ?? {}).map((name) => `fo/${name}`);
const FLOAT_MONEY = "fo/no-float-money";
const ORDER_STATUS = "fo/no-direct-order-status-write";

/** AC-56: the only files in `src/` where the side doors are open. */
const SIDE_DOOR_FILES = ["src/lib/logger.ts", "src/lib/step-summary.ts"];

/** AC-59: the only file where `as Minor` is allowed (`toMinor()` in the pricing module). */
const MINOR_CAST_FILES = ["src/modules/catalog/pricing/money.ts"];

/** AC-59's specimens: each must be reported by the options ESLint resolves for a file. */
const MINOR_CASTS = [
  "x as Minor",
  "<Minor>x",
  "x as unknown as Minor",
  "x as catalog.Minor",
  'x as number & z.$brand<"Minor">',
  // /break 120 hole 2: a type that holds a `Minor` under another name, and `typeof` the one parse.
  "x as IntegerMoney",
  "x as unknown as PricePoint",
  'x as IntegerMoney["amountMinor"]',
  "x as ReturnType<typeof toMinor>",
  "x as z.infer<typeof MinorUnitsSchema>",
];

/** AC-59: the only file where the `Minor` brand is made (`MinorUnitsSchema`). */
const MINOR_BRAND_FILES = ["src/modules/catalog/schemas.ts"];

/** AC-59's brand specimens (/break 120 holes 1 and 3), off only in `MINOR_BRAND_FILES`. */
const MINOR_BRANDS = [
  'z.number().brand<"Minor">()',
  'z.number().brand("Minor")',
  "z.custom<Minor>()",
  "core.$brand",
];

/** AC-57's table: each package (by specimen specifiers) and the only files that may import it. */
const SDK_TABLE: readonly {
  readonly lock: string;
  readonly specimens: readonly string[];
  readonly allowedIn: readonly string[];
}[] = [
  {
    lock: "@sentry/*",
    specimens: ["@sentry/nextjs", "@sentry/node"],
    allowedIn: [
      "src/lib/sentry.ts",
      "sentry.server.config.ts",
      "sentry.edge.config.ts",
      "instrumentation.ts",
      "instrumentation-client.ts",
      "next.config.ts",
    ],
  },
  {
    lock: "postgres",
    specimens: [
      "postgres",
      "postgres/cjs/src/index.js",
      "drizzle-orm/postgres-js",
      "drizzle-orm/postgres-js/driver",
    ],
    allowedIn: ["src/lib/db.ts", "scripts/db-migrate.ts"],
  },
  {
    lock: "stripe",
    specimens: ["stripe", "stripe/lib/stripe.js"],
    allowedIn: ["src/modules/payments/stripe/**"],
  },
  {
    lock: "@mollie/*",
    specimens: ["@mollie/api-client", "@mollie/other-sdk"],
    allowedIn: ["src/modules/payments/mollie/**"],
  },
  {
    lock: "resend",
    specimens: ["resend", "resend/build/src/index"],
    allowedIn: ["src/modules/notifications/resend/**"],
  },
];

/**
 * Specifiers that are none of the table's packages (/break 117 hole 3): a pattern loosened to a
 * bare prefix (`^stripe`, `^@mollie`) or to a substring goes red on one of these.
 */
const NOT_SDK = [
  "stripe-mock",
  "stripes",
  "@stripe/stripe-js",
  "resend-otp",
  "resendable",
  "postgres-array",
  "postgresql",
  "drizzle-orm",
  "drizzle-orm/pg-core",
  "drizzle-orm/postgres-jsx",
  "@sentryx/node",
  "sentry",
  "@mollie2/api-client",
  "mollie",
];

/** A path matches an entry that is the path itself, or `dir/**` above it. */
const matchesEntry = (file: string, entry: string): boolean =>
  entry.endsWith("/**") ? file.startsWith(entry.slice(0, -2)) : file === entry;

/** The options of a resolved rule entry, without its severity. */
function optionsOf(entry: Linter.RuleEntry | undefined): unknown[] {
  return Array.isArray(entry) ? entry.slice(1) : [];
}

type Rec = Readonly<Record<string, unknown>>;
const isRec = (value: unknown): value is Rec =>
  typeof value === "object" && value !== null;

/** `no-restricted-imports`' `paths` and `patterns`, from any of the rule's option shapes. */
function importsOf(options: unknown[]): { paths: Rec[]; patterns: Rec[] } {
  const paths: Rec[] = [];
  const patterns: Rec[] = [];
  for (const option of options) {
    if (typeof option === "string") paths.push({ name: option });
    else if (isRec(option) && ("paths" in option || "patterns" in option)) {
      for (const path of (option["paths"] as unknown[] | undefined) ?? []) {
        paths.push(typeof path === "string" ? { name: path } : (path as Rec));
      }
      for (const pattern of (option["patterns"] as unknown[] | undefined) ??
        []) {
        patterns.push(
          typeof pattern === "string" ? { group: [pattern] } : (pattern as Rec),
        );
      }
    } else if (isRec(option)) paths.push(option);
  }
  return { paths, patterns };
}

/** `no-restricted-syntax`'s selectors. */
const selectorsOf = (options: unknown[]): string[] =>
  options.flatMap((option) =>
    typeof option === "string"
      ? [option]
      : isRec(option) && typeof option["selector"] === "string"
        ? [option["selector"]]
        : [],
  );

/** The regexes of a selector's `[attr=/…/]` parts, with esquery's `\u002F` read back as `/`. */
const selectorRegexes = (selector: string): RegExp[] =>
  [...selector.matchAll(/=\/((?:[^/\\]|\\.)+)\//g)].flatMap((match) =>
    match[1] === undefined ? [] : [new RegExp(match[1])],
  );

const importBanned = (patterns: Rec[], specimen: string): boolean =>
  patterns.some(
    (pattern) =>
      typeof pattern["regex"] === "string" &&
      new RegExp(pattern["regex"]).test(specimen),
  );

type SyntaxForm =
  "import()" | "require()" | "import(``)" | "require(``)" | "import type";

/** Whether a selector is the form's: a literal or a no-substitution template specifier. */
const isForm = (selector: string, form: SyntaxForm): boolean => {
  const template = selector.includes("TemplateLiteral");
  switch (form) {
    case "import()":
      return selector.startsWith("ImportExpression[source.value=");
    case "import(``)":
      return selector.startsWith("ImportExpression") && template;
    case "require()":
      return /callee\.name=["']require["']\]\[arguments\.0\.value=/.test(
        selector,
      );
    case "require(``)":
      return /callee\.name=["']require["']/.test(selector) && template;
    case "import type":
      return selector.startsWith("TSImportType");
  }
};

const syntaxBanned = (
  selectors: string[],
  form: SyntaxForm,
  specimen: string,
): boolean =>
  selectors.some(
    (selector) =>
      isForm(selector, form) &&
      selectorRegexes(selector).some((regex) => regex.test(specimen)),
  );

/**
 * AC-52's "an entry of AC-56, AC-57 or AC-59 is missing from the options of its `no-restricted-*`
 * rule for that file". Each check names its lock, the rule, the entry and the files it covers.
 */
interface EntryCheck {
  readonly lock: string;
  readonly rule: string;
  readonly entry: string;
  readonly applies: (file: string) => boolean;
  readonly present: (options: unknown[]) => boolean;
}

const inSrcOutsideSideDoors = (file: string): boolean =>
  file.startsWith("src/") && !SIDE_DOOR_FILES.includes(file);
const AC56 = "no-console and AC-56's locks";
const AC57 = "AC-57's SDK locks";
const AC59 = "AC-59's as Minor ban";

const castLinter = new Linter({ configType: "flat" });
const castReported = new Map<string, boolean>();

/** Whether `no-restricted-syntax` with these options reports `specimen` (AC-59). */
function castBanned(options: unknown[], specimen: string): boolean {
  const key = JSON.stringify([options, specimen]);
  const known = castReported.get(key);
  if (known !== undefined) return known;
  const messages = castLinter.verify(
    `declare const x: number;\nexport const m = ${specimen};\n`,
    {
      files: ["**/*.ts"],
      languageOptions: { parser: tsParser },
      rules: {
        "no-restricted-syntax": ["error", ...options] as Linter.RuleEntry,
      },
    },
    "specimen.ts",
  );
  const reported = messages.some(
    (message) =>
      message.ruleId === "no-restricted-syntax" && message.line === 2,
  );
  castReported.set(key, reported);
  return reported;
}

const ENTRY_CHECKS: readonly EntryCheck[] = [
  {
    lock: AC56,
    rule: "no-restricted-globals",
    entry: "console",
    applies: inSrcOutsideSideDoors,
    present: (options) =>
      options.some(
        (o) => o === "console" || (isRec(o) && o["name"] === "console"),
      ),
  },
  ...[
    ["globalThis", "console"],
    ["window", "console"],
    ["self", "console"],
    ["global", "console"],
    ["process", "stdout"],
    ["process", "stderr"],
  ].map(([object, property]): EntryCheck => ({
    lock: AC56,
    rule: "no-restricted-properties",
    entry: `${String(object)}.${String(property)}`,
    applies: inSrcOutsideSideDoors,
    present: (options) =>
      options.some(
        (o) => isRec(o) && o["object"] === object && o["property"] === property,
      ),
  })),
  ...[
    ["globalThis", "console", "console"],
    ["process", "stdout", "stdout"],
    ["process", "stderr", "stderr"],
  ].map(([object, property]): EntryCheck => ({
    lock: AC56,
    rule: "no-restricted-syntax",
    entry: `${String(object)}["${String(property)}"]`,
    applies: inSrcOutsideSideDoors,
    present: (options) =>
      selectorsOf(options).some(
        (selector) =>
          selector.startsWith("MemberExpression[computed=true]") &&
          selector.includes(String(object)) &&
          selector.includes(String(property)),
      ),
  })),
  // /break 117 hole 6: the same behind `as`, `<T>`, `!` or `satisfies`.
  ...[
    ["globalThis", "console"],
    ["process", "stdout"],
  ].map(([object, property]): EntryCheck => ({
    lock: AC56,
    rule: "no-restricted-syntax",
    entry: `(${String(object)} as T).${String(property)}`,
    applies: inSrcOutsideSideDoors,
    present: (options) =>
      selectorsOf(options).some(
        (selector) =>
          selector.startsWith("MemberExpression[object.type=") &&
          ["TSAsExpression", "TSNonNullExpression", "TSTypeAssertion"].every(
            (wrapper) =>
              selectorRegexes(selector).some((regex) => regex.test(wrapper)),
          ) &&
          selector.includes(String(object)) &&
          selector.includes(String(property)),
      ),
  })),
  ...["console", "node:console"].map((name): EntryCheck => ({
    lock: AC56,
    rule: "no-restricted-imports",
    entry: `import ${name}`,
    applies: inSrcOutsideSideDoors,
    present: (options) =>
      importsOf(options).paths.some(
        (path) => path["name"] === name && path["importNames"] === undefined,
      ),
  })),
  ...["process", "node:process"].map((name): EntryCheck => ({
    lock: AC56,
    rule: "no-restricted-imports",
    entry: `import { stdout, stderr } from ${name}`,
    applies: inSrcOutsideSideDoors,
    present: (options) =>
      importsOf(options).paths.some((path) => {
        const names = path["importNames"];
        return (
          path["name"] === name &&
          Array.isArray(names) &&
          names.includes("stdout") &&
          names.includes("stderr")
        );
      }),
  })),
  ...SDK_TABLE.flatMap((row) =>
    row.specimens.flatMap((specimen): EntryCheck[] => {
      const applies = (file: string): boolean =>
        !file.startsWith("tests/") &&
        !row.allowedIn.some((entry) => matchesEntry(file, entry));
      return [
        {
          lock: AC57,
          rule: "no-restricted-imports",
          entry: `import "${specimen}"`,
          applies,
          present: (options) =>
            importBanned(importsOf(options).patterns, specimen),
        },
        ...(
          [
            "import()",
            "require()",
            "import(``)",
            "require(``)",
            "import type",
          ] as const
        ).map((form): EntryCheck => ({
          lock: AC57,
          rule: "no-restricted-syntax",
          entry: `${form} "${specimen}"`,
          applies,
          present: (options) =>
            syntaxBanned(selectorsOf(options), form, specimen),
        })),
      ];
    }),
  ),
  ...MINOR_CASTS.map((specimen): EntryCheck => ({
    lock: AC59,
    rule: "no-restricted-syntax",
    entry: specimen,
    applies: (file) => !MINOR_CAST_FILES.includes(file),
    present: (options) => castBanned(options, specimen),
  })),
  ...MINOR_BRANDS.map((specimen): EntryCheck => ({
    lock: AC59,
    rule: "no-restricted-syntax",
    entry: specimen,
    applies: (file) => !MINOR_BRAND_FILES.includes(file),
    present: (options) => castBanned(options, specimen),
  })),
];

const TABLE: readonly LockRow[] = [
  {
    lock: "every fo/* rule except the two below",
    rules: FO_RULES.filter(
      (rule) => rule !== FLOAT_MONEY && rule !== ORDER_STATUS,
    ),
    errorOn: ["src/"],
    allowedOff: [],
  },
  {
    lock: FLOAT_MONEY,
    rules: [FLOAT_MONEY],
    errorOn: ["src/", "src/config/", "seed/", "scripts/"],
    allowedOff: [],
  },
  {
    lock: ORDER_STATUS,
    rules: [ORDER_STATUS],
    // TASK-162 (AC-60): every root that can reach the database.
    errorOn: ["src/", "scripts/", "seed/", "db/"],
    allowedOff: [],
  },
  {
    lock: "no-console and AC-56's locks",
    // AC-56's entries in `no-restricted-imports` and `no-restricted-syntax` share those two rules
    // with AC-57, so they are held by `ENTRY_CHECKS` below; these two rules carry AC-56 alone.
    rules: ["no-console", "no-restricted-globals", "no-restricted-properties"],
    errorOn: ["src/"],
    allowedOff: [...SIDE_DOOR_FILES],
  },
  {
    lock: "AC-57's SDK locks",
    rules: ["no-restricted-imports", "no-restricted-syntax"],
    // "every root": every file `eslint .` lints, `tests/` apart (AC-57's last row).
    errorOn: [""],
    exceptUnder: ["tests/"],
    allowedOff: [...SDK_TABLE.flatMap((row) => row.allowedIn), "tests/**"],
  },
  {
    lock: AC59,
    rules: ["no-restricted-syntax"],
    // "every root", `tests/` included; `tests/fixtures/` is in `globalIgnores`.
    errorOn: [""],
    exceptUnder: ["tests/fixtures/"],
    allowedOff: [...MINOR_CAST_FILES],
  },
];

/** AC-52: "`globalIgnores` differs from today's list". */
const GLOBAL_IGNORES = [
  ".next/**",
  "out/**",
  "build/**",
  "coverage/**",
  "next-env.d.ts",
  "tests/fixtures/**",
];

/** One untracked path under each of today's patterns; each must stay ignored. */
const IGNORE_PROBES = [
  ".next/server/x.js",
  "out/x.js",
  "build/x.js",
  "coverage/x.js",
  "next-env.d.ts",
  "tests/fixtures/x.ts",
];

/**
 * Config objects allowed to set a `processor` (the name, or `#index` for an unnamed one). A
 * processor decides which code blocks ESLint lints and which messages survive, so a no-op one
 * silences every rule while `calculateConfigForFile` still reads `error`. None exists today.
 */
const PROCESSORS_TODAY: readonly string[] = [];

/**
 * The objects that set `languageOptions.parser`, in config order, exactly as today (/break 113
 * round 2, hole 2). A parser that returns an empty Program leaves no node for any rule to visit,
 * so it silences a path as a processor does. `eslint-config-next` supplies these three; a new
 * one, or a second object reusing one of these names, changes the list.
 */
const PARSERS_TODAY: readonly string[] = [
  "next",
  "next/typescript",
  "typescript-eslint/base",
];

/** The objects that set `language`, exactly as today: none (it silences the same way). */
const LANGUAGES_TODAY: readonly string[] = [];

const LINTABLE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const TRACKED = execFileSync("git", ["ls-files"], {
  cwd: repoRoot,
  encoding: "utf8",
})
  .split("\n")
  .filter((file) => LINTABLE.test(file));

type Severity = 0 | 1 | 2;
const SEVERITY_NAME = ["off", "warn", "error"] as const;

function severityOf(entry: Linter.RuleEntry | undefined): Severity | undefined {
  const raw: unknown = Array.isArray(entry) ? entry[0] : entry;
  if (raw === "off" || raw === 0) return 0;
  if (raw === "warn" || raw === 1) return 1;
  if (raw === "error" || raw === 2) return 2;
  return undefined;
}

const describeFiles = (files: Linter.Config["files"]): string =>
  files === undefined ? "every file" : JSON.stringify(files);

/** Every way `configFile` lets a lock go off or down; empty when the config holds them all. */
async function coverageViolations(configFile: string): Promise<string[]> {
  const violations: string[] = [];
  const configs = (
    (await import(pathToFileURL(configFile).href)) as {
      default: Linter.Config[];
    }
  ).default;

  // The config objects themselves: global ignores, noInlineConfig, and every lock set off or down.
  // ESLint 9 reads an object whose keys are only `name`, `basePath` and `ignores` as global
  // ignores; a `basePath` prefixes its patterns.
  const globalIgnores = new Set<string>();
  for (const config of configs) {
    const keys = Object.keys(config).filter(
      (key) => key !== "name" && key !== "basePath",
    );
    if (keys.length === 1 && keys[0] === "ignores") {
      const base = (config as { basePath?: string }).basePath;
      for (const pattern of config.ignores ?? []) {
        globalIgnores.add(
          base === undefined ? String(pattern) : `${base}/${String(pattern)}`,
        );
      }
    }
  }
  const actualIgnores = [...globalIgnores].sort();
  if (
    JSON.stringify(actualIgnores) !== JSON.stringify([...GLOBAL_IGNORES].sort())
  ) {
    violations.push(
      `globalIgnores: ${JSON.stringify(actualIgnores)} differs from ${JSON.stringify([...GLOBAL_IGNORES].sort())}`,
    );
  }
  if (
    !configs.some(
      (config) =>
        config.files === undefined &&
        config.linterOptions?.noInlineConfig === true,
    )
  ) {
    violations.push(
      "noInlineConfig: no config object without a `files` key sets `linterOptions.noInlineConfig: true` (AC-50)",
    );
  }
  const labelOf = (config: Linter.Config, index: number): string =>
    config.name ?? `#${String(index)}`;
  const setting = (has: (config: Linter.Config) => boolean): string[] =>
    configs.flatMap((config, index) =>
      has(config) ? [labelOf(config, index)] : [],
    );
  const parsers = setting(
    (config) => config.languageOptions?.["parser"] !== undefined,
  );
  if (JSON.stringify(parsers) !== JSON.stringify(PARSERS_TODAY)) {
    violations.push(
      `parser: config objects setting languageOptions.parser are ${JSON.stringify(parsers)}; only PARSERS_TODAY may (${JSON.stringify(PARSERS_TODAY)})`,
    );
  }
  const languages = setting((config) => config.language !== undefined);
  if (JSON.stringify(languages) !== JSON.stringify(LANGUAGES_TODAY)) {
    violations.push(
      `language: config objects setting language are ${JSON.stringify(languages)}; only LANGUAGES_TODAY may (${JSON.stringify(LANGUAGES_TODAY)})`,
    );
  }
  configs.forEach((config, index) => {
    const label = labelOf(config, index);
    if (config.processor !== undefined && !PROCESSORS_TODAY.includes(label)) {
      violations.push(
        `processor: config object ${label} sets a processor for ${describeFiles(config.files)}; only PROCESSORS_TODAY may (${JSON.stringify(PROCESSORS_TODAY)})`,
      );
    }
    for (const row of TABLE) {
      for (const rule of row.rules) {
        const severity = severityOf(config.rules?.[rule]);
        if (severity === undefined || severity === 2) continue;
        const files = config.files;
        const allowed =
          files !== undefined &&
          files.length > 0 &&
          files.every(
            (pattern) =>
              typeof pattern === "string" && row.allowedOff.includes(pattern),
          ) &&
          (config.ignores === undefined || config.ignores.length === 0);
        if (!allowed) {
          violations.push(
            `${rule}: turned ${SEVERITY_NAME[severity]} by config object ${label} for ${describeFiles(files)}; allowed off only in ${row.allowedOff.length === 0 ? "nowhere" : row.allowedOff.join(", ")} (${row.lock})`,
          );
        }
      }
    }
    if (config.name?.startsWith("fo/exception/") === true) {
      const path = config.name.slice("fo/exception/".length);
      const ruleNames = Object.keys(config.rules ?? {});
      const [only] = ruleNames;
      if (
        JSON.stringify(config.files) !== JSON.stringify([path]) ||
        ruleNames.length !== 1 ||
        only === undefined ||
        severityOf(config.rules?.[only]) !== 0 ||
        only.startsWith("fo/") ||
        TABLE.some((row) => row.rules.includes(only))
      ) {
        violations.push(
          `fo/exception: ${config.name} must have \`files\` exactly [${JSON.stringify(path)}] and turn off one rule that is not ours (AC-50)`,
        );
      }
    }
  });

  // What ESLint makes of it, file by file.
  const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: configFile });
  const resolved = new Map<string, Linter.Config | undefined>();
  const configFor = async (
    file: string,
  ): Promise<Linter.Config | undefined> => {
    if (!resolved.has(file)) {
      const ignored = await eslint.isPathIgnored(resolve(repoRoot, file));
      resolved.set(
        file,
        ignored
          ? undefined
          : ((await eslint.calculateConfigForFile(resolve(repoRoot, file))) as
              Linter.Config | undefined),
      );
    }
    return resolved.get(file);
  };

  // What ESLint ignores must be exactly what today's six patterns say, whatever object ignores
  // it: every tracked lintable file, plus one path under each pattern that git does not track.
  const expectedIgnored = (file: string): boolean =>
    GLOBAL_IGNORES.some((pattern) =>
      pattern.endsWith("/**")
        ? file.startsWith(pattern.slice(0, -2))
        : file === pattern,
    );
  for (const file of [...TRACKED, ...IGNORE_PROBES]) {
    const ignored = await eslint.isPathIgnored(resolve(repoRoot, file));
    if (ignored && !expectedIgnored(file)) {
      violations.push(
        `globalIgnores: ${file} is ignored, but none of today's patterns matches it`,
      );
    } else if (!ignored && expectedIgnored(file)) {
      violations.push(
        `globalIgnores: ${file} matches today's patterns, but ESLint lints it`,
      );
    }
  }

  for (const file of TRACKED) {
    const config = await configFor(file);
    if (config !== undefined && config.linterOptions?.noInlineConfig !== true) {
      violations.push(`noInlineConfig: not true for ${file} (AC-50)`);
    }
  }
  for (const row of TABLE) {
    for (const root of row.errorOn) {
      const files = TRACKED.filter(
        (file) =>
          file.startsWith(root) &&
          !(row.exceptUnder ?? []).some((except) => file.startsWith(except)),
      );
      if (files.length === 0) {
        violations.push(
          `root: ${root} has no tracked file to ask ESLint about (${row.lock})`,
        );
        continue;
      }
      for (const file of files) {
        const config = await configFor(file);
        if (config === undefined) {
          violations.push(
            `ignored: ${file}, in root ${root} of the lock table (${row.lock})`,
          );
          continue;
        }
        if (row.allowedOff.some((entry) => matchesEntry(file, entry))) continue;
        for (const rule of row.rules) {
          const severity = severityOf(config.rules?.[rule]);
          if (severity !== 2) {
            violations.push(
              `${rule}: ${severity === undefined ? "not configured" : SEVERITY_NAME[severity]} on ${file}; must be error on ${root} (${row.lock})`,
            );
          }
        }
      }
    }
  }
  for (const file of TRACKED) {
    const checks = ENTRY_CHECKS.filter((check) => check.applies(file));
    if (checks.length === 0) continue;
    const config = await configFor(file);
    if (config === undefined) continue;
    for (const check of checks) {
      const entry = config.rules?.[check.rule];
      if (severityOf(entry) !== 2 || !check.present(optionsOf(entry))) {
        violations.push(
          `${check.rule}: entry ${check.entry} missing from the options for ${file} (${check.lock})`,
        );
      }
    }
  }
  return [...new Set(violations)];
}

const SCRATCH_PARENT = resolve(repoRoot, "node_modules/.cache");
const scratchDirs: string[] = [];

afterAll(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

/** A scratch copy of the real config with at most one edit, runnable from outside the root. */
function scratchConfig(edit?: {
  readonly from: string;
  readonly to: string;
}): string {
  let text = readFileSync(REAL_CONFIG, "utf8");
  if (edit !== undefined) {
    expect(text.split(edit.from).length - 1, edit.from).toBe(1);
    text = text.replace(edit.from, edit.to);
  }
  text = text
    .replaceAll(
      'from "./eslint/',
      `from "${pathToFileURL(resolve(repoRoot, "eslint")).href}/`,
    )
    .replace("import.meta.dirname", JSON.stringify(repoRoot));
  // A relative import added later would resolve against the scratch folder, not the repository.
  expect(text).not.toMatch(/from "\.\.?\//);
  mkdirSync(SCRATCH_PARENT, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH_PARENT, "fo-lint-coverage-"));
  scratchDirs.push(dir);
  const file = join(dir, "eslint.config.mjs");
  writeFileSync(file, text);
  return file;
}

/** Inserted as the last config object before `globalIgnores`. */
const addBlock = (block: string) => ({
  from: "\n  globalIgnores([",
  to: `\n  ${block},\n  globalIgnores([`,
});

describe("the lock table (AC-52) over the real config", () => {
  it("names all seven fo/* rules, so a rule added later joins the first row", () => {
    expect(FO_RULES).toHaveLength(7);
    for (const rule of FO_RULES) {
      expect(
        TABLE.some((row) => row.rules.includes(rule)),
        rule,
      ).toBe(true);
    }
  });

  it("applies AC-56, AC-57 and AC-59's entries by file, as their tables say", () => {
    const count = (file: string): number =>
      ENTRY_CHECKS.filter((check) => check.applies(file)).length;
    // 16 AC-56 entries; 12 specimens × 6 import forms for AC-57; 10 AC-59 casts + 4 brands.
    expect(count("src/modules/geo/corridor.ts")).toBe(16 + 72 + 14);
    expect(count("src/lib/logger.ts")).toBe(72 + 14);
    expect(count("src/lib/step-summary.ts")).toBe(72 + 14);
    expect(count("src/lib/sentry.ts")).toBe(16 + 60 + 14);
    expect(count("src/lib/db.ts")).toBe(16 + 48 + 14);
    expect(count("next.config.ts")).toBe(60 + 14);
    expect(count("scripts/db-migrate.ts")).toBe(48 + 14);
    expect(count("scripts/env-check.ts")).toBe(72 + 14);
    expect(count("src/modules/payments/stripe/client.ts")).toBe(16 + 60 + 14);
    expect(count("tests/unit/sentry-before-send.test.ts")).toBe(14);
    expect(count("src/modules/catalog/pricing/money.ts")).toBe(16 + 72 + 4);
    expect(count("src/modules/catalog/schemas.ts")).toBe(16 + 72 + 10);
  });

  it("bans no package outside the table: each pattern is the package, not a prefix (/break 117 hole 3)", async () => {
    const eslint = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: REAL_CONFIG,
    });
    for (const file of [
      "src/modules/geo/corridor.ts",
      "scripts/env-check.ts",
    ]) {
      const config = (await eslint.calculateConfigForFile(
        resolve(repoRoot, file),
      )) as Linter.Config;
      const { patterns } = importsOf(
        optionsOf(config.rules?.["no-restricted-imports"]),
      );
      const selectors = selectorsOf(
        optionsOf(config.rules?.["no-restricted-syntax"]),
      );
      for (const specimen of NOT_SDK) {
        expect(importBanned(patterns, specimen), `${file}: ${specimen}`).toBe(
          false,
        );
        for (const form of [
          "import()",
          "require()",
          "import(``)",
          "require(``)",
          "import type",
        ] as const) {
          expect(
            syntaxBanned(selectors, form, specimen),
            `${file}: ${form} ${specimen}`,
          ).toBe(false);
        }
      }
    }
  });

  it("keeps AC-57's table in step with eslint/sdk-adapters.js", () => {
    expect(
      SDK_ADAPTERS.map((row) => ({ lock: row.name, allowedIn: row.files })),
    ).toEqual(
      SDK_TABLE.map((row) => ({ lock: row.lock, allowedIn: row.allowedIn })),
    );
    expect([...SIDE_DOOR_FILES_CONFIG]).toEqual(SIDE_DOOR_FILES);
  });

  it("finds a tracked file in every root the table names", () => {
    for (const root of new Set(TABLE.flatMap((row) => row.errorOn))) {
      expect(
        TRACKED.some((file) => file.startsWith(root)),
        root,
      ).toBe(true);
    }
  });

  it("holds every lock: no violation", async () => {
    expect(await coverageViolations(REAL_CONFIG)).toEqual([]);
  });

  it("holds every lock through an unedited scratch copy (the harness itself is neutral)", async () => {
    expect(await coverageViolations(scratchConfig())).toEqual([]);
  });
});

describe("a one-line edit to eslint.config.mjs goes red and names the lock (T-56)", () => {
  const redFor = async (edit: {
    from: string;
    to: string;
  }): Promise<string[]> => {
    const violations = await coverageViolations(scratchConfig(edit));
    expect(violations.length).toBeGreaterThan(0);
    return violations;
  };

  it("noInlineConfig removed", async () => {
    const violations = await redFor({
      from: "linterOptions: { noInlineConfig: true },",
      to: "",
    });
    expect(violations).toContain(
      "noInlineConfig: no config object without a `files` key sets `linterOptions.noInlineConfig: true` (AC-50)",
    );
    expect(violations).toContain(
      "noInlineConfig: not true for src/lib/logger.ts (AC-50)",
    );
  });

  it('"src/modules/geo/**" added to globalIgnores', async () => {
    const violations = await redFor({
      from: "globalIgnores([",
      to: 'globalIgnores([\n    "src/modules/geo/**",',
    });
    expect(violations.some((v) => v.startsWith("globalIgnores: "))).toBe(true);
    expect(
      violations.some((v) =>
        v.startsWith("ignored: src/modules/geo/corridor.ts,"),
      ),
    ).toBe(true);
  });

  it("a block turning fo/no-float-money off for seed/**", async () => {
    const violations = await redFor(
      addBlock('{ files: ["seed/**"], rules: { "fo/no-float-money": "off" } }'),
    );
    expect(
      violations.some(
        (v) =>
          v.startsWith("fo/no-float-money: turned off by config object #") &&
          v.includes('for ["seed/**"]'),
      ),
    ).toBe(true);
    expect(
      violations.some(
        (v) =>
          v.startsWith("fo/no-float-money: off on seed/") &&
          v.includes("must be error on seed/"),
      ),
    ).toBe(true);
  });

  it("an fo/exception/… block turning fo/no-literal-strings off", async () => {
    const violations = await redFor(
      addBlock(
        '{ name: "fo/exception/src/app/layout.tsx", files: ["src/app/layout.tsx"], rules: { "fo/no-literal-strings": "off" } }',
      ),
    );
    expect(violations).toContain(
      "fo/no-literal-strings: off on src/app/layout.tsx; must be error on src/ (every fo/* rule except the two below)",
    );
    expect(violations).toContain(
      'fo/exception: fo/exception/src/app/layout.tsx must have `files` exactly ["src/app/layout.tsx"] and turn off one rule that is not ours (AC-50)',
    );
  });

  it("a block turning no-console off for src/modules/geo/**", async () => {
    const violations = await redFor(
      addBlock(
        '{ files: ["src/modules/geo/**"], rules: { "no-console": "off" } }',
      ),
    );
    expect(
      violations.some(
        (v) =>
          v.startsWith("no-console: turned off by config object #") &&
          v.includes('for ["src/modules/geo/**"]'),
      ),
    ).toBe(true);
    expect(violations).toContain(
      "no-console: off on src/modules/geo/corridor.ts; must be error on src/ (no-console and AC-56's locks)",
    );
  });

  // TASK-162 (AC-60): the order-status lock on its four roots.
  it("a block turning fo/no-direct-order-status-write off for scripts/**", async () => {
    const violations = await redFor(
      addBlock(
        '{ files: ["scripts/**"], rules: { "fo/no-direct-order-status-write": "off" } }',
      ),
    );
    expect(
      violations.some(
        (v) =>
          v.startsWith(
            "fo/no-direct-order-status-write: turned off by config object #",
          ) && v.includes('for ["scripts/**"]'),
      ),
    ).toBe(true);
    expect(violations).toContain(
      "fo/no-direct-order-status-write: off on scripts/db-migrate.ts; must be error on scripts/ (fo/no-direct-order-status-write)",
    );
  });

  it.each([
    [
      "scripts/",
      '      "scripts/**/*.ts",\n      "seed/**/*.ts",\n      "db/**/*.ts",\n      "*.ts",',
    ],
    ["seed/", '      "seed/**/*.ts",\n      "db/**/*.ts",\n      "*.ts",'],
    ["db/", '      "db/**/*.ts",\n      "*.ts",'],
  ])(
    "the order-status block's files narrowed to drop %s",
    async (root, from) => {
      const violations = await redFor({
        from,
        to: from.replace(`      "${root}**/*.ts",\n`, ""),
      });
      expect(
        violations.some(
          (v) =>
            v.startsWith(
              `fo/no-direct-order-status-write: not configured on ${root}`,
            ) &&
            v.endsWith(
              `must be error on ${root} (fo/no-direct-order-status-write)`,
            ),
        ),
      ).toBe(true);
    },
  );

  // TASK-160 (AC-56, AC-57): the options check. A later object's options replace an earlier
  // one's, so these edits leave every rule at `error` and still drop a list.
  it("a second block setting no-restricted-imports for src/** without the SDK list", async () => {
    const violations = await redFor(
      addBlock(
        '{ files: ["src/**"], rules: { "no-restricted-imports": ["error", { paths: ["lodash"] }] } }',
      ),
    );
    expect(violations).toContain(
      'no-restricted-imports: entry import "postgres" missing from the options for src/modules/geo/corridor.ts (AC-57\'s SDK locks)',
    );
    expect(violations).toContain(
      "no-restricted-imports: entry import node:console missing from the options for src/modules/geo/corridor.ts (no-console and AC-56's locks)",
    );
  });

  it("a second block setting no-restricted-syntax for src/** with one selector of its own", async () => {
    const violations = await redFor(
      addBlock(
        '{ files: ["src/**"], rules: { "no-restricted-syntax": ["error", "WithStatement"] } }',
      ),
    );
    expect(violations).toContain(
      'no-restricted-syntax: entry import() "stripe" missing from the options for src/modules/geo/corridor.ts (AC-57\'s SDK locks)',
    );
    expect(violations).toContain(
      'no-restricted-syntax: entry process["stdout"] missing from the options for src/modules/geo/corridor.ts (no-console and AC-56\'s locks)',
    );
  });

  // TASK-163 (AC-59): every other entry kept, only the cast ban dropped, and the rule still `error`.
  it("a second block setting no-restricted-syntax for src/** without the as Minor entry", async () => {
    const violations = await redFor(
      addBlock(
        '{ files: ["src/**"], rules: { "no-restricted-syntax": restrictedRules().find((c) => c.name === "fo/restricted/src").rules["no-restricted-syntax"].filter((e) => !String(e?.message).includes("AC-59")) } }',
      ),
    );
    expect(violations).toContain(
      "no-restricted-syntax: entry x as Minor missing from the options for src/modules/geo/corridor.ts (AC-59's as Minor ban)",
    );
    expect(violations).toContain(
      'no-restricted-syntax: entry x as number & z.$brand<"Minor"> missing from the options for src/lib/logger.ts (AC-59\'s as Minor ban)',
    );
    expect(
      violations.filter((v) => !v.endsWith("(AC-59's as Minor ban)")),
    ).toEqual([]);
  });

  it("a block turning no-restricted-syntax off for tests/**", async () => {
    const violations = await redFor(
      addBlock(
        '{ files: ["tests/**"], rules: { "no-restricted-syntax": "off" } }',
      ),
    );
    expect(
      violations.some(
        (v) =>
          v.startsWith("no-restricted-syntax: turned off by config object #") &&
          v.endsWith(
            'for ["tests/**"]; allowed off only in src/modules/catalog/pricing/money.ts (AC-59\'s as Minor ban)',
          ),
      ),
    ).toBe(true);
    expect(violations).toContain(
      "no-restricted-syntax: off on tests/unit/lint-coverage.test.ts; must be error on  (AC-59's as Minor ban)",
    );
  });

  it("a block turning no-restricted-imports off for scripts/**", async () => {
    const violations = await redFor(
      addBlock(
        '{ files: ["scripts/**"], rules: { "no-restricted-imports": "off" } }',
      ),
    );
    expect(
      violations.some(
        (v) =>
          v.startsWith(
            "no-restricted-imports: turned off by config object #",
          ) && v.endsWith("(AC-57's SDK locks)"),
      ),
    ).toBe(true);
    expect(violations).toContain(
      "no-restricted-imports: off on scripts/env-check.ts; must be error on  (AC-57's SDK locks)",
    );
  });

  it("a block turning no-restricted-globals off for src/modules/geo/**", async () => {
    const violations = await redFor(
      addBlock(
        '{ files: ["src/modules/geo/**"], rules: { "no-restricted-globals": "off" } }',
      ),
    );
    expect(violations).toContain(
      "no-restricted-globals: off on src/modules/geo/corridor.ts; must be error on src/ (no-console and AC-56's locks)",
    );
    expect(violations).toContain(
      "no-restricted-globals: entry console missing from the options for src/modules/geo/corridor.ts (no-console and AC-56's locks)",
    );
  });

  it("a block for an adapter's folder that sets no restricted-* rule leaves the lists whole", async () => {
    expect(
      await coverageViolations(
        scratchConfig(
          addBlock(
            '{ files: ["src/modules/payments/stripe/**"], rules: { "no-console": "error" } }',
          ),
        ),
      ),
    ).toEqual([]);
  });

  it("a lock turned down to warn is red too", async () => {
    const violations = await redFor(
      addBlock(
        '{ files: ["src/**/*.ts"], rules: { "fo/no-geo-redirect": "warn" } }',
      ),
    );
    expect(
      violations.some((v) =>
        v.startsWith("fo/no-geo-redirect: turned warn by config object #"),
      ),
    ).toBe(true);
  });

  it("an exception for a rule that is not ours, on one path, is allowed (AC-50)", async () => {
    expect(
      await coverageViolations(
        scratchConfig(
          addBlock(
            '{ name: "fo/exception/src/app/layout.tsx", files: ["src/app/layout.tsx"], rules: { "@next/next/no-img-element": "off" } }',
          ),
        ),
      ),
    ).toEqual([]);
  });

  // /review 113 round 1: ESLint 9 reads an object of only `name`, `basePath` and `ignores` as
  // global ignores, so `db/` drops out of `eslint .` without a `globalIgnores(...)` call.
  it("a basePath global-ignores object switching db/ off", async () => {
    const violations = await redFor(
      addBlock('{ basePath: "db", ignores: ["**"] }'),
    );
    expect(violations.some((v) => v.startsWith("globalIgnores: ["))).toBe(true);
    expect(
      violations.some(
        (v) =>
          v.startsWith("globalIgnores: db/") &&
          v.endsWith("is ignored, but none of today's patterns matches it"),
      ),
    ).toBe(true);
  });

  // /break 113 hole 2: a processor that yields no code blocks drops every message for its files
  // while the resolved config still reads `error`.
  it("a no-op processor block for src/modules/partners/**", async () => {
    const violations = await redFor(
      addBlock(
        '{ files: ["src/modules/partners/**"], processor: { preprocess: () => [], postprocess: () => [] } }',
      ),
    );
    expect(
      violations.some(
        (v) =>
          v.startsWith("processor: config object #") &&
          v.endsWith(
            'sets a processor for ["src/modules/partners/**"]; only PROCESSORS_TODAY may ([])',
          ),
      ),
    ).toBe(true);
  });
  // /break 113 round 2, hole 2: a parser that returns an empty Program leaves no node for any
  // rule to visit, and `language` can do the same, while the resolved config still reads `error`.
  it("a no-op parser block for src/modules/partners/**", async () => {
    const violations = await redFor(
      addBlock(
        '{ files: ["src/modules/partners/**"], languageOptions: { parser: { parseForESLint: (code) => ({ ast: { type: "Program", body: [], sourceType: "module", range: [0, code.length], loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }, tokens: [], comments: [] } }) } } }',
      ),
    );
    expect(
      violations.some(
        (v) =>
          v.startsWith(
            "parser: config objects setting languageOptions.parser are [",
          ) && v.includes('"#'),
      ),
    ).toBe(true);
  });

  it("a second object reusing the name next to set a parser", async () => {
    const violations = await redFor(
      addBlock(
        '{ name: "next", files: ["src/modules/partners/**"], languageOptions: { parser: { parse: () => ({ type: "Program", body: [], sourceType: "module", range: [0, 0], loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }, tokens: [], comments: [] }) } } }',
      ),
    );
    expect(
      violations.some((v) =>
        v.startsWith(
          "parser: config objects setting languageOptions.parser are [",
        ),
      ),
    ).toBe(true);
  });

  it("a language block for src/modules/partners/**", async () => {
    const violations = await redFor(
      addBlock('{ files: ["src/modules/partners/**"], language: "@/js" }'),
    );
    expect(
      violations.some((v) =>
        v.startsWith("language: config objects setting language are ["),
      ),
    ).toBe(true);
  });
});

/**
 * /break 113 hole 1: ESLint 9 looks for `eslint.config.js` before `eslint.config.mjs`, and
 * Stylelint's search finds `.stylelintrc*` (or a `stylelint` key in `package.json`) from each
 * CSS file's folder upward. Every other test here names the config file explicitly, so a sibling
 * config would replace the real one for `pnpm lint` and nothing else would notice.
 */
describe("the config files pnpm lint loads are the two that are tested", () => {
  const ESLINT_NAMES =
    /^(?:eslint\.config\.(?:js|mjs|cjs|ts|mts|cts)|\.eslintrc(?:\.(?:js|cjs|yaml|yml|json))?)$/;
  const STYLELINT_NAMES =
    /^(?:stylelint\.config\.(?:js|mjs|cjs|ts|mts|cts)|\.stylelintrc(?:\.(?:json|yaml|yml|js|mjs|cjs|ts|mts|cts))?)$/;
  const isConfigName = (path: string): boolean => {
    const base = path.slice(path.lastIndexOf("/") + 1);
    return ESLINT_NAMES.test(base) || STYLELINT_NAMES.test(base);
  };

  it("names each config file of ESLint and Stylelint in the patterns", () => {
    for (const name of [
      "eslint.config.js",
      "eslint.config.cjs",
      "eslint.config.ts",
      "eslint.config.mts",
      "eslint.config.cts",
      ".eslintrc",
      ".eslintrc.json",
      ".stylelintrc",
      ".stylelintrc.json",
      "stylelint.config.js",
      "stylelint.config.cjs",
      "stylelint.config.ts",
    ]) {
      expect(isConfigName(name), name).toBe(true);
    }
  });

  it("finds only eslint.config.mjs and stylelint.config.mjs, at the root and in the tree", () => {
    const atRoot = readdirSync(repoRoot).filter(isConfigName).sort();
    const tracked = execFileSync("git", ["ls-files"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter(isConfigName)
      .sort();
    expect(atRoot).toEqual(["eslint.config.mjs", "stylelint.config.mjs"]);
    expect(tracked).toEqual(["eslint.config.mjs", "stylelint.config.mjs"]);
  });

  it("keeps ESLint and Stylelint config out of package.json", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(pkg["eslintConfig"]).toBeUndefined();
    expect(pkg["stylelint"]).toBeUndefined();
  });

  it("is the file eslint . itself resolves", async () => {
    expect(await new ESLint({ cwd: repoRoot }).findConfigFile()).toBe(
      REAL_CONFIG,
    );
  });
});
