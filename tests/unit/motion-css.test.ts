/**
 * T-48 (unit half) / AC-44, AC-6 as spec 004 §14 A24 clause 9 amends them (TASK-194).
 *
 * Read from the **shipped** stylesheet: `compileScannedCss` runs Tailwind's compiler over
 * `src/app/globals.css` with the same source scan `next build` does, so a utility a component adds
 * (`transition-colors`, `animate-pulse`) is in what this suite reads.
 *
 *  - every `@keyframes` frame and every `transition-property` (longhand or shorthand) names only
 *    `transform` (or its individual `translate`/`scale`/`rotate`) and `opacity`, and
 *    `stroke-dashoffset` only in a keyframe; red with a `height` keyframe;
 *  - motion 11 and 12's hidden start states sit behind `html[data-fo-motion]`, which only the
 *    client module sets; red with the gate removed;
 *  - everything the motions animate sits inside `prefers-reduced-motion: no-preference`, and the
 *    one reduced form that changes over time is opacity at `--duration-fast` (120 ms);
 *  - the two tokens in both files, no route-level loading fallback, no animation library.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { compileScannedCss } from "./support/tailwind.ts";

const repoRoot = resolve(__dirname, "../..");
const shipped = await compileScannedCss(repoRoot);

/** One style rule with the at-rules around it, outermost first. */
interface Rule {
  readonly context: readonly string[];
  readonly selector: string;
  readonly declarations: ReadonlyMap<string, string>;
}

/** A small brace-matching walk: enough for Tailwind's output, which is regular CSS. */
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
        .trim();
      let depth = 1;
      let cursor = open + 1;
      while (depth > 0 && cursor < body.length) {
        if (body[cursor] === "{") depth += 1;
        else if (body[cursor] === "}") depth -= 1;
        cursor += 1;
      }
      const inner = body.slice(open + 1, cursor - 1);
      if (prelude.startsWith("@") || inner.includes("{")) {
        // An at-rule, or a rule with nested rules: recurse with its prelude on the stack, and keep
        // its own declarations (the part before the first nested block) as a rule too.
        const own = inner.split("{")[0]?.replace(/[^;]*$/, "") ?? "";
        if (!prelude.startsWith("@") && own.trim() !== "") {
          rules.push({ context, selector: prelude, declarations: parse(own) });
        }
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

function parse(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const declaration of block.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    map.set(
      declaration.slice(0, colon).trim(),
      declaration
        .slice(colon + 1)
        .replace("!important", "")
        .trim(),
    );
  }
  return map;
}

const TRANSFORM_FAMILY = new Set(["transform", "translate", "scale", "rotate"]);
const KEYFRAME_ALLOWED = new Set([
  ...TRANSFORM_FAMILY,
  "opacity",
  "stroke-dashoffset",
]);
const TRANSITION_ALLOWED = new Set([...TRANSFORM_FAMILY, "opacity", "none"]);

/** Every property a stylesheet animates or transitions that AC-44 does not allow. */
function disallowedMotion(css: string): string[] {
  const found: string[] = [];
  for (const rule of walk(css)) {
    const keyframes = rule.context.find((at) => at.startsWith("@keyframes"));
    if (keyframes !== undefined) {
      const name = keyframes.replace("@keyframes", "").trim();
      for (const property of rule.declarations.keys()) {
        if (property.startsWith("--")) continue;
        if (!KEYFRAME_ALLOWED.has(property)) {
          found.push(`@keyframes ${name}: ${property}`);
        }
      }
      continue;
    }
    const listed: string[] = [];
    const longhand = rule.declarations.get("transition-property");
    if (longhand !== undefined) listed.push(...longhand.split(","));
    const shorthand = rule.declarations.get("transition");
    if (shorthand !== undefined) {
      for (const part of shorthand.split(",")) {
        const first = part.trim().split(/\s+/)[0] ?? "";
        // A shorthand that names no property (`200ms ease`) transitions `all`.
        listed.push(
          /^[a-z-]+$/.test(first) && !/^(ease|linear|step)/.test(first)
            ? first
            : "all",
        );
      }
    }
    for (const raw of listed) {
      const property = raw.trim();
      if (property.startsWith("var(")) continue;
      if (!TRANSITION_ALLOWED.has(property)) {
        found.push(`${rule.selector}: transition ${property}`);
      }
    }
  }
  return found;
}

