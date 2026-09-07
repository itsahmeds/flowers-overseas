/**
 * AC-4 / AC-5 wiring (TASK-003) and AC-7 / AC-8 / AC-9 wiring (TASK-004): the rules are not only correct in isolation, they are
 * switched on by the real `eslint.config.mjs` and `stylelint.config.mjs`. Runs the ESLint and
 * Stylelint Node APIs with those configs over `tests/fixtures/lint/`, and asserts that the main
 * lint run (`eslint .`) still ignores the fixture directory.
 */
import { ESLint } from "eslint";
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
    expect(rulesFor("src/modules/orders/cross-module-import.ts")).toEqual([
      "import/no-restricted-paths",
    ]);
    expect(rulesFor("src/modules/orders/module-imports-app.ts")).toEqual([
      "import/no-restricted-paths",
    ]);
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
    for (const file of [
      "order-status-valid.ts",
      "geo-redirect-valid.ts",
      "float-money-valid.ts",
      "stubs.ts",
      "src/modules/orders/service/transition.ts",
      "src/modules/i18n/hints.ts",
      "src/modules/orders/module-imports-valid.ts",
    ]) {
      expect(rulesFor(file)).toEqual([]);
    }
  });

  it("leaves float-money.ts unreported: the rule ships disabled until spec 005", () => {
    // spec 001 §2: "Lint fixture only in 001; enforced on real code from 005".
    expect(rulesFor("float-money.ts")).toEqual([]);
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

  it("does not enable fo/no-float-money on src/** yet (spec 005 flips it on)", async () => {
    const eslint = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: resolve(repoRoot, "eslint.config.mjs"),
    });
    const config = await eslint.calculateConfigForFile(
      resolve(repoRoot, "src/modules/catalog/pricing.ts"),
    );
    expect(config.rules?.["fo/no-float-money"]).toBeUndefined();
    expect(config.rules?.["fo/no-direct-order-status-write"]?.[0]).toBe(2);
    expect(config.rules?.["fo/no-geo-redirect"]?.[0]).toBe(2);
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
