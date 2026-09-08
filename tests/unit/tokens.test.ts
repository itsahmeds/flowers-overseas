/**
 * T-01 / AC-1 (TASK-045): the built CSS declares every documented token with a non-empty value,
 * every utility the design system promises exists, and removing a token fails **by name**.
 *
 * The list below is the contract of spec 004 §2 "Tokens" turned into data: colour (the canvas ramp
 * plus the semantic aliases), type, space, radii, shadows, motion, layers and `--measure`. A spec
 * that adds a token adds it here, which is what stops the `@theme` block and the documentation
 * from drifting.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseThemeTokens } from "../../src/modules/ui/tokens/contrast.ts";
import { compileGlobalsCss, GLOBALS_CSS } from "./support/tailwind.ts";

const repoRoot = resolve(__dirname, "../..");
const source = readFileSync(resolve(repoRoot, GLOBALS_CSS), "utf8");
const built = await compileGlobalsCss(repoRoot);

/** §2's token contract. Grouped exactly as the `@theme` block is. */
const REQUIRED_TOKENS = {
  colourRamp: [
    "--color-paper",
    "--color-paper-2",
    "--color-paper-3",
    "--color-ink",
    "--color-ink-2",
    "--color-ink-3",
    "--color-rule",
    "--color-accent",
    "--color-accent-strong",
    "--color-accent-ink",
    "--color-photo",
    "--color-photo-stop-1",
    "--color-photo-stop-2",
    "--color-photo-stop-3",
    "--color-photo-ink",
  ],
  semanticColour: [
    "--color-surface",
    "--color-surface-raised",
    "--color-surface-muted",
    "--color-surface-inverse",
    "--color-ink-muted",
    "--color-ink-subtle",
    "--color-on-inverse",
    "--color-brand",
    "--color-on-brand",
    "--color-accent",
    "--color-on-accent",
    "--color-border",
    "--color-border-strong",
    "--color-border-emphasis",
    "--color-focus",
    "--color-success",
    "--color-on-success",
    "--color-warning",
    "--color-on-warning",
    "--color-danger",
    "--color-danger-strong",
    "--color-on-danger",
  ],
  type: [
    "--font-display",
    "--font-body",
    "--font-weight-medium",
    "--text-display",
    "--text-display-s",
    "--text-2xl",
    "--text-xl",
    "--text-lg",
    "--text-md",
    "--text-sm",
    "--text-xs",
    "--measure",
    "--container-prose",
  ],
  space: [
    "--spacing-xs",
    "--spacing-sm",
    "--spacing-md",
    "--spacing-lg",
    "--spacing-xl",
    "--spacing-2xl",
    "--spacing-3xl",
  ],
  shape: [
    "--radius-none",
    "--radius-sm",
    "--radius-md",
    "--radius-full",
    "--rule",
    "--shadow-xs",
    "--shadow-sm",
    "--shadow-md",
  ],
  motion: [
    "--duration-fast",
    "--duration-base",
    "--duration-slow",
    "--ease-standard",
    "--ease-emphasised",
  ],
  layers: ["--layer-header", "--layer-banner", "--layer-overlay"],
} as const;

const ALL_TOKENS = [
  ...new Set(Object.values(REQUIRED_TOKENS).flatMap((group) => [...group])),
];

describe("the @theme token set (T-01 / AC-1)", () => {
  const tokens = parseThemeTokens(source);

  it.each(ALL_TOKENS)("declares %s with a non-empty value", (token) => {
    const value = tokens.get(token);
    expect(value, `${token} is missing from the @theme block`).toBeDefined();
    expect(value?.trim(), token).not.toBe("");
  });

  it("emits every token into the built CSS", () => {
    const missing = ALL_TOKENS.filter((token) => !built.includes(`${token}:`));
    expect(missing).toEqual([]);
  });

  it("keeps the type steps fluid between the two artboards", () => {
    for (const token of [
      "--text-display",
      "--text-display-s",
      "--text-2xl",
      "--text-xl",
    ]) {
      expect(tokens.get(token), token).toContain("clamp(");
    }
  });

  it("pairs the display steps with a line height and a tracking", () => {
    for (const token of ["--text-display", "--text-display-s"]) {
      expect(tokens.get(`${token}--line-height`), token).toBeDefined();
      expect(tokens.get(`${token}--letter-spacing`), token).toBeDefined();
    }
  });

  it("names a missing token in the failure, not just 'undefined' (AC-1)", async () => {
    const broken = source.replace("--color-ink-3: oklch(52% 0.008 250);", "");
    const brokenTokens = parseThemeTokens(broken);
    expect(brokenTokens.get("--color-ink-3")).toBeUndefined();
    // And the built CSS loses it too, which is what a component would notice.
    const brokenBuilt = await compileGlobalsCss(
      repoRoot,
      ["text-ink-subtle"],
      broken,
    );
    expect(brokenBuilt).not.toContain("--color-ink-3:");
  });
});

