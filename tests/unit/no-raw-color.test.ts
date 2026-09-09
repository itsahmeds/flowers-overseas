/**
 * T-02 / AC-1 (TASK-045): `fo/no-raw-color` over its fixture pair and over the shapes the spec
 * names — `bg-[#ff0000]`, `text-[rgb(…)]`, `border-[hsl(…)]`, `shadow-[…rgba…]`, a hex inside
 * `clsx`, and the token utilities that must stay clean.
 *
 * The rule is syntactic and scoped, like `fo/no-physical-css`: `className`/`class` values, class
 * helpers and `style` object values. That boundary is the point — a regex in
 * `src/modules/ui/tokens/contrast.ts` parses `oklch(…)` and must remain lintable, because parsing
 * a colour is not painting with one.
 */
import { RuleTester } from "eslint";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import plugin from "../../eslint/fo/index.js";
import rule, {
  findArbitraryColourUtility,
  findRawColour,
  findRawColoursInClassValue,
} from "../../eslint/fo/no-raw-color.js";
import { tsLanguageOptions } from "./support/ts-parser";

const fixtureDir = resolve(__dirname, "../fixtures/lint");
const fixture = (name: string): string =>
  readFileSync(join(fixtureDir, name), "utf8");

const ruleTester = new RuleTester({ languageOptions: tsLanguageOptions });

describe("fo/no-raw-color", () => {
  it("flags the four arbitrary-value shapes and the two literal shapes", () => {
    ruleTester.run("no-raw-color", rule, {
      valid: [
        { code: fixture("raw-color-valid.tsx"), filename: "src/app/probe.tsx" },
        // Token utilities, with variants and negatives.
        {
          code: 'export const a = <div className="bg-accent hover:bg-accent-strong md:text-ink-muted" />;',
          filename: "src/app/probe.tsx",
        },
        // `var()` in the one legitimate inline case.
        {
          code: 'export const a = <div style={{ color: "var(--color-ink)" }} />;',
          filename: "src/app/probe.tsx",
        },
        // Not a class attribute, not a style value: parsing a colour is not painting with one.
        {
          code: 'export const OKLCH = /^oklch\\(([\\d.]+)%\\)$/; export const hex = "#26282f";',
          filename: "src/modules/ui/tokens/contrast.ts",
        },
        // A non-colour arbitrary value must not be swept up.
        {
          code: 'export const a = <div className="min-h-[50px] px-[26px] aspect-[3/2]" />;',
          filename: "src/app/probe.tsx",
        },
      ],
      invalid: [
        {
          code: 'export const a = <div className="bg-[#ff0000]" />;',
          filename: "src/app/probe.tsx",
          errors: [{ messageId: "rawColour" }],
        },
        {
          code: 'export const a = <div className="text-[rgb(0,0,0)]" />;',
          filename: "src/app/probe.tsx",
          errors: [{ messageId: "rawColour" }],
        },
        {
          code: 'export const a = <div className="border-[hsl(210_10%_50%)]" />;',
          filename: "src/app/probe.tsx",
          errors: [{ messageId: "rawColour" }],
        },
        {
          code: 'export const a = <div className="shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />;',
          filename: "src/app/probe.tsx",
          errors: [{ messageId: "rawColour" }],
        },
        {
          code: 'export const a = <div className={clsx("p-4", "text-[oklch(42%_0.1_155)]")} />;',
          filename: "src/app/probe.tsx",
          errors: [{ messageId: "rawColour" }],
        },
        {
          code: 'export const a = <div style={{ color: "#0a0a0a" }} />;',
          filename: "src/app/probe.tsx",
          errors: [{ messageId: "rawColour" }],
        },
        {
          code: 'export const a = <div style={{ background: "linear-gradient(160deg, oklch(93% 0.02 120), #fff)" }} />;',
          filename: "src/app/probe.tsx",
          errors: [{ messageId: "rawColour" }],
        },
      ],
    });
  });

  it("names the offending token and the token alternative in the message", () => {
    const messages = rule.meta?.messages ?? {};
    expect(messages["rawColour"]).toContain("globals.css");
    expect(messages["rawColour"]).toContain("bg-accent");
  });

  it("recognises every colour notation, and nothing else", () => {
    for (const value of [
      "#fff",
      "#26282f",
      "#26282fcc",
      "rgb(0 0 0)",
      "rgba(0,0,0,.2)",
      "hsl(210 10% 50%)",
      "oklch(42% 0.1 155)",
      "color-mix(in oklab, #fff, #000)",
    ]) {
      expect(findRawColour(value), value).not.toBeNull();
    }
    for (const value of [
      "bg-accent",
      "min-h-[50px]",
      "aspect-[3/2]",
      "var(--color-ink)",
      "translate-x-[3px]",
    ]) {
      expect(findRawColour(value), value).toBeNull();
    }
  });

  it("only treats colour-bearing utility prefixes as arbitrary colour values", () => {
    expect(findArbitraryColourUtility("bg-[#fff]")).toBe("bg-[#fff]");
    expect(findArbitraryColourUtility("md:hover:text-[rgb(0,0,0)]")).toBe(
      "md:hover:text-[rgb(0,0,0)]",
    );
    expect(findArbitraryColourUtility("min-h-[50px]")).toBeNull();
    expect(findArbitraryColourUtility("bg-accent")).toBeNull();
  });

  it("reports each offending token in a multi-utility string", () => {
    expect(
      findRawColoursInClassValue("p-4 bg-[#ff0000] text-[rgb(0,0,0)] gap-md"),
    ).toEqual(["bg-[#ff0000]", "text-[rgb(0,0,0)]"]);
  });

  it("is registered on the fo plugin", () => {
    expect(plugin.rules?.["no-raw-color"]).toBe(rule);
  });
});