describe("AC-44: only transform and opacity move (plus a stroke on the bloom)", () => {
  it("finds nothing else in the shipped stylesheet", () => {
    expect(disallowedMotion(shipped)).toEqual([]);
  });

  it("goes red with a `height` keyframe, a colour transition and an `all` shorthand", () => {
    expect(
      disallowedMotion(
        `@keyframes grow { from { height: 0 } to { height: 10px } }`,
      ),
    ).toEqual(["@keyframes grow: height", "@keyframes grow: height"]);
    expect(
      disallowedMotion(`.a { transition-property: color, background-color; }`),
    ).toEqual([".a: transition color", ".a: transition background-color"]);
    expect(disallowedMotion(`.b { transition: 200ms ease; }`)).toEqual([
      ".b: transition all",
    ]);
    expect(
      disallowedMotion(`.c { transition: margin-top 200ms ease, opacity 1s; }`),
    ).toEqual([".c: transition margin-top"]);
  });

  it("allows `stroke-dashoffset` in a keyframe only, never as a transition", () => {
    expect(
      disallowedMotion(`@keyframes d { to { stroke-dashoffset: 0 } }`),
    ).toEqual([]);
    expect(
      disallowedMotion(`.e { transition-property: stroke-dashoffset; }`),
    ).toEqual([".e: transition stroke-dashoffset"]);
  });

  it("ships the bloom, the bar and the shimmer as keyframes", () => {
    for (const name of [
      "fo-bloom-stem",
      "fo-bloom-petal",
      "fo-nav-bar",
      "fo-shimmer",
    ]) {
      expect(shipped, name).toContain(`@keyframes ${name}`);
    }
  });
});

/** The rules that hide something until it plays (opacity 0 outside a keyframe and a start style). */
function hiddenStartStates(css: string): Rule[] {
  return walk(css).filter(
    (rule) =>
      rule.declarations.get("opacity") === "0" &&
      !rule.context.some(
        (at) => at.startsWith("@keyframes") || at.startsWith("@starting-style"),
      ) &&
      /data-fo-(reveal|fade)/.test(rule.selector),
  );
}

describe("A24 clause 9 (g): motion 11 and 12 hide nothing without the module", () => {
  it("puts every hidden start state behind `html[data-fo-motion]` and a `pending` mark", () => {
    const hidden = hiddenStartStates(shipped);
    expect(hidden.map((rule) => rule.selector).sort()).toEqual([
      'html[data-fo-motion] [data-fo-reveal="pending"] > *',
      'html[data-fo-motion] img[data-fo-fade="pending"]',
    ]);
  });

  it("goes red when a start state loses its gate", () => {
    const leaked = `${shipped}\n[data-fo-reveal] > * { opacity: 0; }`;
    expect(
      hiddenStartStates(leaked).filter(
        (rule) =>
          !rule.selector.startsWith("html[data-fo-motion]") ||
          !rule.selector.includes('="pending"'),
      ),
    ).toHaveLength(1);
  });
});

describe("AC-6 as A24 clause 9 (c): reduced motion", () => {
  const rules = walk(shipped);
  const MOTION_SELECTOR =
    /data-fo-(nav|bloom|pending|shimmer|pick|ring|card-motion|language-popup|menu|consent-sheet|fade|reveal)/;

  it("plays every motion of this task only under `no-preference`", () => {
    const moving = rules.filter(
      (rule) =>
        MOTION_SELECTOR.test(rule.selector) &&
        (rule.declarations.has("animation") ||
          rule.declarations.has("transition-property")) &&
        !rule.context.some((at) =>
          at.includes("prefers-reduced-motion: reduce"),
        ),
    );
    expect(moving.length).toBeGreaterThan(10);
    for (const rule of moving) {
      expect(
        rule.context.some((at) =>
          at.includes("prefers-reduced-motion: no-preference"),
        ),
        rule.selector,
      ).toBe(true);
    }
  });

  it("leaves one change over time under `reduce`: motion 10's opacity, at 120 ms or less", () => {
    const reduced = rules.filter(
      (rule) =>
        rule.context.some((at) =>
          at.includes("prefers-reduced-motion: reduce"),
        ) &&
        MOTION_SELECTOR.test(rule.selector) &&
        rule.declarations.has("transition-property"),
    );
    expect(reduced).toHaveLength(1);
    const [only] = reduced;
    expect(only?.declarations.get("transition-property")).toBe("opacity");
    expect(only?.declarations.get("transition-duration")).toBe(
      "var(--duration-fast)",
    );
    expect(shipped).toMatch(/--duration-fast:\s*120ms/);
  });
});

describe("A24 clause 9 (a): the two tokens, name for name and value for value", () => {
  const files = ["src/app/globals.css", "docs/design/system/tokens.css"];
  for (const file of files) {
    it(file, () => {
      const text = readFileSync(resolve(repoRoot, file), "utf8");
      expect(text).toMatch(/--duration-draw:\s*600ms;/);
      expect(text).toMatch(/--duration-bloom:\s*1200ms;/);
    });
  }
});

describe("A24 clause 9 (f): no route-level loading fallback", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }

  it("has no `loading.*` file anywhere under `src/app`", () => {
    const loaders = files(resolve(repoRoot, "src/app")).filter((path) =>
      /\/loading\.(t|j)sx?$/.test(path),
    );
    expect(loaders).toEqual([]);
  });
});

