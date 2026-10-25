/**
 * T-3 (and AC-4's CSS half) for spec 042's ideas, read from the **shipped** stylesheet
 * (`compileScannedCss`, the same scan `next build` runs; beside `motion-css.test.ts`, which already
 * holds every keyframe and transition in the file to `transform`, `opacity` and a keyframed
 * `stroke-dashoffset`). The first idea to land creates this file; each later idea adds its block.
 *
 * Idea 2, the card preview (§5.3.2, AC-3, AC-4, AC-10; TASK-308). `cardPreviewViolations` names
 * each clause it cannot find where motion 15 puts it; the shipped CSS gives none, and each
 * mutation T-3 and T-10 list gives the one it breaks:
 *
 *  - at rest, the sample and the words share one cell and only their `opacity` differs: the words
 *    line is transparent while the sample shows, and the sample once it is `aria-hidden="true"`;
 *  - the card re-declares the theme's `--font-hand` stack, so its words resolve to the Caveat
 *    faces whose variables sit on the card (at `:root` they fall through to local fallbacks);
 *  - the hand-over is a transition of `opacity` only, `--duration-base` on `--ease-standard`, on
 *    the children of a `data-fo-card-swap` cell only, and only under
 *    `prefers-reduced-motion: no-preference`; no keyframes, no raw time, nothing under `reduce`.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

import { compileScannedCss } from "./support/tailwind.ts";

const repoRoot = resolve(__dirname, "../..");
const shipped = await compileScannedCss(repoRoot);

/** One style rule with the at-rules around it, outermost first. */
interface Rule {
  readonly context: readonly string[];
  readonly selector: string;
  readonly declarations: ReadonlyMap<string, string>;
}

function parse(block: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const declaration of block.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    declarations.set(
      declaration.slice(0, colon).trim(),
      declaration
        .slice(colon + 1)
        .trim()
        .replaceAll(/\s+/g, " "),
    );
  }
  return declarations;
}

/** A small brace-matching walk, enough for Tailwind's output (as `motion-css.test.ts` walks it). */
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
        .replace(/^[\s\S]*;/, "")
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
      if (prelude.startsWith("@") || inner.includes("{")) {
        visit(inner, [...context, prelude]);
      } else {
        rules.push({ context, selector: prelude, declarations: parse(inner) });
      }
      index = cursor;
    }
  };
  visit(text, []);
  return rules;
}

const MOVES = (at: string): boolean =>
  at.includes("prefers-reduced-motion: no-preference");
const REDUCE = (at: string): boolean =>
  at.includes("prefers-reduced-motion: reduce");
