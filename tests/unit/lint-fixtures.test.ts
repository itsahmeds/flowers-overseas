/**
 * AC-4 / AC-5 wiring (spec 001, TASK-003): the rules are not only correct in isolation, they are
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