describe("the utilities the design system promises (AC-1, AC-5, AC-6)", () => {
  it("emits the canvas's three utility classes", () => {
    for (const utility of [".display", ".label", ".photo"]) {
      expect(built, utility).toContain(utility);
    }
    // `.label` is the canvas's printed-label voice, verbatim.
    expect(built).toMatch(/\.label\s*\{[^}]*letter-spacing:\s*0\.14em/);
    expect(built).toMatch(/\.label\s*\{[^}]*text-transform:\s*uppercase/);
    // `.photo` paints the gradient token and no `<img>` (`plan/10` §3).
    expect(built).toMatch(
      /\.photo\s*\{[^}]*background:\s*var\(--color-photo\)/,
    );
  });

  it("emits `mirror-in-rtl` as a `[dir=rtl]` flip and nothing else (AC-5)", () => {
    const rule = /\.mirror-in-rtl\b[\s\S]{0,200}?scaleX\(-1\)/.exec(built);
    expect(rule).not.toBeNull();
    expect(built).toMatch(/dir="rtl"[\s\S]{0,120}?scaleX\(-1\)/);
  });

  it("emits the motion utilities from the duration tokens", () => {
    for (const [utility, token] of [
      [".motion-fast", "--duration-fast"],
      [".motion-base", "--duration-base"],
      [".motion-slow", "--duration-slow"],
    ] as const) {
      expect(built, utility).toContain(utility);
      expect(built, token).toContain(`transition-duration: var(${token})`);
    }
    // Tailwind's own `duration-*` takes milliseconds, so the token names would be swallowed —
    // hence `motion-*`. Asserted so a future rename cannot silently produce no CSS at all, which
    // is what happened once during TASK-045.
    expect(built).not.toContain(".duration-fast");
  });

  it("emits the named z-layer utilities so no component writes a raw z-index", () => {
    for (const [utility, token] of [
      [".layer-header", "--layer-header"],
      [".layer-banner", "--layer-banner"],
      [".layer-overlay", "--layer-overlay"],
    ] as const) {
      expect(built, utility).toContain(utility);
      expect(built, token).toContain(`z-index: var(${token})`);
    }
  });

  it("declares `color-scheme: light` explicitly (§13 Q3: dark mode is token-ready only)", () => {
    expect(built).toContain("color-scheme: light");
    expect(built).not.toContain("prefers-color-scheme: dark");
  });

  it("removes every transition and animation under reduced motion (AC-6)", () => {
    const block =
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n {2}\}/.exec(built);
    expect(block).not.toBeNull();
    const text = block?.[0] ?? "";
    expect(text).toContain("transition-duration: 0.01ms !important");
    expect(text).toContain("animation-duration: 0.01ms !important");
    expect(text).toContain("scroll-behavior: auto !important");
  });

  it("gives every document one focus ring from the focus token", () => {
    expect(built).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/,
    );
    expect(built).toMatch(/:focus-visible\s*\{[^}]*outline-offset:\s*2px/);
  });

  it("has no physical CSS property in the stylesheet (AC-5)", () => {
    // Stylelint enforces this on every run; asserting it here keeps the token file honest even if
    // someone edits it with the linter off.
    for (const physical of [
      "margin-left",
      "margin-right",
      "padding-left",
      "padding-right",
      "border-left",
      "border-right",
      "text-align: left",
      "text-align: right",
    ]) {
      expect(source, physical).not.toContain(physical);
    }
  });

  it("writes every colour literal inside the @theme block and nowhere else (AC-1)", () => {
    // Comments stripped first: this file's own header *documents* the banned forms.
    const withoutComments = source.replaceAll(/\/\*[\s\S]*?\*\//g, "");
    const themeStart = withoutComments.indexOf("@theme");
    const themeEnd = withoutComments.indexOf("\n}", themeStart);
    const outsideTheme =
      withoutComments.slice(0, themeStart) + withoutComments.slice(themeEnd);
    expect(outsideTheme).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // `color-mix(in oklab, …)` is allowed *inside* the theme block (the shadow tokens); outside
    // it, no colour function at all.
    expect(outsideTheme).not.toMatch(
      /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\s*\(/,
    );
  });
});
