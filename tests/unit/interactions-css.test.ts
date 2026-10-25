/**
 * Spec 042 T-3 (unit, shipped CSS) and AC-3, AC-4's stylesheet half for idea 1, the photo morph
 * (motion 14; TASK-307). TASK-313 and every later idea extend this file with their own rows.
 *
 * Read from the **shipped** stylesheet (`compileScannedCss`, the same compiler and source scan as
 * `next build`; `tests/unit/motion-css.test.ts` holds the shared AC-44 scan):
 *
 *  - **No static opt-in.** The shipped stylesheet has no `@view-transition` rule at all: a page with
 *    cards opts in only when the motion module sees a card link activated, so a header, breadcrumb
 *    or pagination link never transitions (AC-8; red with `navigation: auto` left in the sheet).
 *  - **Inside both conditions.** Every view-transition pseudo-element rule, the root's
 *    `view-transition-name: none` and the card box's sizing sit inside one `@media` that holds both
 *    `prefers-reduced-motion: no-preference` and `min-width: 64rem` (AC-4, AC-8; red with the rule
 *    moved out of the `no-preference` query, and with the `lg` query removed).
 *  - **The values.** The group runs `--duration-slow` on `--ease-emphasised` (AC-7; red with
 *    `--duration-base`); the hero fades in on `fo-morph-in` over `--duration-base` on
 *    `--ease-standard`, opacity only; the card's photograph does not animate; a photograph with no
 *    partner shows at rest; the root is not captured (red with the root crossfade left on).
 *  - **Transform only** (AC-3): `fo-morph-in` animates `opacity` alone; no rule here names a raw
 *    duration; the card box's hero width is the product page's frame and grid, in step with
 *    `PAGE_FRAME` and `G12`, the classes the product page lays its hero out with.
 */
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { G12 } from "../../src/modules/ui/product/ProductPage.tsx";
import { PAGE_FRAME } from "../../src/modules/ui/primitives/layout.tsx";

import { type CssRule, cssRules } from "./support/css-rules.ts";
import { compileScannedCss } from "./support/tailwind.ts";

const repoRoot = resolve(__dirname, "../..");
const shipped = await compileScannedCss(repoRoot);
const rules = cssRules(shipped);

const MORPH_CONTEXT = (rule: CssRule): boolean =>
  rule.context.some(
    (at) =>
      at.startsWith("@media") &&
      at.includes("prefers-reduced-motion: no-preference") &&
      at.includes("min-width: 64rem"),
  );

/** The one rule with this exact selector, wherever it sits. */
function only(selector: string): CssRule {
  const found = rules.filter((rule) => rule.selector === selector);
  expect(found, selector).toHaveLength(1);
  return found[0] as CssRule;
}

/** Every rule that belongs to motion 14. */
const morphRules = rules.filter(
  (rule) =>
    rule.selector.includes("::view-transition") ||
    rule.selector.includes("[data-fo-morph-from]") ||
    rule.declarations.has("view-transition-name"),
);

describe("idea 1, the morph: no page opts in from the shared stylesheet (AC-8)", () => {
  it("ships no `@view-transition` rule", () => {
    expect(shipped).not.toMatch(/@view-transition/);
  });
});

describe("idea 1, the morph: everything sits inside no-preference and lg (AC-4, AC-8)", () => {
  it("finds the rules (the check below is not vacuous)", () => {
    expect(morphRules.length).toBeGreaterThanOrEqual(7);
  });

  it.each(morphRules.map((rule) => [rule.selector, rule] as const))(
    "%s",
    (_selector, rule) => {
      expect(MORPH_CONTEXT(rule)).toBe(true);
    },
  );

  it("does not capture the root, so only the photograph moves", () => {
    const roots = rules.filter(
      (rule) =>
        rule.selector === ":root" &&
        rule.declarations.has("view-transition-name"),
    );
    expect(roots).toHaveLength(1);
    expect(roots[0]?.declarations.get("view-transition-name")).toBe("none");
  });
});

