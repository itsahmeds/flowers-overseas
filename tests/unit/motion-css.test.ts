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
    /data-fo-(nav|bloom|pending|shimmer|pick|ring|language-popup|menu|consent-sheet|fade|reveal)/;

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