describe("clause 11: no animation library, no Lottie, no canvas, no video", () => {
  const LIBRARIES =
    /^(framer-motion|motion|gsap|animejs|animate\.css|aos|lottie-web|lottie-react|@lottiefiles\/.*|react-spring|@react-spring\/.*|popmotion|velocity-animate|react-transition-group|@formkit\/auto-animate|swiper|keen-slider|embla-carousel.*)$/;

  it("lists none in package.json", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, "package.json"), "utf8"),
    ) as Record<string, Record<string, string> | undefined>;
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(names.filter((name) => LIBRARIES.test(name))).toEqual([]);
    expect(LIBRARIES.test("framer-motion")).toBe(true);
  });

  it("renders no <canvas> or <video> from src", () => {
    const list = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory()
          ? list(path)
          : path.endsWith(".tsx")
            ? [path]
            : [];
      });
    const sources = list(resolve(repoRoot, "src"));
    expect(sources.length).toBeGreaterThan(50);
    const offenders = sources.filter((path) =>
      /<(canvas|video)[\s>]/.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
    expect(existsSync(resolve(repoRoot, "src/app"))).toBe(true);
  });
});

/*
 * T-48 as spec 004 §14 A-founder-2026-10-19e amends it (TASK-277): motion 6, premium, read rule by
 * rule from the shipped stylesheet. `motion6Violations` names each clause-1 value it cannot find
 * where clause 5 puts it; the shipped CSS gives none, and each mutation the amendment lists gives
 * the one it breaks.
 */
const FINE = (at: string): boolean =>
  at.includes("(hover: hover) and (pointer: fine)");
const MOVES = (at: string): boolean =>
  at.includes("prefers-reduced-motion: no-preference");
const REDUCE = (at: string): boolean =>
  at.includes("prefers-reduced-motion: reduce");