describe("idea 1, the morph: the values (AC-7, AC-3)", () => {
  it("runs the group over --duration-slow on --ease-emphasised", () => {
    const group = only("::view-transition-group(*)").declarations;
    expect(group.get("animation-duration")).toBe("var(--duration-slow)");
    expect(group.get("animation-timing-function")).toBe(
      "var(--ease-emphasised)",
    );
    // The artboard's "Corners": the pair is clipped to the photograph's radius, hero-sized.
    expect(group.get("border-radius")).toBe("var(--radius-photo)");
    expect(group.get("overflow")).toBe("clip");
    // The UA's keyframes stay; only their timing is set, so no `width` keyframe is added here.
    expect(group.has("animation")).toBe(false);
    expect(group.has("animation-name")).toBe(false);
  });

  it("fades the hero in over --duration-base on --ease-standard and keeps the card's under it", () => {
    expect(only("::view-transition-new(*)").declarations.get("animation")).toBe(
      "fo-morph-in var(--duration-base) var(--ease-standard) both",
    );
    expect(
      only("::view-transition-new(*)").declarations.get("mix-blend-mode"),
    ).toBe("normal");
    expect(only("::view-transition-old(*)").declarations.get("animation")).toBe(
      "none",
    );
  });

  it("shows a photograph with no partner at rest", () => {
    expect(
      only(
        "::view-transition-old(*):only-child, ::view-transition-new(*):only-child",
      ).declarations.get("animation"),
    ).toBe("none");
  });

  it("animates opacity alone in fo-morph-in", () => {
    const frames = rules.filter((rule) =>
      rule.context.includes("@keyframes fo-morph-in"),
    );
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect([...frame.declarations.keys()]).toEqual(["opacity"]);
    }
  });

  it("names no raw duration", () => {
    for (const rule of morphRules) {
      for (const value of rule.declarations.values()) {
        expect(value, rule.selector).not.toMatch(/\d(ms|s)\b/);
      }
    }
  });
});

describe("idea 1, the morph: the card box takes the hero's width (transform only, AC-3, AC-7)", () => {
  const box = only("[data-fo-morph-from]").declarations;

  it("scales the hero-wide box back to the card about its inline-start top corner", () => {
    expect(box.get("inline-size")).toBe("var(--fo-morph-hero)");
    expect(box.get("transform")).toBe("scale(var(--fo-morph-k))");
    expect(box.get("transform-origin")).toBe("0 0");
    expect(
      only('[dir="rtl"] [data-fo-morph-from]').declarations.get(
        "transform-origin",
      ),
    ).toBe("100% 0");
    // A 4∶5 box: the height the wider box adds is given back, so nothing below the card moves.
    expect(box.get("margin-block-end")).toBe(
      "calc( 1.25 * var(--fo-morph-hero) * (var(--fo-morph-k) - 1) )",
    );
  });

  it("computes the hero's width from the product page's own frame and grid", () => {
    // `PAGE_FRAME`: the content is `--container-page` wide at most, inside `--gutter` from `md` up.
    expect(PAGE_FRAME).toContain(
      "max-w-[calc(var(--container-page)+2*var(--gutter))]",
    );
    expect(PAGE_FRAME).toContain("md:px-(--gutter)");
    // `G12`: twelve columns and this gap; the hero is columns 2 to 7, (content − gap) / 2.
    const gap = /gap-x-\[([^\]]+)\]/.exec(G12)?.[1];
    expect(G12).toContain("lg:grid-cols-12");
    expect(gap).toBe("clamp(24px,2.22vw,32px)");
    expect(box.get("--fo-morph-hero")?.replaceAll(" ", "")).toBe(
      `calc((min(var(--fo-morph-vw)-2*var(--gutter),var(--container-page))-${String(gap)})/2)`,
    );
  });
});