const RAW_TIME = /(^|[\s(,])-?\d*\.?\d+m?s\b/;
const CARD = /data-fo-card-(sample|text|swap|signature)\b/;

/** The selector list of the rest rule, as the walk normalises it. */
const REST =
  '[data-fo-card-sample][aria-hidden="true"], [data-fo-card-sample]:not([aria-hidden="true"]) + [data-fo-card-text]';
const SWAP = "[data-fo-card-swap] > *";
const HAND_OVER = "opacity var(--duration-base) var(--ease-standard)";

function cardPreviewViolations(css: string): string[] {
  const rules = walk(css).filter((rule) => CARD.test(rule.selector));
  const found: string[] = [];

  // Rest: one rule, outside any at-rule, that sets only `opacity: 0`.
  const rest = rules.filter((rule) => rule.selector === REST);
  if (rest.length !== 1) found.push("rest rule missing");
  for (const rule of rest) {
    if (rule.context.length > 0) found.push("rest rule inside an at-rule");
    if (
      rule.declarations.size !== 1 ||
      rule.declarations.get("opacity") !== "0"
    ) {
      found.push("rest rule sets more than opacity 0");
    }
  }

  // The hand-over: one transition, on the swap cell's children, under `no-preference` only.
  const moving = rules.filter(
    (rule) =>
      rule.declarations.has("transition") ||
      rule.declarations.has("transition-property") ||
      rule.declarations.has("animation") ||
      rule.declarations.has("animation-name"),
  );
  for (const rule of moving) {
    if (rule.selector !== SWAP)
      found.push(`moves outside the cell: ${rule.selector}`);
    if (!rule.context.some(MOVES))
      found.push(`moves without no-preference: ${rule.selector}`);
    if (rule.context.some(REDUCE))
      found.push(`moves under reduce: ${rule.selector}`);
    for (const [property, value] of rule.declarations) {
      if (RAW_TIME.test(value)) found.push(`raw time: ${property}`);
    }
  }
  const swap = moving.filter((rule) => rule.selector === SWAP);
  if (swap.length !== 1) found.push("hand-over missing");
  for (const rule of swap) {
    if (rule.declarations.get("transition") !== HAND_OVER) {
      found.push(
        `hand-over is ${rule.declarations.get("transition") ?? "absent"}`,
      );
    }
    if (rule.declarations.size !== 1)
      found.push("hand-over sets more than its transition");
  }
  if (css.includes("@keyframes fo-card")) found.push("keyframes added");

  // The face: the card re-declares the theme's `--font-hand`, so the stack resolves where the
  // Caveat variables are (on the card), not at `:root`, where they are not.
  const all = walk(css);
  const theme = all.find(
    (rule) =>
      (rule.selector === ":root, :host" || rule.selector === ":root") &&
      rule.declarations.has("--font-hand"),
  );
  const card = all.filter(
    (rule) =>
      rule.selector === "[data-fo-card-preview]" &&
      rule.declarations.has("--font-hand"),
  );
  if (card.length !== 1) {
    found.push("face not re-declared on the card");
  } else if (
    theme === undefined ||
    card[0]?.declarations.get("--font-hand") !==
      theme.declarations.get("--font-hand") ||
    card[0]?.context.length !== 0 ||
    card[0]?.declarations.size !== 1
  ) {
    found.push("card face differs from the theme's stack");
  }
  return found;
}

describe("idea 2, the card preview, in the shipped stylesheet (T-3, AC-3, AC-4)", () => {
  it("finds every clause where motion 15 puts it", () => {
    expect(cardPreviewViolations(shipped)).toEqual([]);
  });

  it("reads the tokens it names at their values: 200 ms and the standard curve", () => {
    expect(shipped).toMatch(/--duration-base:\s*200ms/);
    expect(shipped).toMatch(
      /--ease-standard:\s*cubic-bezier\(0\.2, 0, 0\.13, 1\)/,
    );
  });

  it("goes red with the swap at `--duration-slow`, a raw `450ms`, a size transition, the swap under `reduce`, the sample left in place, and the face left at the root", () => {
    const mutate = (from: string, to: string): string => {
      expect(shipped).toContain(from);
      return shipped.replace(from, to);
    };
    const transition = `transition: ${HAND_OVER};`;
    expect(
      cardPreviewViolations(
        mutate(
          transition,
          "transition: opacity var(--duration-slow) var(--ease-standard);",
        ),
      ),
    ).toContain(
      "hand-over is opacity var(--duration-slow) var(--ease-standard)",
    );
    expect(
      cardPreviewViolations(
        mutate(transition, "transition: opacity 450ms var(--ease-standard);"),
      ),
    ).toContain("raw time: transition");
    expect(
      cardPreviewViolations(
        mutate(
          transition,
          `${transition} transition-property: opacity, height;`,
        ),
      ),
    ).toContain("hand-over sets more than its transition");
    expect(
      cardPreviewViolations(
        mutate(
          "prefers-reduced-motion: no-preference) {\n  [data-fo-card-swap]",
          "prefers-reduced-motion: reduce) {\n  [data-fo-card-swap]",
        ),
      ),
    ).toEqual(
      expect.arrayContaining([
        `moves without no-preference: ${SWAP}`,
        `moves under reduce: ${SWAP}`,
      ]),
    );
    expect(
      cardPreviewViolations(
        mutate('[data-fo-card-sample][aria-hidden="true"],', ""),
      ),
    ).toContain("rest rule missing");
    expect(
      cardPreviewViolations(
        mutate("[data-fo-card-preview] {", "[data-fo-card-preview-off] {"),
      ),
    ).toContain("face not re-declared on the card");
  });
});