function motion6Violations(
  css: string,
  tokenFiles: readonly string[],
): string[] {
  const rules = walk(css).map((rule) => ({
    ...rule,
    selector: rule.selector.replaceAll(/\s+/g, " "),
  }));
  const found: string[] = [];
  /** The declaration of `property` on `selector`, in the last rule whose at-rules all `where` allows. */
  const value = (
    selector: string,
    property: string,
    where: readonly ((at: string) => boolean)[],
  ): string | undefined =>
    rules
      .filter(
        (rule) =>
          rule.selector === selector &&
          where.every((test) => rule.context.some(test)) &&
          (where.length > 0 || !rule.context.some(REDUCE)) &&
          rule.declarations.has(property),
      )
      .at(-1)
      ?.declarations.get(property);
  const expectValue = (
    name: string,
    selector: string,
    property: string,
    expected: string,
    where: readonly ((at: string) => boolean)[],
  ): void => {
    if (value(selector, property, where) !== expected) found.push(name);
  };

  // Clause 3: the token, in both files, value for value.
  if (!tokenFiles.every((text) => /--duration-hover:\s*500ms;/.test(text))) {
    found.push("token");
  }
  // Clause 4: `--duration-hover` only under `[data-fo-card-motion]`.
  if (
    rules.some(
      (rule) =>
        [...rule.declarations.values()].some((v) =>
          v.includes("var(--duration-hover)"),
        ) && !rule.selector.includes("[data-fo-card-motion]"),
    )
  ) {
    found.push("token scope");
  }

  const CARD = "a[data-fo-card-motion], a[data-fo-card-motion] img";
  const SHADOW = "a[data-fo-card-motion] [data-fo-card-shadow]";
  const LINE = "a[data-fo-card-motion] [data-fo-card-line]";
  const MOVING = [MOVES, FINE];
  // (a), (b): the link and the photograph.
  expectValue(
    "card property",
    CARD,
    "transition-property",
    "transform",
    MOVING,
  );
  expectValue(
    "card duration",
    CARD,
    "transition-duration",
    "var(--duration-hover)",
    MOVING,
  );
  expectValue(
    "card curve",
    CARD,
    "transition-timing-function",
    "var(--ease-photo)",
    MOVING,
  );
  expectValue(
    "lift",
    "a[data-fo-card-motion]:hover",
    "transform",
    "translateY(-4px)",
    MOVING,
  );
  expectValue(
    "zoom",
    "a[data-fo-card-motion]:hover img",
    "transform",
    "scale(1.06)",
    MOVING,
  );
  // (c): the shadow layer paints its shadow at all times; only its opacity moves.
  expectValue(
    "shadow property",
    SHADOW,
    "transition-property",
    "opacity",
    MOVING,
  );
  expectValue(
    "shadow duration",
    SHADOW,
    "transition-duration",
    "var(--duration-hover)",
    MOVING,
  );
  expectValue(
    "shadow curve",
    SHADOW,
    "transition-timing-function",
    "var(--ease-photo)",
    MOVING,
  );
  expectValue(
    "shadow hover",
    "a[data-fo-card-motion]:hover [data-fo-card-shadow]",
    "opacity",
    "1",
    MOVING,
  );
  expectValue("shadow rest", "[data-fo-card-shadow]", "opacity", "0", []);
  expectValue(
    "shadow paint",
    "[data-fo-card-shadow]",
    "box-shadow",
    "var(--shadow-letter)",
    [],
  );
  // (d): the name's line, from the inline-start.
  expectValue(
    "line property",
    LINE,
    "transition-property",
    "transform",
    MOVING,
  );
  expectValue(
    "line duration",
    LINE,
    "transition-duration",
    "var(--duration-slow)",
    MOVING,
  );
  expectValue(
    "line curve",
    LINE,
    "transition-timing-function",
    "var(--ease-emphasised)",
    MOVING,
  );
  expectValue(
    "line hover",
    "a[data-fo-card-motion]:hover [data-fo-card-line]",
    "transform",
    "scaleX(1)",
    MOVING,
  );
  expectValue("line rest", "[data-fo-card-line]", "transform", "scaleX(0)", []);
  expectValue(
    "line origin",
    "[data-fo-card-line]",
    "transform-origin",
    "0 50%",
    [],
  );
  expectValue(
    "line origin rtl",
    '[dir="rtl"] [data-fo-card-line]',
    "transform-origin",
    "100% 50%",
    [],
  );
  // (e), (f): the pill's layer and its press.
  expectValue("pill hover", ".fo-pill:hover::before", "opacity", "1", [FINE]);
  expectValue(
    "pill layer property",
    ".fo-pill::before",
    "transition-property",
    "opacity",
    [MOVES],
  );
  expectValue(
    "pill layer duration",
    ".fo-pill::before",
    "transition-duration",
    "var(--duration-base)",
    [MOVES],
  );
  expectValue(
    "pill layer curve",
    ".fo-pill::before",
    "transition-timing-function",
    "var(--ease-standard)",
    [MOVES],
  );
  expectValue(
    "pill pressed layer",
    ".fo-pill:active::before",
    "transition-duration",
    "0s",
    [MOVES],
  );
  expectValue("press", ".fo-pill:active", "transform", "scale(0.98)", [MOVES]);
  expectValue(
    "press in",
    ".fo-pill:active",
    "transition-duration",
    "var(--duration-fast)",
    [MOVES],
  );
  expectValue(
    "press in curve",
    ".fo-pill:active",
    "transition-timing-function",
    "var(--ease-standard)",
    [MOVES],
  );
  expectValue(
    "press release",
    ".fo-pill",
    "transition-duration",
    "var(--duration-base)",
    [MOVES],
  );
  expectValue(
    "press release curve",
    ".fo-pill",
    "transition-timing-function",
    "var(--ease-emphasised)",
    [MOVES],
  );
  // A pill's colour moves only through its layer: no hover background on the pill itself.
  if (
    rules.some(
      (rule) =>
        /^\.fo-pill:(hover|active)$/.test(rule.selector) &&
        rule.declarations.has("background-color"),
    )
  ) {
    found.push("pill background");
  }

  // Clause 5: fine pointer only, and reduced motion off.
  for (const rule of rules) {
    const card = rule.selector.includes("[data-fo-card-motion]");
    const hover = rule.selector.includes(":hover");
    const moving =
      rule.declarations.has("transform") ||
      rule.declarations.has("transition-property");
    if (
      (card || (hover && rule.selector.includes(".fo-pill"))) &&
      !rule.context.some(FINE)
    ) {
      found.push(`fine pointer: ${rule.selector}`);
    }
    if (
      (card || rule.selector.startsWith(".fo-pill")) &&
      moving &&
      !rule.context.some(MOVES) &&
      !(rule.context.some(REDUCE) && rule.selector === "[data-fo-card-line]")
    ) {
      found.push(`reduced motion: ${rule.selector}`);
    }
    if (
      rule.declarations.has("will-change") &&
      !/:(hover|active)/.test(rule.selector)
    ) {
      found.push(`will-change at rest: ${rule.selector}`);
    }
  }
  expectValue(
    "reduce line rest",
    "[data-fo-card-line]",
    "transform",
    "scaleX(1)",
    [REDUCE],
  );
  expectValue("reduce line hidden", "[data-fo-card-line]", "opacity", "0", [
    REDUCE,
  ]);
  expectValue(
    "reduce line hover",
    "a[data-fo-card-motion]:hover [data-fo-card-line]",
    "opacity",
    "1",
    [REDUCE, FINE],
  );

  // The layers' paint and place, at rest and outside any media query (PR 285 round 1, HOLES 2
  // and 4): the pill's layer under its label in the variant's colours, and the shadow layer on
  // the photograph's box with the photograph's own radii (`rounded-photo-s md:rounded-photo`).
  const atRest = (selector: string, property: string): string | undefined =>
    rules
      .filter(
        (rule) =>
          rule.selector === selector &&
          !rule.context.some((at) => at.startsWith("@media")) &&
          rule.declarations.has(property),
      )
      .at(-1)
      ?.declarations.get(property);
  const PAINT: readonly [string, string, string, string][] = [
    ["pill isolation", ".fo-pill", "isolation", "isolate"],
    ["pill layer under label", ".fo-pill::before", "z-index", "-1"],
    [
      "pill layer inset",
      ".fo-pill::before",
      "inset",
      "var(--fo-pill-inset, 0)",
    ],
    [
      "pill layer colour",
      ".fo-pill::before",
      "background-color",
      "var(--fo-pill-hover)",
    ],
    [
      "pill pressed colour",
      ".fo-pill:active::before",
      "background-color",
      "var(--fo-pill-active, var(--fo-pill-hover))",
    ],
    ["shadow inset", "[data-fo-card-shadow]", "inset", "0"],
    [
      "shadow radius",
      "[data-fo-card-shadow]",
      "border-radius",
      "var(--radius-photo-s)",
    ],
  ];
  for (const [name, selector, property, expected] of PAINT) {
    if (atRest(selector, property) !== expected) found.push(name);
  }
  expectValue(
    "shadow radius md",
    "[data-fo-card-shadow]",
    "border-radius",
    "var(--radius-photo)",
    [(at) => at.includes("min-width: 48rem")],
  );

  // (f) The press applies on every pointer, touch included: under `no-preference`, never behind
  // a hover or fine-pointer query.
  const presses = rules.filter(
    (rule) =>
      rule.selector === ".fo-pill:active" && rule.declarations.has("transform"),
  );
  if (
    presses.length === 0 ||
    presses.some(
      (rule) =>
        !rule.context.some(MOVES) ||
        rule.context.some(
          (at) => at.includes("(hover: hover)") || at.includes("pointer: fine"),
        ),
    )
  ) {
    found.push("press on every pointer");
  }
  return found;
}

