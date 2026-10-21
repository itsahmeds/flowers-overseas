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
 *
 * Idea 6, the route line (§5.3.6, AC-3, AC-4, AC-19; TASK-311). `routeViolations` names each clause
 * it cannot find where the motion sheet puts it; the shipped CSS gives none, and each mutation T-3
 * and T-19 list gives the one it breaks:
 *
 *  - the two keyframes animate `stroke-dashoffset` (the mask, 0 to -1 over `pathLength` 1) and
 *    `opacity` (the destination dot, 0 to 1) and nothing else;
 *  - they play only on the mask and the dot, only under `prefers-reduced-motion: no-preference`,
 *    once, with `--duration-draw` and `--ease-emphasised`, then `--duration-base`; every time value
 *    is a token (the 500 ms delay is built from `--duration-base`), never a raw `ms`;
 *  - at rest, and so under `reduce`, the mask is rolled away (its `1 1` dash over `pathLength` 1 is
 *    the SVG's own attribute, pinned in `corridor-route-line.test.tsx`) and the dot is not hidden:
 *    the route is drawn from the first frame;
 *  - the line is not displayed below `md` (48rem) and is out of flow from `md` up.
 */
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { walkCss } from "./support/css-rules.ts";
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

const MD_UP = (at: string): boolean =>
  /min-width: ?48rem|width >= 48rem/.test(at);
const ROUTE_KEYFRAMES = ["fo-route-draw", "fo-route-dot"] as const;

function routeViolations(css: string): string[] {
  const rules = walkCss(css);
  const found: string[] = [];

  // The keyframes: one property each, start and end values.
  const frames = (name: string) =>
    rules.filter((rule) =>
      rule.context.some((at) => at === `@keyframes ${name}`),
    );
  const expectFrames = (
    name: string,
    property: string,
    from: string,
    to: string,
  ): void => {
    const list = frames(name);
    if (list.length === 0) {
      found.push(`${name} missing`);
      return;
    }
    for (const rule of list) {
      for (const key of rule.declarations.keys()) {
        if (key !== property) found.push(`${name} animates ${key}`);
      }
    }
    const value = (selector: string): string | undefined =>
      list
        .find((rule) => rule.selector === selector)
        ?.declarations.get(property);
    if (value("from") !== from || value("to") !== to)
      found.push(`${name} values`);
  };
  expectFrames("fo-route-draw", "stroke-dashoffset", "0", "-1");
  expectFrames("fo-route-dot", "opacity", "0", "1");

  // Who plays them, where, and how.
  const players = rules.filter((rule) => {
    const animation = `${rule.declarations.get("animation") ?? ""} ${rule.declarations.get("animation-name") ?? ""}`;
    return ROUTE_KEYFRAMES.some((name) => animation.includes(name));
  });
  const expectPlayer = (selector: string, shorthand: string): void => {
    const rule = players.find((candidate) => candidate.selector === selector);
    if (rule === undefined) {
      found.push(`${selector} plays nothing`);
      return;
    }
    if (rule.declarations.get("animation") !== shorthand)
      found.push(`${selector} animation`);
  };
  expectPlayer(
    '[data-fo-route="mask"]',
    "fo-route-draw var(--duration-draw) var(--ease-emphasised) var(--fo-route-delay) 1 backwards",
  );
  expectPlayer(
    '[data-fo-route="to"]',
    "fo-route-dot var(--duration-base) var(--ease-standard) calc(var(--fo-route-delay) + var(--duration-draw)) 1 backwards",
  );
  for (const rule of players) {
    if (!rule.selector.startsWith("[data-fo-route")) {
      found.push(`played outside the route SVG: ${rule.selector}`);
    }
    if (!rule.context.some(MOVES))
      found.push(`plays under reduce: ${rule.selector}`);
    const animation = rule.declarations.get("animation") ?? "";
    if (/\binfinite\b/.test(animation) || !/ 1 backwards$/.test(animation)) {
      found.push(`iterates: ${rule.selector}`);
    }
  }

  // Every time value on the route's own rules is a token.
  const own = rules.filter(
    (rule) =>
      rule.selector.includes("data-fo-route") &&
      !rule.context.some((at) => at.startsWith("@keyframes")),
  );
  for (const rule of own) {
    for (const [property, value] of rule.declarations) {
      if (RAW_TIME.test(value)) {
        found.push(`raw time on ${rule.selector}: ${property}`);
      }
    }
  }
  const delay = own.find((rule) => rule.declarations.has("--fo-route-delay"));
  if (
    delay?.declarations.get("--fo-route-delay") !==
    "calc(var(--duration-base) * 2.5)"
  ) {
    found.push("delay");
  }

  // At rest: drawn, the dot shown, not displayed below md, out of flow from md up.
  const rest = own.filter((rule) => rule.context.length === 0);
  const at = (selector: string, property: string): string | undefined =>
    rest
      .filter(
        (rule) => rule.selector === selector && rule.declarations.has(property),
      )
      .at(-1)
      ?.declarations.get(property);
  if (at('[data-fo-route="mask"]', "stroke-dashoffset") !== "-1")
    found.push("not drawn at rest");
  if (
    own.some(
      (rule) =>
        !rule.context.some(MOVES) && rule.declarations.get("opacity") === "0",
    )
  ) {
    found.push("hidden at rest");
  }
  if (at("[data-fo-route-line]", "display") !== "none")
    found.push("shown below md");
  if (at("[data-fo-route-line]", "position") !== "absolute")
    found.push("in flow");
  const shown = own.find(
    (rule) =>
      rule.selector === "[data-fo-route-line]" &&
      rule.context.some(MD_UP) &&
      rule.declarations.get("display") === "block",
  );
  if (shown === undefined) found.push("not shown from md");
  return found;
}

describe("idea 6: the route line's CSS, as shipped (AC-3, AC-4, AC-19)", () => {
  it("holds every clause", () => {
    expect(routeViolations(shipped)).toEqual([]);
  });

  it("uses the two tokens the motion sheet names, value for value", () => {
    expect(shipped).toMatch(/--duration-draw:\s*600ms/);
    expect(shipped).toMatch(/--duration-base:\s*200ms/);
  });

  const mutate = (from: RegExp | string, to: string): string => {
    const next = shipped.replace(from, to);
    expect(next, `mutation ${String(from)} applied`).not.toBe(shipped);
    return next;
  };

  it("goes red with `animation-iteration-count: infinite` (T-19)", () => {
    expect(
      routeViolations(
        mutate(
          /var\(--fo-route-delay\) 1 backwards/,
          "var(--fo-route-delay) infinite backwards",
        ),
      ),
    ).toEqual(
      expect.arrayContaining([
        '[data-fo-route="mask"] animation',
        'iterates: [data-fo-route="mask"]',
      ]),
    );
  });

  it("goes red with a raw 450ms (T-3)", () => {
    expect(
      routeViolations(mutate("calc(var(--duration-base) * 2.5)", "450ms")),
    ).toEqual(
      expect.arrayContaining([
        "raw time on [data-fo-route-line]: --fo-route-delay",
        "delay",
      ]),
    );
  });

  it("goes red with a `width` keyframe, and with `stroke-dashoffset` played outside the route SVG (T-3)", () => {
    expect(
      routeViolations(
        `${shipped}\n@keyframes fo-route-draw { from { width: 0 } }`,
      ),
    ).toContain("fo-route-draw animates width");
    expect(
      routeViolations(
        `${shipped}\n@media (prefers-reduced-motion: no-preference) { .fo-card { animation: fo-route-draw var(--duration-draw) var(--ease-emphasised) 0s 1 backwards; } }`,
      ),
    ).toEqual(["played outside the route SVG: .fo-card"]);
  });

  it("goes red with the draw moved out of the `no-preference` query (AC-4)", () => {
    expect(
      routeViolations(
        `${shipped}\n[data-fo-route="mask"] { animation: fo-route-draw var(--duration-draw) var(--ease-emphasised) var(--fo-route-delay) 1 backwards; }`,
      ),
    ).toEqual(['plays under reduce: [data-fo-route="mask"]']);
  });

  it("goes red with the route left undrawn or the dot hidden at rest (AC-4: drawn from the first frame)", () => {
    expect(
      routeViolations(
        `${shipped}\n[data-fo-route="mask"] { stroke-dashoffset: 0; }`,
      ),
    ).toEqual(["not drawn at rest"]);
    expect(
      routeViolations(`${shipped}\n[data-fo-route="to"] { opacity: 0; }`),
    ).toEqual(["hidden at rest"]);
  });

  it("goes red with the line displayed below `md` (§13 Q8 (d))", () => {
    expect(
      routeViolations(`${shipped}\n[data-fo-route-line] { display: block; }`),
    ).toEqual(["shown below md"]);
  });
});
