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
import { describe, expect, it } from "vitest";

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
