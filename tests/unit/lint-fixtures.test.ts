/**
 * AC-4 / AC-5 wiring (TASK-003) and AC-7 / AC-8 / AC-9 wiring (TASK-004): the rules are not only correct in isolation, they are
 * switched on by the real `eslint.config.mjs` and `stylelint.config.mjs`. Runs the ESLint and
 * Stylelint Node APIs with those configs over `tests/fixtures/lint/`, and asserts that the main
 * lint run (`eslint .`) still ignores the fixture directory.
 */
import { ESLint } from "eslint";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";

import { findLockedCommentsInSource } from "../../scripts/check-no-literal-disable";
import { lintFixtures } from "../../scripts/lint-fixtures";

const repoRoot = resolve(__dirname, "../..");

const report = await lintFixtures(repoRoot);
const rulesFor = (file: string): string[] =>
  [...report.eslint, ...report.stylelint]
    .filter((v) => v.file === `tests/fixtures/lint/${file}`)
    .map((v) => v.ruleId);

describe("pnpm lint:fixtures over the real configs", () => {
  it("flags every invalid fixture with the expected rule", () => {
    expect(rulesFor("physical-css.tsx")).toContain("fo/no-physical-css");
    expect(rulesFor("physical-css-variant.tsx")).toContain(
      "fo/no-physical-css",
    );
    expect(rulesFor("physical-css-helper.tsx")).toContain("fo/no-physical-css");
    expect(rulesFor("literal-string.tsx")).toContain("fo/no-literal-strings");
    expect(rulesFor("literal-aria.tsx")).toContain("fo/no-literal-strings");
    expect(rulesFor("literal-alt.tsx")).toContain("fo/no-literal-strings");
    // TASK-045 (spec 004 AC-1, T-02): the raw-colour pair, ESLint and Stylelint halves.
    expect(rulesFor("raw-color.tsx")).toEqual([
      "fo/no-raw-color",
      "fo/no-raw-color",
      "fo/no-raw-color",
      "fo/no-raw-color",
    ]);
    expect(rulesFor("raw-color.css")).toContain("color-no-hex");
    expect(rulesFor("raw-color.css")).toContain(
      "declaration-property-value-disallowed-list",
    );
    expect(rulesFor("physical.css")).toContain("property-disallowed-list");
    expect(rulesFor("physical.css")).toContain(
      "declaration-property-value-disallowed-list",
    );
    expect(rulesFor("order-status-drizzle.ts")).toEqual([
      "fo/no-direct-order-status-write",
    ]);
    expect(rulesFor("order-status-sql.ts")).toEqual([
      "fo/no-direct-order-status-write",
    ]);
    expect(rulesFor("geo-redirect-header.ts")).toEqual(["fo/no-geo-redirect"]);
    expect(rulesFor("geo-redirect-geo.ts")).toEqual(["fo/no-geo-redirect"]);
    expect(rulesFor("geo-redirect-middleware.ts")).toEqual([
      "fo/no-geo-redirect",
    ]);
    // TASK-032 (spec 003 AC-11): the same redirect in a Next 16 `proxy.ts`-named file.
    expect(rulesFor("geo-redirect-proxy.ts")).toEqual(["fo/no-geo-redirect"]);
    // TASK-032 (spec 003 AC-10): the import and the `createMiddleware(` call, two violations.
    expect(rulesFor("geo-redirect-nextintl-middleware.ts")).toEqual([
      "fo/no-geo-redirect",
      "fo/no-geo-redirect",
    ]);
    // TASK-037 (spec 003 AC-21): one ad-hoc-`Intl` violation each, outside the formatter module.
    for (const file of [
      "adhoc-intl-numberformat.ts",
      "adhoc-intl-tolocalestring.ts",
      "adhoc-intl-tolocaledatestring.ts",
      "adhoc-intl-tofixed.ts",
      "adhoc-intl-template-currency.ts",
    ]) {
      expect(rulesFor(file), file).toEqual(["fo/no-adhoc-intl"]);
    }
    expect(rulesFor("src/modules/orders/cross-module-import.ts")).toEqual([
      "import/no-restricted-paths",
    ]);
    expect(rulesFor("src/modules/orders/module-imports-app.ts")).toEqual([
      "import/no-restricted-paths",
    ]);
    // AC-12 (TASK-005): `no-console` outside `src/lib/logger.ts` and `scripts/`.
    expect(rulesFor("console.ts")).toEqual(["no-console"]);
  });

  it("leaves the logical and valid counterparts clean", () => {
    for (const file of [
      "logical-css.tsx",
      "logical-css-variant.tsx",
      "logical-css-helper.tsx",
      "logical.css",
    ]) {
      expect(rulesFor(file)).toEqual([]);
    }
    expect(rulesFor("literal-strings-valid.tsx")).toEqual([]);
    expect(rulesFor("raw-color-valid.tsx")).toEqual([]);
    expect(rulesFor("raw-color-valid.css")).toEqual([]);
    for (const file of [
      "order-status-valid.ts",
      "geo-redirect-valid.ts",
      "geo-redirect-valid-proxy.ts",
      "float-money-valid.ts",
      "console-valid.ts",
      "stubs.ts",
      "src/modules/orders/service/transition.ts",
      "src/modules/i18n/hints.ts",
      // TASK-037 (spec 003 AC-21): the identical code, inside the formatter module.
      "src/modules/i18n/format.ts",
      "src/modules/i18n/collate.ts",
      "src/modules/orders/module-imports-valid.ts",
    ]) {
      expect(rulesFor(file)).toEqual([]);
    }
  });

  /**
   * spec 005 AC-4 / T-02 (TASK-060): spec 001 shipped the rule "fixture only in 001; enforced on
   * real code from 005", and this is the assertion of the flip. One violation per shape the rule
   * detects, in fixture order: the decimal literal (`listPrice = 12.5`), the `number` annotation
   * (`deliveryFee: number`), `parseFloat(rawPrice)` and `amount.toFixed(2)`.
   */
  it("reports every shape of float money in float-money.ts (spec 005 AC-4)", () => {
    expect(rulesFor("float-money.ts")).toEqual([
      "fo/no-float-money",
      "fo/no-float-money",
      "fo/no-float-money",
      "fo/no-float-money",
    ]);
  });

  /**
   * T-54 (spec 001 §14 A20, AC-50 and AC-51; TASK-158): the audit's plant. Before A20 a bare
   * disable above `export const price = 1.5` gave exit 0 from every check
   * (`docs/framework/standards-audit-2026-09-28.md`). Now the comment is powerless
   * (`noInlineConfig`), ESLint says so in a warning, `--max-warnings 0` fails the run on that
   * warning even when the comment suppressed nothing, and the scan outside ESLint names it.
   */
  describe("T-54: the audit's plant goes red", () => {
    const plant = readFileSync(
      resolve(repoRoot, "tests/fixtures/lint/bare-disable.ts"),
      "utf8",
    );
    const noEffect = /has no effect because you have 'noInlineConfig'/;

    /** The `--max-warnings` threshold of `pnpm lint:js`; `undefined` when there is none. */
    const lintJsMaxWarnings = (): number | undefined => {
      const pkg = JSON.parse(
        readFileSync(resolve(repoRoot, "package.json"), "utf8"),
      ) as { scripts: Record<string, string> };
      const match = /--max-warnings[= ](\d+)\b/.exec(
        pkg.scripts["lint:js"] ?? "",
      );
      return match?.[1] === undefined ? undefined : Number(match[1]);
    };
    /** Whether `pnpm lint:js` exits non-zero on this result: an error, or too many warnings. */
    const lintJsFails = (result: ESLint.LintResult): boolean => {
      const max = lintJsMaxWarnings();
      return (
        result.errorCount > 0 ||
        (max !== undefined && result.warningCount > max)
      );
    };
    const brief = (result: ESLint.LintResult | undefined) =>
      (result?.messages ?? []).map((message) => ({
        ruleId: message.ruleId,
        line: message.line,
        severity: message.severity,
        noEffect: noEffect.test(message.message),
      }));
    const realConfig = (): ESLint =>
      new ESLint({
        cwd: repoRoot,
        overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
      });

    it("is the audit's two lines, byte for byte", () => {
      expect(plant).toBe("/* eslint-disable */\nexport const price = 1.5;\n");
    });

    it("lint:fixtures reports fo/no-float-money on line 2 and the no-effect warning on line 1", async () => {
      expect(rulesFor("bare-disable.ts")).toContain("fo/no-float-money");
      const eslint = new ESLint({
        cwd: repoRoot,
        ignore: false,
        overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
      });
      const [result] = await eslint.lintFiles([
        "tests/fixtures/lint/bare-disable.ts",
      ]);
      expect(brief(result)).toEqual([
        { ruleId: null, line: 1, severity: 1, noEffect: true },
        { ruleId: "fo/no-float-money", line: 2, severity: 2, noEffect: false },
      ]);
    });

    it("the scan outside ESLint reports a bare disable on line 1", () => {
      expect(
        findLockedCommentsInSource(
          "tests/fixtures/lint/bare-disable.ts",
          plant,
        ),
      ).toEqual([
        {
          file: "tests/fixtures/lint/bare-disable.ts",
          line: 1,
          text: "/* eslint-disable */",
          reason: "bare-directive",
        },
      ]);
    });

    it("fails pnpm lint:js when planted in src/modules/geo/", async () => {
      const [result] = await realConfig().lintText(plant, {
        filePath: resolve(repoRoot, "src/modules/geo/plant.ts"),
      });
      expect(brief(result)).toEqual([
        { ruleId: null, line: 1, severity: 1, noEffect: true },
        { ruleId: "fo/no-float-money", line: 2, severity: 2, noEffect: false },
      ]);
      expect(result !== undefined && lintJsFails(result)).toBe(true);
    });

    it("fails pnpm lint:js on a bare disable that suppresses nothing (--max-warnings 0)", async () => {
      const [result] = await realConfig().lintText(
        "/* eslint-disable */\nexport const a = 1;\n",
        { filePath: resolve(repoRoot, "src/modules/geo/plant.ts") },
      );
      expect(brief(result)).toEqual([
        { ruleId: null, line: 1, severity: 1, noEffect: true },
      ]);
      expect(lintJsMaxWarnings()).toBe(0);
      expect(result !== undefined && lintJsFails(result)).toBe(true);
    });

    it("leaves a named disable of a rule that is not ours powerless too (AC-50)", async () => {
      const [result] = await realConfig().lintText(
        [
          "/* eslint no-console: off */",
          "export function f(x: string): void {",
          "  // eslint-disable-next-line no-console",
          "  console.log(x);",
          "}",
          "",
        ].join("\n"),
        { filePath: resolve(repoRoot, "src/modules/geo/plant.ts") },
      );
      expect(brief(result)).toEqual([
        { ruleId: null, line: 1, severity: 1, noEffect: true },
        { ruleId: null, line: 3, severity: 1, noEffect: true },
        // AC-56 (TASK-160): `console` is a restricted global in `src/`, so the reference that
        // `no-console` reports as a call is reported as a use of the global too.
        {
          ruleId: "no-restricted-globals",
          line: 4,
          severity: 2,
          noEffect: false,
        },
        { ruleId: "no-console", line: 4, severity: 2, noEffect: false },
      ]);
    });

    it("leaves /* stylelint-disable */ powerless in CSS (§13 Q18, ignoreDisables)", async () => {
      const result = await stylelint.lint({
        code: "/* stylelint-disable */\na { margin-left: 0; }\n",
        codeFilename: resolve(repoRoot, "src/app/plant.css"),
        configFile: resolve(repoRoot, "stylelint.config.mjs"),
      });
      expect(
        result.results.flatMap((entry) =>
          entry.warnings.map((warning) => warning.rule),
        ),
      ).toEqual(["property-disallowed-list"]);
    });
  });

  /**
   * T-60 (spec 001 §14 A20, AC-56; TASK-160): no way to write output that skips the logger. Each
   * line of `side-doors.ts` is one side door, at a `src/modules/geo/` mirror path; the same bytes
   * at the `src/lib/logger.ts` and `src/lib/step-summary.ts` mirror paths are clean.
   */
  describe("T-60: the logger's side doors are locked in src/", () => {
    const fixtureLint = (): ESLint =>
      new ESLint({
        cwd: repoRoot,
        ignore: false,
        overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
      });
    const lines = async (file: string): Promise<string[]> => {
      const [result] = await fixtureLint().lintFiles([
        `tests/fixtures/lint/${file}`,
      ]);
      return (result?.messages ?? []).map(
        (message) => `${String(message.line)}:${message.ruleId ?? "(fatal)"}`,
      );
    };

    it("reports each side door on its own line", async () => {
      expect(await lines("src/modules/geo/side-doors.ts")).toEqual([
        // import { stdout } from "node:process"
        "2:no-restricted-imports",
        // import { Console } from "node:console"
        "3:no-restricted-imports",
        // globalThis.console.log(x)
        "5:no-restricted-properties",
        // window.console.log(x)
        "6:no-restricted-properties",
        // const c = console; c.log(x)
        "7:no-restricted-globals",
        // const { log } = console
        "9:no-restricted-globals",
        // process.stdout.write(x)
        "11:no-restricted-properties",
        // process["stderr"].write(x): the property rule reads the static name, the syntax rule
        // the computed one
        "12:no-restricted-properties",
        "12:no-restricted-syntax",
      ]);
    });

    it("leaves the same bytes clean at the logger and step-summary mirror paths", async () => {
      const text = readFileSync(
        resolve(repoRoot, "tests/fixtures/lint/src/modules/geo/side-doors.ts"),
        "utf8",
      );
      for (const file of ["src/lib/logger.ts", "src/lib/step-summary.ts"]) {
        expect(
          readFileSync(
            resolve(repoRoot, `tests/fixtures/lint/${file}`),
            "utf8",
          ),
          file,
        ).toBe(text);
        expect(await lines(file), file).toEqual([]);
        expect(rulesFor(file), file).toEqual([]);
      }
    });

    it("says where to write instead", async () => {
      const [result] = await fixtureLint().lintFiles([
        "tests/fixtures/lint/src/modules/geo/side-doors.ts",
      ]);
      for (const message of result?.messages ?? []) {
        expect(message.message).toContain("src/lib/logger.ts");
      }
    });

    it("has no step-summary writer left in the catalogue modules", () => {
      for (const file of [
        "src/modules/catalog/listing.ts",
        "src/modules/catalog/product.ts",
      ]) {
        expect(readFileSync(resolve(repoRoot, file), "utf8"), file).not.toMatch(
          /process\.std(?:out|err)/,
        );
      }
    });
  });

  /**
   * T-61 (spec 001 §14 A20, AC-57; TASK-160): SDKs only in their adapters. The audit's plant and
   * the other import forms go red in the `src/modules/geo/` mirror, naming the adapter; the same
   * package's lines at each adapter mirror path, and every package in the `tests/` mirror, are
   * clean.
   */
  describe("T-61: SDKs only in their adapters", () => {
    const fixtureLint = (): ESLint =>
      new ESLint({
        cwd: repoRoot,
        ignore: false,
        overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
      });
    const messages = async (file: string) => {
      const [result] = await fixtureLint().lintFiles([
        `tests/fixtures/lint/${file}`,
      ]);
      return (result?.messages ?? []).map((message) => ({
        line: message.line,
        ruleId: message.ruleId,
        message: message.message,
      }));
    };

    it("reports the audit's plant twice, each naming the adapter", async () => {
      const found = await messages("src/modules/geo/sdk-imports.ts");
      expect(found.map((m) => `${String(m.line)}:${m.ruleId ?? ""}`)).toEqual([
        "1:no-restricted-imports",
        "2:no-restricted-imports",
      ]);
      expect(found[0]?.message).toContain("use src/lib/sentry.ts");
      expect(found[1]?.message).toContain("use src/lib/db.ts");
    });

    it("reports import(), require(), export * and import type, installed or not", async () => {
      const found = await messages("src/modules/geo/sdk-other-forms.ts");
      expect(found.map((m) => `${String(m.line)}:${m.ruleId ?? ""}`)).toEqual([
        // await import("postgres")
        "1:no-restricted-syntax",
        // require("stripe"): Next's own rule reports the require as well
        "2:@typescript-eslint/no-require-imports",
        "2:no-restricted-syntax",
        // export * from "resend"
        "3:no-restricted-imports",
        // import type { X } from "@mollie/api-client"
        "4:no-restricted-imports",
        // import("drizzle-orm/postgres-js") (§13 Q22)
        "6:no-restricted-syntax",
      ]);
      const restricted = found.filter((m) =>
        m.ruleId?.startsWith("no-restricted-"),
      );
      expect(
        restricted.map((m) => /use (\S+) \(spec/.exec(m.message)?.[1]),
      ).toEqual([
        "src/lib/db.ts",
        "src/modules/payments/stripe/",
        "src/modules/notifications/resend/",
        "src/modules/payments/mollie/",
        "src/lib/db.ts",
      ]);
    });

    it("leaves each adapter's own package clean at its mirror path, and every package in tests/", async () => {
      for (const file of [
        "src/lib/sentry.ts",
        "sentry.server.config.ts",
        "sentry.edge.config.ts",
        "instrumentation.ts",
        "instrumentation-client.ts",
        "next.config.ts",
        "src/lib/db.ts",
        "scripts/db-migrate.ts",
        "src/modules/payments/stripe/client.ts",
        "src/modules/payments/mollie/client.ts",
        "src/modules/notifications/resend/client.ts",
        "tests/unit/adapters.test.ts",
      ]) {
        expect(await messages(file), file).toEqual([]);
        expect(rulesFor(file), file).toEqual([]);
      }
    });

    it("still reports a require() at an adapter path only through Next's own rule", async () => {
      const [result] = await fixtureLint().lintText(
        'export const stripe = require("stripe");\n',
        {
          filePath: resolve(
            repoRoot,
            "tests/fixtures/lint/src/modules/payments/stripe/require.ts",
          ),
        },
      );
      expect((result?.messages ?? []).map((m) => m.ruleId)).toEqual([
        "@typescript-eslint/no-require-imports",
      ]);
    });

    it("leaves pnpm lint on the real tree clean of every no-restricted-* rule", async () => {
      const results = await new ESLint({
        cwd: repoRoot,
        overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
      }).lintFiles(["."]);
      const restricted = results.flatMap((result) =>
        result.messages
          .filter((m) => m.ruleId?.startsWith("no-restricted-") === true)
          .map((m) => `${result.filePath}:${String(m.line)}:${m.ruleId ?? ""}`),
      );
      expect(restricted).toEqual([]);
    }, 120_000);
  });

  it("keeps the fixture directory out of the main lint run", async () => {
    const eslint = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
    });
    for (const file of [
      "tests/fixtures/lint/physical-css.tsx",
      "tests/fixtures/lint/x.tsx",
    ]) {
      expect(await eslint.isPathIgnored(file)).toBe(true);
    }
    expect(await eslint.isPathIgnored("src/app/page.tsx")).toBe(false);
  });

  /**
   * spec 005 AC-4's wiring clause, all four roots (TASK-060). The rule is enabled for `src/`,
   * `src/config/`, `seed/` and `scripts/`; a rule that quietly stopped covering one of them —
   * `seed/`, say, where spec 002's importer will restate prices — would still read as "enabled"
   * from the config file alone, so each root is calculated separately. `calculateConfigForFile`
   * answers for a path that does not exist yet, which is how the dataset and the seed importer
   * are covered before they are written.
   */
  it("enables fo/no-float-money on all four roots of spec 005 AC-4", async () => {
    const eslint = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
    });
    for (const file of [
      "src/modules/catalog/pricing/resolve.ts",
      "src/config/catalogue/prices.data.ts",
      "seed/catalogue/import-prices.ts",
      "scripts/catalogue-check.ts",
    ]) {
      const config = await eslint.calculateConfigForFile(
        resolve(repoRoot, file),
      );
      expect(config.rules?.["fo/no-float-money"]?.[0], file).toBe(2);
    }
  });

  it("keeps the other fo rules on src/** where spec 001 put them", async () => {
    const eslint = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
    });
    const config = await eslint.calculateConfigForFile(
      resolve(repoRoot, "src/modules/catalog/pricing/resolve.ts"),
    );
    expect(config.rules?.["fo/no-direct-order-status-write"]?.[0]).toBe(2);
    expect(config.rules?.["fo/no-geo-redirect"]?.[0]).toBe(2);
    expect(config.rules?.["fo/no-adhoc-intl"]?.[0]).toBe(2);
    expect(config.rules?.["fo/no-raw-color"]?.[0]).toBe(2);
  });

  /**
   * The rule fires on real application code, not only on a fixture (spec 005 AC-4's "`pnpm lint`
   * fails on … and passes on `amountMinor: 4590`"), and — the clause that makes the flip
   * irreversible in practice — **no `eslint-disable` for it exists anywhere in the repository**.
   * Money that cannot be expressed in integer minor units is a spec question, not a suppression.
   */
  it("fires on float money in src/** and passes on integer minor units", async () => {
    const eslint = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
    });
    const [invalid] = await eslint.lintText(
      [
        "export const total = 45.9;",
        "export function quote(price: string): number { return parseFloat(price); }",
        "export const shown = total.toFixed(2);",
      ].join("\n"),
      { filePath: resolve(repoRoot, "src/modules/catalog/probe.ts") },
    );
    expect(
      (invalid?.messages ?? []).filter(
        (message) => message.ruleId === "fo/no-float-money",
      ),
    ).toHaveLength(3);

    const [valid] = await eslint.lintText(
      'export const price = { amountMinor: 4590, currency: "EUR" } as const;',
      { filePath: resolve(repoRoot, "src/modules/catalog/probe.ts") },
    );
    expect(
      (valid?.messages ?? []).map((message) => message.ruleId),
    ).not.toContain("fo/no-float-money");
  });

  it("carries no lint suppression for the money rule anywhere (spec 005 AC-4)", () => {
    const tracked = execFileSync("git", ["ls-files"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter((file) => /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file));
    expect(tracked.length).toBeGreaterThan(0);

    // Assembled from parts so that this assertion is not its own only offender.
    const disablePattern = new RegExp(
      ["eslint", "-", "disable[^\\n]*no-float-money"].join(""),
    );
    const offenders = tracked.filter((file) =>
      disablePattern.test(readFileSync(resolve(repoRoot, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("makes no-console an error in src/** but not in src/lib/logger.ts (AC-12)", async () => {
    const eslint = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
    });
    const appConfig = await eslint.calculateConfigForFile(
      resolve(repoRoot, "src/modules/orders/service/transition.ts"),
    );
    expect(appConfig.rules?.["no-console"]?.[0]).toBe(2);
    const loggerConfig = await eslint.calculateConfigForFile(
      resolve(repoRoot, "src/lib/logger.ts"),
    );
    expect(loggerConfig.rules?.["no-console"]?.[0]).toBe(0);
    const scriptConfig = await eslint.calculateConfigForFile(
      resolve(repoRoot, "scripts/env-check.ts"),
    );
    expect(scriptConfig.rules?.["no-console"]).toBeUndefined();
  });

  it("applies the fo rules to src/**/*.tsx", async () => {
    const eslint = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
    });
    const [result] = await eslint.lintText(
      'export default function Page() {\n  return <div className="ml-4">Send flowers</div>;\n}\n',
      { filePath: resolve(repoRoot, "src/app/probe.tsx") },
    );
    const ruleIds = (result?.messages ?? []).map((m) => m.ruleId);
    expect(ruleIds).toContain("fo/no-physical-css");
    expect(ruleIds).toContain("fo/no-literal-strings");
  });
});
