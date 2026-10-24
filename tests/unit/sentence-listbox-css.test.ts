/**
 * T-72 (unit half) / AC-66 and T-73 (unit half) / AC-67 (spec 004 §14 A-founder-2026-10-21d
 * clauses 9 and 10; TASK-326): the home sentence listbox's CSS in `src/app/globals.css`.
 *
 *  - Motion 10: a `@starting-style` rule for the open panel with `opacity: 0` and
 *    `transform: translateY(8px)` under `no-preference`; the open transition on `opacity, transform`
 *    over `--duration-base` on `--ease-standard`; the close over `--duration-fast`; the close fade
 *    itself outside every motion query; the panel's selector in the reduced-motion rule beside the
 *    language popup, opacity only, `--duration-fast`, with no transform in its start state.
 *  - No literal: every `border-radius`, `font-family`, `color`, `background` and
 *    `background-color` the new rules write is a token (`var(--…)`) or a keyword that is no
 *    value (`0`, `none`, `transparent`, `inherit`, `currentColor`). Red with a radius written as
 *    `6px` (the scan is run over that mutation below).
 *  - Only `opacity` and `transform` ever transition on these selectors (AC-44's rule).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  resolve(import.meta.dirname, "../../src/app/globals.css"),
  "utf8",
);

interface Rule {
  readonly context: readonly string[];
  readonly selector: string;
  readonly declarations: ReadonlyMap<string, string>;
}

/** Brace-matching walk over the source: at-rules and nested rules carry their prelude down. */
function walk(css: string): Rule[] {
  const text = css.replaceAll(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const visit = (body: string, context: readonly string[]): void => {
    let index = 0;
    while (index < body.length) {
      const open = body.indexOf("{", index);
      if (open === -1) return;
      const prelude = body
        .slice(index, open)
        .replace(/^[\s\S]*[;}]/, "")
        .trim()
        .replaceAll(/\s+/g, " ");
      let depth = 1;
      let cursor = open + 1;
      while (depth > 0 && cursor < body.length) {
        if (body[cursor] === "{") depth += 1;
        else if (body[cursor] === "}") depth -= 1;
        cursor += 1;
      }
      const inner = body.slice(open + 1, cursor - 1);
      if (prelude.startsWith("@") || inner.includes("{"))
        visit(inner, [...context, prelude]);
      else
        rules.push({ context, selector: prelude, declarations: parse(inner) });
      index = cursor;
    }
  };
  visit(text, []);
  return rules;
}

function parse(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const declaration of block.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    map.set(
      declaration.slice(0, colon).trim(),
      declaration
        .slice(colon + 1)
        .trim()
        .replaceAll(/\s+/g, " "),
    );
  }
  return map;
}

const OURS = /data-fo-sentence-(?:trigger|listbox)|data-fo-listbox/;
const PANEL_OPEN = "[data-fo-sentence-listbox]:popover-open";
const NO_PREFERENCE = (rule: Rule): boolean =>
  rule.context.some((at) =>
    at.includes("prefers-reduced-motion: no-preference"),
  );
const REDUCE = (rule: Rule): boolean =>
  rule.context.some((at) => at.includes("prefers-reduced-motion: reduce"));
const STARTING = (rule: Rule): boolean =>
  rule.context.some((at) => at.startsWith("@starting-style"));
const selectors = (rule: Rule): string[] =>
  rule.selector.split(",").map((part) => part.trim());

const rules = walk(CSS);
const ours = rules.filter((rule) => OURS.test(rule.selector));

/** The literal scan: the declarations AC-67 names, each a token or a keyword that is no value. */
const SCANNED = [
  "border-radius",
  "font-family",
  "color",
  "background",
  "background-color",
];
const NOT_A_VALUE = /^(?:0|none|transparent|inherit|currentColor)$/;
function literals(scanned: readonly Rule[]): string[] {
  return scanned.flatMap((rule) =>
    SCANNED.flatMap((property) => {
      const value = rule.declarations.get(property);
      return value === undefined ||
        /^var\(--[\w-]+\)$/.test(value) ||
        NOT_A_VALUE.test(value)
        ? []
        : [`${rule.selector} { ${property}: ${value} }`];
    }),
  );
}

