/**
 * T-3 (and AC-4's CSS half) for spec 042's ideas, read from the **shipped** stylesheet
 * (`compileScannedCss`, the same scan `next build` runs; beside `motion-css.test.ts`, which already
 * holds every keyframe and transition in the file to `transform`, `opacity` and a keyframed
 * `stroke-dashoffset`). The first idea to land creates this file; each later idea adds its block.
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

const MOVES = (at: string): boolean =>
  at.includes("prefers-reduced-motion: no-preference");
const MD_UP = (at: string): boolean =>
  /min-width: ?48rem|width >= 48rem/.test(at);
const ROUTE_KEYFRAMES = ["fo-route-draw", "fo-route-dot"] as const;
const RAW_TIME = /(^|[\s(,])-?\d*\.?\d+m?s\b/;

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