describe("A-founder-2026-10-19e: motion 6, premium, value for value (T-48)", () => {
  const tokenFiles = [
    "src/app/globals.css",
    "docs/design/system/tokens.css",
  ].map((file) => readFileSync(resolve(repoRoot, file), "utf8"));
  const swap = (from: string | RegExp, to: string): string => {
    const mutated = shipped.replace(from, to);
    expect(mutated, `mutation ${String(from)}`).not.toBe(shipped);
    return mutated;
  };

  it("finds every value of clause 1 where clause 5 puts it", () => {
    expect(motion6Violations(shipped, tokenFiles)).toEqual([]);
  });

  it("declares `--duration-hover` as exactly 500ms in both files", () => {
    for (const text of tokenFiles)
      expect(text).toMatch(/--duration-hover:\s*500ms;/);
  });

  const MUTATIONS: readonly [
    string,
    () => [string, readonly string[]],
    string,
  ][] = [
    [
      "the lift back to -2px",
      () => [swap("translateY(-4px)", "translateY(-2px)"), tokenFiles],
      "lift",
    ],
    [
      "the zoom back to 1.03",
      () => [
        swap(
          /(a\[data-fo-card-motion\]:hover img \{\s*transform: )scale\(1\.06\)/,
          "$1scale(1.03)",
        ),
        tokenFiles,
      ],
      "zoom",
    ],
    [
      "`--duration-hover` at 400ms",
      () => [
        shipped,
        tokenFiles.map((t) =>
          t.replace("--duration-hover: 500ms", "--duration-hover: 400ms"),
        ),
      ],
      "token",
    ],
    [
      "`--duration-hover` in one file only",
      () => [shipped, [tokenFiles[0] ?? "", ""]],
      "token",
    ],
    [
      "the card's curve set to `--ease-standard`",
      () => [
        swap(
          /(a\[data-fo-card-motion\] img \{[^}]*?)var\(--ease-photo\)/,
          "$1var(--ease-standard)",
        ),
        tokenFiles,
      ],
      "card curve",
    ],
    [
      "a `box-shadow` transition in place of the layer's opacity",
      () => [
        swap(
          /(a\[data-fo-card-motion\] \[data-fo-card-shadow\] \{\s*transition-property: )opacity/,
          "$1box-shadow",
        ),
        tokenFiles,
      ],
      "shadow property",
    ],
    [
      'the line\'s origin at 100% 50% without `dir="rtl"`',
      () => [
        swap(
          /(\[data-fo-card-line\] \{[^}]*?transform-origin: )0 50%;/,
          "$1100% 50%;",
        ),
        tokenFiles,
      ],
      "line origin",
    ],
    [
      "the line at `--duration-base`",
      () => [
        swap(
          /(a\[data-fo-card-motion\] \[data-fo-card-line\] \{[^}]*?)var\(--duration-slow\)/,
          "$1var(--duration-base)",
        ),
        tokenFiles,
      ],
      "line duration",
    ],
    [
      "the press release at `--duration-fast`",
      () => [
        swap(
          /(\.fo-pill \{\s*transition-property: transform;\s*transition-duration: )var\(--duration-base\)/,
          "$1var(--duration-fast)",
        ),
        tokenFiles,
      ],
      "press release",
    ],
    [
      "the pill's hover back to a `background-color` change",
      () => [
        `${shipped}\n.fo-pill:hover { background-color: var(--color-accent-strong); }`,
        tokenFiles,
      ],
      "pill background",
    ],
    [
      '`--duration-hover` used on `[data-fo-consent-sheet="fixed"]`',
      () => [
        `${shipped}\n[data-fo-consent-sheet="fixed"] { transition-duration: var(--duration-hover); }`,
        tokenFiles,
      ],
      "token scope",
    ],
    [
      "the card rules moved out of `(hover: hover) and (pointer: fine)`",
      () => [
        swap(
          "@media (hover: hover) and (pointer: fine) {\n    a[data-fo-card-motion],",
          "@media (hover: hover) {\n    a[data-fo-card-motion],",
        ),
        tokenFiles,
      ],
      "lift",
    ],
    [
      "the line's resting `scaleX(1)` dropped under reduce",
      () => [
        swap(
          /(@media \(prefers-reduced-motion: reduce\) \{\s*\[data-fo-card-line\] \{\s*)transform: scaleX\(1\);/,
          "$1",
        ),
        tokenFiles,
      ],
      "reduce line rest",
    ],
    ...(
      [
        [
          "`.fo-pill` without `isolation`",
          /(\.fo-pill \{\s*position: relative;\s*)isolation: isolate;/,
          "$1",
          "pill isolation",
        ],
        [
          "the layer over the label",
          /(\.fo-pill::before \{[^}]*?z-index: )-1;/,
          "$11;",
          "pill layer under label",
        ],
        [
          "the layer's inset at 0 for every variant",
          /inset: var\(--fo-pill-inset, 0\);/,
          "inset: 0;",
          "pill layer inset",
        ],
        [
          "the layer in a fixed colour",
          /(\.fo-pill::before \{[^}]*?background-color: )var\(--fo-pill-hover\);/,
          "$1var(--color-accent-strong);",
          "pill layer colour",
        ],
        [
          "the pressed layer in the hover colour only",
          /background-color: var\(--fo-pill-active, var\(--fo-pill-hover\)\);/,
          "background-color: var(--fo-pill-hover);",
          "pill pressed colour",
        ],
        [
          "the shadow layer's inset at -40px",
          /(\[data-fo-card-shadow\] \{\s*position: absolute;\s*inset: )0;/,
          "$1-40px;",
          "shadow inset",
        ],
        [
          "the shadow layer's radius at 0",
          /(\[data-fo-card-shadow\] \{[^}]*?border-radius: )var\(--radius-photo-s\);/,
          "$10;",
          "shadow radius",
        ],
        [
          "the shadow layer's md radius at 0",
          /(@media \(min-width: 48rem\) \{\s*\[data-fo-card-shadow\] \{\s*border-radius: )var\(--radius-photo\);/,
          "$10;",
          "shadow radius md",
        ],
        [
          "the press wrapped in the fine-pointer query",
          /(\.fo-pill:active \{\s*transform: scale\(0\.98\);[^}]*\})/,
          "@media (hover: hover) and (pointer: fine) { $1 }",
          "press on every pointer",
        ],
      ] as const
    ).map(
      ([what, from, to, red]) =>
        [what, () => [swap(from, to), tokenFiles], red] as [
          string,
          () => [string, readonly string[]],
          string,
        ],
    ),
  ];

  for (const [what, mutate, red] of MUTATIONS) {
    it(`goes red on ${red} with ${what}`, () => {
      const [css, tokens] = mutate();
      expect(motion6Violations(css, tokens)).toContain(red);
    });
  }
});

/*
 * T-48 and T-06 for the four motions TASK-194 left (TASK-283; spec 004 §14 A24 clause 9 (e)):
 * motion 5 (the home H1's underline), motion 13 (the 404's route) and motion 10's close half,
 * read rule by rule from the shipped stylesheet. Motion 3's reach is markup
 * (`motion-markup.test.tsx`) and browser behaviour (`tests/e2e/motion.spec.ts` section 9).
 * `motion283Violations` names each value it cannot find where the sheet puts it; the shipped CSS
 * gives none, and each mutation below (a motion taken away, moved outside `no-preference`, or
 * made to animate a property AC-44 forbids) gives the one it breaks.
 */
function motion283Violations(css: string): string[] {
  const rules = walk(css).map((rule) => ({
    ...rule,
    selectors: rule.selector
      .replaceAll(/\s+/g, " ")
      .split(",")
      .map((part) => part.trim()),
  }));
  const found: string[] = [];
  const where = {
    rest: (context: readonly string[]): boolean => context.length === 0,
    moving: (context: readonly string[]): boolean =>
      context.some(MOVES) && !context.some(REDUCE),
  };
  /** The value of `property` on `selector` in the last rule whose at-rules `test` accepts. */
  const value = (
    selector: string,
    property: string,
    test: (context: readonly string[]) => boolean,
  ): string | undefined =>
    rules
      .filter(
        (rule) =>
          rule.selectors.includes(selector) &&
          test(rule.context) &&
          rule.declarations.has(property),
      )
      .at(-1)
      ?.declarations.get(property);
  const expectValue = (
    name: string,
    selector: string,
    property: string,
    expected: string,
    test: (context: readonly string[]) => boolean,
  ): void => {
    if (value(selector, property, test) !== expected) found.push(name);
  };
  /** The declarations of one `@keyframes`, frame by frame. */
  const frames = (name: string): string[] =>
    rules
      .filter((rule) => rule.context.at(-1) === `@keyframes ${name}`)
      .map((rule) =>
        [...rule.declarations]
          .map(([property, declared]) => `${property}: ${declared}`)
          .join("; "),
      );

  // Motion 5: 600 ms, `--ease-emphasised`, 500 ms after load, once, `stroke-dashoffset` on the
  // inline SVG; drawn whole at rest (no dash), so reduced motion and no animation show it drawn.
  const UNDERLINE = "#hero-heading [data-fo-em] path";
  if (
    frames("fo-underline-draw").join(" | ") !==
    "stroke-dashoffset: 300 | stroke-dashoffset: 0"
  ) {
    found.push("5 keyframes");
  }
  expectValue(
    "5 draw",
    UNDERLINE,
    "animation",
    "fo-underline-draw var(--duration-draw) var(--ease-emphasised) 500ms 1 backwards",
    where.moving,
  );
  expectValue("5 dash", UNDERLINE, "stroke-dasharray", "300", where.moving);
  expectValue("5 paint", UNDERLINE, "stroke", "var(--color-sun)", where.rest);
  if (value(UNDERLINE, "stroke-dasharray", where.rest) !== undefined) {
    found.push("5 hidden at rest");
  }
  expectValue(
    "5 out of flow",
    "#hero-heading [data-fo-em] > svg",
    "position",
    "absolute",
    where.rest,
  );
  expectValue(
    "5 anchored",
    "#hero-heading [data-fo-em]",
    "position",
    "relative",
    where.rest,
  );

  // Motion 13: 1,200 ms, `--ease-standard`, once, a cover in the document's paper over the
  // dashed route; rolled away at rest, so the route is drawn without the animation.
  const COVER = "[data-fo-notice-route-cover]";
  if (
    frames("fo-route-unroll").join(" | ") !==
    "stroke-dashoffset: 0 | stroke-dashoffset: -1"
  ) {
    found.push("13 keyframes");
  }
  expectValue(
    "13 draw",
    COVER,
    "animation",
    "fo-route-unroll var(--duration-bloom) var(--ease-standard) 1 backwards",
    where.moving,
  );
  expectValue(
    "13 paper",
    COVER,
    "stroke",
    "var(--color-surface-raised)",
    where.rest,
  );
  expectValue("13 dash", COVER, "stroke-dasharray", "1 1", where.rest);
  expectValue("13 rolled away", COVER, "stroke-dashoffset", "-1", where.rest);

  // Motion 10's close half: the fade under either preference, the movement only under
  // `no-preference`, each the start state its opening came from.
  const MENU = "details[data-fo-menu][data-fo-closing] [data-fo-menu-panel]";
  const SHEET = '[data-fo-consent-sheet="fixed"][data-fo-closing]';
  expectValue("10 menu fade", MENU, "opacity", "0", where.rest);
  expectValue("10 sheet fade", SHEET, "opacity", "0", where.rest);
  expectValue(
    "10 menu rise",
    MENU,
    "transform",
    "translateY(-8px)",
    (context) => where.moving(context) && context.length === 1,
  );
  expectValue(
    "10 sheet edge",
    SHEET,
    "transform",
    "translateY(100%)",
    (context) => where.moving(context) && context.length === 1,
  );
  expectValue(
    "10 sheet 8 px from sm",
    SHEET,
    "transform",
    "translateY(8px)",
    (context) =>
      where.moving(context) && context.some((at) => at.includes("40rem")),
  );
  expectValue(
    "10 sheet on the action bar",
    `body:has([data-fo-action-bar]) ${SHEET}`,
    "transform",
    "none",
    (context) =>
      where.moving(context) && context.some((at) => at.includes("48rem")),
  );

  // Nothing of the four moves outside `no-preference`.
  for (const rule of rules) {
    const ours = rule.selectors.some((selector) =>
      /#hero-heading \[data-fo-em\]|data-fo-notice-route-cover|data-fo-closing/.test(
        selector,
      ),
    );
    if (
      ours &&
      (rule.declarations.has("animation") ||
        rule.declarations.has("transform") ||
        rule.declarations.has("transition-property")) &&
      !where.moving(rule.context)
    ) {
      found.push(`reduced motion: ${rule.selectors.join(", ")}`);
    }
  }
  return found;
}

describe("TASK-283: motions 5, 13 and 10's close half, value for value (T-48, T-06)", () => {
  const swap = (from: string | RegExp, to: string): string => {
    const mutated = shipped.replace(from, to);
    expect(mutated, `mutation ${String(from)}`).not.toBe(shipped);
    return mutated;
  };

  it("finds every value where the sheet puts it", () => {
    expect(motion283Violations(shipped)).toEqual([]);
  });

  const MUTATIONS: readonly [string, () => string, string][] = [
    [
      "motion 5 taken away",
      () => swap(/animation: fo-underline-draw[^;]*;/, ""),
      "5 draw",
    ],
    [
      "motion 5 at once, with no 500 ms wait",
      () =>
        swap(
          /(fo-underline-draw var\(--duration-draw\) var\(--ease-emphasised\))\s+500ms/,
          "$1 0ms",
        ),
      "5 draw",
    ],
    [
      "motion 5's line dashed at rest (hidden without the animation)",
      () =>
        swap(
          /(#hero-heading \[data-fo-em\] path \{\s*fill: none;)/,
          "$1 stroke-dasharray: 300; stroke-dashoffset: 300;",
        ),
      "5 hidden at rest",
    ],
    [
      "motion 5 drawn under reduced motion too",
      () =>
        `${shipped}\n#hero-heading [data-fo-em] path { animation: fo-underline-draw 600ms; }`,
      "reduced motion: #hero-heading [data-fo-em] path",
    ],
    [
      "motion 5 animating `width`",
      () => swap(/(@keyframes fo-underline-draw \{\s*from \{)/, "$1 width: 0;"),
      "5 keyframes",
    ],
    [
      "motion 13 taken away",
      () => swap(/animation: fo-route-unroll[^;]*;/, ""),
      "13 draw",
    ],
    [
      "motion 13's cover in another colour than the document's paper",
      () =>
        swap(
          /(\[data-fo-notice-route-cover\] \{\s*fill: none;\s*stroke: )var\(--color-surface-raised\)/,
          "$1var(--color-surface)",
        ),
      "13 paper",
    ],
    [
      "motion 13 covering the route at rest",
      () =>
        swap(
          /(\[data-fo-notice-route-cover\] \{[^}]*stroke-dashoffset: )-1/,
          "$10",
        ),
      "13 rolled away",
    ],
    [
      "motion 13 animating `stroke-width`",
      () =>
        swap(
          /(@keyframes fo-route-unroll \{\s*from \{)/,
          "$1 stroke-width: 0;",
        ),
      "13 keyframes",
    ],
    [
      "the Menu's close fade taken away",
      () =>
        swap(
          /(details\[data-fo-menu\]\[data-fo-closing\] \[data-fo-menu-panel\],\s*\[data-fo-consent-sheet="fixed"\]\[data-fo-closing\] \{\s*)opacity: 0;/,
          "$1",
        ),
      "10 menu fade",
    ],
    [
      "the Menu closing with no rise",
      () =>
        swap(
          /(details\[data-fo-menu\]\[data-fo-closing\] \[data-fo-menu-panel\] \{\s*transform: )translateY\(-8px\)/,
          "$1none",
        ),
      "10 menu rise",
    ],
    [
      "the consent sheet's close moving under reduced motion",
      () =>
        `${shipped}\n@media (prefers-reduced-motion: reduce) { [data-fo-consent-sheet="fixed"][data-fo-closing] { transform: translateY(8px); } }`,
      'reduced motion: [data-fo-consent-sheet="fixed"][data-fo-closing]',
    ],
  ];
  for (const [name, mutate, broken] of MUTATIONS) {
    it(`goes red with ${name}`, () => {
      expect(motion283Violations(mutate())).toContain(broken);
    });
  }

  it("goes red under AC-44's property scan when a new motion animates a layout property", () => {
    expect(
      disallowedMotion(
        swap(/(@keyframes fo-underline-draw \{\s*from \{)/, "$1 width: 0;"),
      ),
    ).toContain("@keyframes fo-underline-draw: width");
    expect(
      disallowedMotion(
        `${shipped}\n[data-fo-consent-sheet="fixed"][data-fo-closing] { transition-property: height; }`,
      ),
    ).toContain(
      '[data-fo-consent-sheet="fixed"][data-fo-closing]: transition height',
    );
  });
});
