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
 * **The table grows with the locks and never names one that is not built yet** (AC-52). It is
 * written as the config stands when TASK-158 merges. TASK-160 adds AC-56's locks to the
 * `no-console` row, `src/lib/step-summary.ts` to its "allowed off" cell, the AC-57 row and both
 * ACs' option entries; TASK-162 widens `fo/no-direct-order-status-write` to `scripts/`, `seed/`
 * and `db/`; TASK-163 adds the `as Minor` row. None of AC-56, AC-57 or AC-59's option entries
 * exists yet, so no "missing from the options" case is asserted here.
 *
 * T-56's red cases are scratch copies of `eslint.config.mjs` with one edit each, passed to ESLint
 * as `overrideConfigFile`. They live under `node_modules/.cache/`, which git, ESLint, Prettier and
 * the comment scan all skip, so the copy's bare imports (`eslint/config`, `eslint-config-next/…`)
 * resolve from the repository's own `node_modules`; its two relative imports and
 * `import.meta.dirname` are rewritten to absolute paths.
 */
import { ESLint, type Linter } from "eslint";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import fo from "../../eslint/fo/index.js";

const repoRoot = resolve(__dirname, "../..");
const REAL_CONFIG = resolve(repoRoot, "eslint.config.mjs");

/** One row of AC-52's table, as it stands when TASK-158 merges. */
interface LockRow {
  /** The row's name in AC-52's table. */
  readonly lock: string;
  readonly rules: readonly string[];
  /** Roots (a trailing `/`) on which every rule of the row must be `error`. */
  readonly errorOn: readonly string[];
  /** Exact file paths where the row may be off; everywhere else it may not. */
  readonly allowedOff: readonly string[];
}

const FO_RULES = Object.keys(fo.rules ?? {}).map((name) => `fo/${name}`);
const FLOAT_MONEY = "fo/no-float-money";
const ORDER_STATUS = "fo/no-direct-order-status-write";

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
    errorOn: ["src/"],
    allowedOff: [],
  },
  {
    lock: "no-console",
    rules: ["no-console"],
    errorOn: ["src/"],
    allowedOff: ["src/lib/logger.ts"],
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
  const globalIgnores = new Set<string>();
  for (const config of configs) {
    const keys = Object.keys(config).filter((key) => key !== "name");
    if (keys.length === 1 && keys[0] === "ignores") {
      for (const pattern of config.ignores ?? []) globalIgnores.add(pattern);
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
  configs.forEach((config, index) => {
    const label = config.name ?? `#${String(index)}`;
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

  for (const file of TRACKED) {
    const config = await configFor(file);
    if (config !== undefined && config.linterOptions?.noInlineConfig !== true) {
      violations.push(`noInlineConfig: not true for ${file} (AC-50)`);
    }
  }
  for (const row of TABLE) {
    for (const root of row.errorOn) {
      const files = TRACKED.filter((file) => file.startsWith(root));
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
        if (row.allowedOff.includes(file)) continue;
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
      "no-console: off on src/modules/geo/corridor.ts; must be error on src/ (no-console)",
    );
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
});