describe("AC-66: motion 10 for the sentence listbox, in the stylesheet", () => {
  it("starts the open panel at opacity 0 and 8 px down, under no-preference only", () => {
    const start = rules.filter(
      (rule) =>
        STARTING(rule) &&
        NO_PREFERENCE(rule) &&
        selectors(rule).includes(PANEL_OPEN),
    );
    expect(start).toHaveLength(1);
    expect(start[0]?.declarations.get("opacity")).toBe("0");
    expect(start[0]?.declarations.get("transform")).toBe("translateY(8px)");
  });

  it("opens over --duration-base on --ease-standard, opacity and transform, and closes over --duration-fast", () => {
    const open = rules.find(
      (rule) =>
        !STARTING(rule) && NO_PREFERENCE(rule) && rule.selector === PANEL_OPEN,
    );
    expect(open?.declarations.get("transition-property")).toBe(
      "opacity, transform",
    );
    expect(open?.declarations.get("transition-duration")).toBe(
      "var(--duration-base)",
    );
    expect(open?.declarations.get("transition-timing-function")).toBe(
      "var(--ease-standard)",
    );
    const closing = rules.find(
      (rule) =>
        NO_PREFERENCE(rule) &&
        rule.selector === "[data-fo-sentence-listbox][data-fo-closing]",
    );
    expect(closing?.declarations.get("transition-duration")).toBe(
      "var(--duration-fast)",
    );
  });

  it("fades out under either preference: the closing opacity sits outside every motion query", () => {
    const fade = rules.filter(
      (rule) =>
        selectors(rule).includes(
          "[data-fo-sentence-listbox][data-fo-closing]",
        ) && rule.declarations.get("opacity") === "0",
    );
    expect(fade).toHaveLength(1);
    expect(NO_PREFERENCE(fade[0] as Rule) || REDUCE(fade[0] as Rule)).toBe(
      false,
    );
  });

  it("joins the reduced-motion rule beside the language popup: opacity only, 120 ms, nothing moves", () => {
    const reduced = rules.filter(
      (rule) =>
        REDUCE(rule) && !STARTING(rule) && selectors(rule).includes(PANEL_OPEN),
    );
    expect(reduced).toHaveLength(1);
    expect(selectors(reduced[0] as Rule)).toContain(
      "dialog[data-fo-language-popup][open]",
    );
    expect(reduced[0]?.declarations.get("transition-property")).toBe(
      "opacity !important",
    );
    expect(reduced[0]?.declarations.get("transition-duration")).toBe(
      "var(--duration-fast) !important",
    );
    const start = rules.filter(
      (rule) =>
        REDUCE(rule) && STARTING(rule) && selectors(rule).includes(PANEL_OPEN),
    );
    expect(start).toHaveLength(1);
    expect(start[0]?.declarations.get("opacity")).toBe("0");
    expect(start[0]?.declarations.has("transform")).toBe(false);
  });

  it("transitions nothing but opacity and transform on the listbox's selectors", () => {
    const listed = ours.flatMap((rule) =>
      (rule.declarations.get("transition-property") ?? "")
        .replace(" !important", "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    );
    expect(listed.length).toBeGreaterThan(0);
    expect(new Set(listed)).toEqual(new Set(["opacity", "transform"]));
    expect(ours.some((rule) => rule.declarations.has("transition"))).toBe(
      false,
    );
    expect(ours.some((rule) => rule.declarations.has("animation"))).toBe(false);
  });
});

describe("AC-67: no literal colour, background, radius or family in the new CSS", () => {
  it("finds the rules it scans: the trigger, the panel, the options, the hidden select", () => {
    for (const selector of [
      "[data-fo-sentence-trigger]",
      "[data-fo-sentence-listbox]",
      '[data-fo-sentence-listbox] [role="option"]',
      "[data-fo-pick][data-fo-listbox] > select",
    ]) {
      expect(
        ours.some((rule) => selectors(rule).includes(selector)),
        selector,
      ).toBe(true);
    }
  });

  it("writes every scanned value as a token", () => {
    expect(literals(ours)).toEqual([]);
  });

  it("goes red on a radius written as 6px, a hex colour and a named family", () => {
    const mutated = walk(
      CSS.replace("border-radius: var(--radius-letter);", "border-radius: 6px;")
        .replace(
          "color: var(--color-ink);\n    font-family",
          "color: #222;\n    font-family",
        )
        .replace(
          "font-size: var(--text-lg-s);",
          "font-size: var(--text-lg-s);\n    font-family: Georgia;",
        ),
    ).filter((rule) => OURS.test(rule.selector));
    expect(literals(mutated)).toEqual([
      "[data-fo-sentence-trigger] { font-family: Georgia }",
      "[data-fo-sentence-listbox] { border-radius: 6px }",
      "[data-fo-sentence-listbox] { color: #222 }",
    ]);
  });

  it("names the design system's panel tokens: surface card, letter radius, the popup's shadow, a 1 px border", () => {
    const panel = ours.find(
      (rule) => rule.selector === "[data-fo-sentence-listbox]",
    );
    expect(panel?.declarations.get("background")).toBe(
      "var(--color-surface-card)",
    );
    expect(panel?.declarations.get("border-radius")).toBe(
      "var(--radius-letter)",
    );
    expect(panel?.declarations.get("box-shadow")).toBe("var(--shadow-md)");
    expect(panel?.declarations.get("border")).toBe(
      "1px solid var(--color-border)",
    );
    expect(panel?.declarations.get("font-family")).toBe("var(--font-display)");
  });
});
