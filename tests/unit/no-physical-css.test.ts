/**
 * T-04 (spec 001 AC-4, TASK-003): `fo/no-physical-css` over the fixture pairs — each invalid
 * fixture reports exactly one error, each logical counterpart none — plus the token-level table
 * (variants, negatives, `!important`, the logical utilities that must never be flagged).
 */
import { Linter, RuleTester } from "eslint";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import rule, {
  findPhysicalUtilities,
} from "../../eslint/fo/no-physical-css.js";
import plugin from "../../eslint/fo/index.js";

const fixtureDir = resolve(__dirname, "../fixtures/lint");
const fixture = (name: string): string =>
  readFileSync(join(fixtureDir, name), "utf8");

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe("fo/no-physical-css fixtures (T-04)", () => {
  it("reports exactly one error per invalid fixture and none on the logical counterparts", () => {
    expect(() => {
      ruleTester.run("no-physical-css", rule, {
        valid: [
          { code: fixture("logical-css.tsx") },
          { code: fixture("logical-css-variant.tsx") },
          { code: fixture("logical-css-helper.tsx") },
        ],
        invalid: [
          { code: fixture("physical-css.tsx"), errors: 1 },
          { code: fixture("physical-css-variant.tsx"), errors: 1 },
          // one report per class string: the `cn()` fixture has two of them
          { code: fixture("physical-css-helper.tsx"), errors: 2 },
        ],
      });
    }).not.toThrow();
  });

  it("names the offending token and its logical replacement in the message", () => {
    const linter = new Linter();
    const messages = linter.verify(fixture("physical-css.tsx"), {
      plugins: { fo: plugin },
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      rules: { "fo/no-physical-css": "error" },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe("fo/no-physical-css");
    expect(messages[0]?.message).toContain('"ml-4" -> "ms-4"');
    expect(messages[0]?.message).toContain('"text-left" -> "text-start"');
  });

  it("maps every physical token in a class string to its logical suggestion", () => {
    expect(findPhysicalUtilities("ml-4 text-left")).toEqual([
      { token: "ml-4", suggestion: "ms-4" },
      { token: "text-left", suggestion: "text-start" },
    ]);
    expect(findPhysicalUtilities("md:-mr-2")).toEqual([
      { token: "md:-mr-2", suggestion: "-me-2" },
    ]);
    expect(findPhysicalUtilities("ms-4 text-start md:-me-2")).toEqual([]);
  });
});

describe("fo/no-physical-css inline cases", () => {
  it("passes the RuleTester table", () => {
    expect(() => {
      ruleTester.run("no-physical-css", rule, {
        valid: [
          { code: `const a = <div className="ms-4 me-2 ps-1 pe-1" />;` },
          {
            code: `const a = <div className="start-0 end-0 text-start text-end" />;`,
          },
          {
            code: `const a = <div className="rounded-s-lg border-s-2 scroll-ms-4" />;`,
          },
          { code: `const a = <div className={\`ms-4 \${x}\`} />;` },
          { code: `const a = <div className="md:-me-2 hover:ps-2" />;` },
          // not JSX class strings at all
          { code: `const query = "SELECT left(name, 2) FROM t";` },
          { code: `const a = <div data-testid="ml-4" />;` },
          // near-misses that only look physical
          {
            code: `const a = <div className="place-items-center border-lime-500 prose" />;`,
          },
        ],
        invalid: [
          { code: `const a = <div className="ml-4" />;`, errors: 1 },
          { code: `const a = <div className="md:-mr-2" />;`, errors: 1 },
          { code: `const a = <div className="pl-2 pr-2" />;`, errors: 1 },
          { code: `const a = <div className="left-0" />;`, errors: 1 },
          { code: `const a = <div className="right-0" />;`, errors: 1 },
          { code: `const a = <div className="text-left" />;`, errors: 1 },
          { code: `const a = <div className="text-right" />;`, errors: 1 },
          { code: `const a = <div className="rounded-l-md" />;`, errors: 1 },
          { code: `const a = <div className="rounded-tr-md" />;`, errors: 1 },
          { code: `const a = <div className="border-r-2" />;`, errors: 1 },
          { code: `const a = <div className="scroll-pl-4" />;`, errors: 1 },
          { code: `const a = <div className="inset-x-0" />;`, errors: 1 },
          { code: `const a = <div className="!mr-2" />;`, errors: 1 },
          { code: `const a = <div className={\`ml-4 \${x}\`} />;`, errors: 1 },
          { code: `const a = <div className={clsx("mr-2")} />;`, errors: 1 },
          { code: `const a = <div className={cn(["pl-2"])} />;`, errors: 1 },
          {
            code: `const a = <div className={cva({ "text-left": true })} />;`,
            errors: 1,
          },
          {
            code: `const a = <div className={cn(x ? "ml-1" : "ms-1")} />;`,
            errors: 1,
          },
          { code: `const a = <div class="ml-4" />;`, errors: 1 },
        ],
      });
    }).not.toThrow();
  });
});

describe("plugin surface", () => {
  it("exports the fo rules under the fo namespace", () => {
    // TASK-003 added the first two, TASK-004 the last three.
    expect(Object.keys(plugin.rules ?? {}).sort()).toEqual([
      "no-direct-order-status-write",
      "no-float-money",
      "no-geo-redirect",
      "no-literal-strings",
      "no-physical-css",
    ]);
  });
});
