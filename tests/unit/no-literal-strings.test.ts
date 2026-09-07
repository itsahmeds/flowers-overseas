/**
 * T-06 (spec 001 AC-5, TASK-003): `fo/no-literal-strings` — literal JSX text, `aria-label` and
 * `alt` fixtures are invalid; `className`, `href`, `data-*` and letter-free text are valid.
 */
import { Linter, RuleTester } from "eslint";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import plugin from "../../eslint/fo/index.js";
import rule, {
  ALLOWED_ATTRIBUTES,
  isTextAttribute,
  isUserFacingText,
} from "../../eslint/fo/no-literal-strings.js";

const fixtureDir = resolve(__dirname, "../fixtures/lint");
const fixture = (name: string): string =>
  readFileSync(join(fixtureDir, name), "utf8");

const languageOptions = {
  ecmaVersion: 2022 as const,
  sourceType: "module" as const,
  parserOptions: { ecmaFeatures: { jsx: true } },
};

const ruleTester = new RuleTester({ languageOptions });

describe("fo/no-literal-strings fixtures (T-06)", () => {
  it("reports exactly one error per invalid fixture and none on the valid fixture", () => {
    expect(() => {
      ruleTester.run("no-literal-strings", rule, {
        valid: [{ code: fixture("literal-strings-valid.tsx") }],
        invalid: [
          { code: fixture("literal-string.tsx"), errors: 1 },
          { code: fixture("literal-aria.tsx"), errors: 1 },
          { code: fixture("literal-alt.tsx"), errors: 1 },
        ],
      });
    }).not.toThrow();
  });

  it("names the offending copy and attribute in the message", () => {
    const linter = new Linter();
    const config = {
      plugins: { fo: plugin },
      languageOptions,
      rules: { "fo/no-literal-strings": "error" as const },
    };

    const text = linter.verify(fixture("literal-string.tsx"), config);
    expect(text).toHaveLength(1);
    expect(text[0]?.message).toContain('"Send flowers"');

    const aria = linter.verify(fixture("literal-aria.tsx"), config);
    expect(aria).toHaveLength(1);
    expect(aria[0]?.message).toContain("aria-label");
    expect(aria[0]?.message).toContain('"Close"');
  });
});

describe("fo/no-literal-strings inline cases", () => {
  it("passes the RuleTester table", () => {
    expect(() => {
      ruleTester.run("no-literal-strings", rule, {
        valid: [
          // structural attributes (AC-5)
          {
            code: `const a = <a className="x" href="/" data-testid="y" id="z" />;`,
          },
          {
            code: `const a = <button type="button" rel="noreferrer" target="_blank" />;`,
          },
          { code: `const a = <img src="/a.jpg" alt={t("product.alt")} />;` },
          { code: `const a = <p>{t("home.title")}</p>;` },
          // punctuation-only / whitespace-only text
          { code: `const a = <span>·</span>;` },
          { code: `const a = (\n  <p>\n    {x}\n  </p>\n);` },
          { code: `const a = <span>{" "}</span>;` },
          // non-JSX code is never user-facing
          { code: `const key = "home.title";` },
          { code: `logger.info("order transitioned");` },
          { code: `const props = { label: "Close", alt: "Bouquet" };` },
          { code: `const a = <div aria-hidden="true" />;` },
        ],
        invalid: [
          { code: `const a = <p>Send flowers</p>;`, errors: 1 },
          { code: `const a = <p>{"Send flowers"}</p>;`, errors: 1 },
          { code: `const a = <><span>Wysyłamy kwiaty</span></>;`, errors: 1 },
          { code: `const a = <button aria-label="Close" />;`, errors: 1 },
          {
            code: `const a = <img src="/a.jpg" alt="A red rose bouquet" />;`,
            errors: 1,
          },
          {
            code: `const a = <input placeholder="Recipient name" />;`,
            errors: 1,
          },
          { code: `const a = <abbr title="Value added tax" />;`, errors: 1 },
          { code: `const a = <button aria-label={"Close"} />;`, errors: 1 },
          { code: `const a = <button aria-label={\`Close\`} />;`, errors: 1 },
          {
            code: `const a = <p>Send flowers <span>now</span></p>;`,
            errors: 2,
          },
        ],
      });
    }).not.toThrow();
  });

  it("classifies attributes and text", () => {
    expect(isTextAttribute("aria-label")).toBe(true);
    expect(isTextAttribute("alt")).toBe(true);
    expect(isTextAttribute("data-label")).toBe(false);
    for (const allowed of ALLOWED_ATTRIBUTES)
      expect(isTextAttribute(allowed)).toBe(false);
    expect(isUserFacingText("  \n ")).toBe(false);
    expect(isUserFacingText("— · /")).toBe(false);
    expect(isUserFacingText("Send flowers")).toBe(true);
  });
});
