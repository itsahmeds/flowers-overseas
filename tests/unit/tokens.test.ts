/**
 * T-01 / AC-1 (TASK-045, TASK-175): the built CSS declares every documented token with a non-empty
 * value, every utility the design system promises exists, and removing a token fails **by name**.
 *
 * Since spec 004 §14 A21 the documented token set is `docs/design/system/tokens.css` (v2, "the
 * letter home"): every token it declares must be in the `@theme` block **with the same value**,
 * except the three family stacks, whose heads are the self-hosted `next/font/local` variables.
 * The list below adds the code-side tokens the design file has no use for (Tailwind's container
 * and line-height pairs) and keeps §2's original contract by name.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { findArbitraryColourUtility } from "../../eslint/fo/no-raw-color.js";
import { findPhysicalUtility } from "../../eslint/fo/no-physical-css.js";
import { parseThemeTokens } from "../../src/modules/ui/tokens/contrast.ts";
import {
  compileGlobalsCss,
  compileScannedCss,
  GLOBALS_CSS,
  globalsSources,
} from "./support/tailwind.ts";

const repoRoot = resolve(__dirname, "../..");
const source = readFileSync(resolve(repoRoot, GLOBALS_CSS), "utf8");
const built = await compileGlobalsCss(repoRoot);

/** The design-side token set (A21 clause 1: the v2 system files are the source of truth). */
const DESIGN_TOKENS_FILE = "docs/design/system/tokens.css";
const designTokens = parseDesignTokens(
  readFileSync(resolve(repoRoot, DESIGN_TOKENS_FILE), "utf8"),
);

/** `:root { … }` declarations of the design file, one per line, comments stripped. */
function parseDesignTokens(css: string): Map<string, string> {
  const block = css
    .slice(css.indexOf(":root {") + 7, css.lastIndexOf("}"))
    .replaceAll(/\/\*[\s\S]*?\*\//g, "");
  const tokens = new Map<string, string>();
  for (const declaration of block.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    const name = declaration.slice(0, colon).trim();
    if (!name.startsWith("--")) continue;
    tokens.set(
      name,
      declaration
        .slice(colon + 1)
        .replaceAll(/\s+/g, " ")
        .trim(),
    );
  }
  return tokens;
}

/** The family stacks, whose heads differ by design (self-hosted variables, not family names). */
const FONT_STACKS = ["--font-display", "--font-body", "--font-hand"] as const;

/** §2's token contract plus A21's additions. Grouped exactly as the `@theme` block is. */
const REQUIRED_TOKENS = {
  design: [...designTokens.keys()],
  codeSide: [
    "--container-prose",
    "--container-lede",
    "--container-page",
    "--text-hero-fluid--line-height",
    "--text-display-fluid--line-height",
    "--text-title-fluid--line-height",
    "--text-3xl-fluid--line-height",
    "--text-2xl-fluid--line-height",
  ],
  // §2's original names, kept so a v3 cannot drop one silently.
  section2: [
    "--color-surface",
    "--color-surface-raised",
    "--color-surface-muted",
    "--color-ink-muted",
    "--color-brand",
    "--color-on-brand",
    "--color-accent",
    "--color-on-accent",
    "--color-border",
    "--color-border-strong",
    "--color-focus",
    "--color-success",
    "--color-on-success",
    "--color-warning",
    "--color-on-warning",
    "--color-danger",
    "--color-on-danger",
    "--measure",
    "--radius-full",
    "--duration-fast",
    "--ease-standard",
    "--layer-header",
    "--layer-banner",
    "--layer-overlay",
  ],
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

  it("keeps the shipped type steps fluid between the two artboards", () => {
    for (const token of [
      "--text-hero-fluid",
      "--text-display-fluid",
      "--text-title-fluid",
      "--text-3xl-fluid",
      "--text-2xl-fluid",
      "--text-lede-fluid",
    ]) {
      expect(tokens.get(token), token).toContain("clamp(");
    }
  });

  it("pairs the heading steps with the typography sheet's line height and tracking", () => {
    for (const [token, lineHeight, tracking] of [
      ["--text-hero-fluid", "0.96", "-0.03em"],
      ["--text-display-fluid", "0.98", "-0.03em"],
      ["--text-title-fluid", "0.98", "-0.025em"],
      ["--text-3xl-fluid", "1.04", "-0.015em"],
      ["--text-2xl-fluid", "1.08", "-0.015em"],
    ] as const) {
      expect(tokens.get(`${token}--line-height`), token).toBe(lineHeight);
      expect(tokens.get(`${token}--letter-spacing`), token).toBe(tracking);
    }
  });

  it("names a missing token in the failure, not just 'undefined' (AC-1)", async () => {
    const broken = source.replace("--color-ink-3: oklch(50% 0.04 285);", "");
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
  it("emits the design system's voices and marks", () => {
    for (const utility of [
      ".display",
      ".display-em",
      ".label",
      ".eyebrow",
      ".num",
      ".link",
      ".link-inline",
      ".photo",
      ".airmail-edge",
      ".airmail-edge-footer",
      ".surface-inverse",
    ]) {
      expect(built, utility).toContain(utility);
    }
    // The airmail edge paints the token stripe at the block start, logically (A21 clause 2).
    expect(built).toMatch(
      /\.airmail-edge\s*\{[\s\S]*?inset-block-start: 0[\s\S]*?background: var\(--airmail-edge\)/,
    );
    // A heading's one italic phrase is Fraunces 300 italic poppy (nested `& em` until the build
    // flattens it).
    expect(built).toMatch(
      /\.display(?: em\s*\{|\s*\{[^}]*?& em\s*\{)[^}]*font-style: italic[^}]*font-weight: var\(--font-weight-display-em\)[^}]*color: var\(--color-accent\)/,
    );
    // `.label` is the printed-label voice: 0.14em, uppercase.
    expect(built).toMatch(
      /\.label\s*\{[^}]*letter-spacing:\s*var\(--tracking-label\)/,
    );
    expect(parseThemeTokens(source).get("--tracking-label")).toBe("0.14em");
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

  const tokens2 = parseThemeTokens(source);

  it("gives every document one focus ring from the focus tokens", () => {
    expect(built).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*var\(--focus-ring\)/,
    );
    expect(built).toMatch(
      /:focus-visible\s*\{[^}]*outline-offset:\s*var\(--focus-offset\)/,
    );
    expect(tokens2.get("--focus-ring")).toBe("2.5px solid var(--color-focus)");
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

/**
 * What actually ships (`/review 27` required change 1).
 *
 * `built` above answers "does this utility compile?": Tailwind's `build()` emits CSS for whatever
 * candidate list it is given, so it cannot notice a file that should never have been scanned.
 * `shipped` is the other artefact — the stylesheet Tailwind's own scanner produces from the
 * `@source` configuration, i.e. what `next build` puts in `.next/static/chunks/*.css` before the
 * minifier rewrites colours. The lint fixtures under `tests/fixtures/lint/` are deliberately
 * invalid (`bg-[#ff0000]`, `text-[rgb(0,0,0)]`, `border-[hsl(210_10%_50%)]`, `ml-4`, `text-left`,
 * `left-0`) and Tailwind's automatic source detection compiled all of them, plus the examples in
 * specs, docs and the ESLint rules' own documentation, into the production stylesheet. These
 * assertions are what stop that returning.
 */
const shipped = await compileScannedCss(repoRoot);

describe("the stylesheet that ships (AC-1, AC-5)", () => {
  /** Every class selector in the shipped CSS, unescaped back to its Tailwind spelling. */
  const shippedClasses = [
    ...new Set(
      [...shipped.matchAll(/\.((?:\\.|[\w-])+)/g)].map((match) =>
        (match[1] ?? "").replaceAll("\\", ""),
      ),
    ),
  ];

  it("scans one explicit source glob and nothing else", async () => {
    // `source(none)` plus a single `@source`: no walking up into `tests/`, `docs/` or `specs/`.
    expect(source).toContain('@import "tailwindcss" source(none);');
    const sources = await globalsSources(repoRoot);
    expect(
      sources.map((entry) => ({
        pattern: entry.pattern,
        negated: entry.negated,
      })),
    ).toEqual([{ pattern: "../../src/**/*.{ts,tsx}", negated: false }]);
  });

  it("does not ship the lint fixtures' utilities", async () => {
    const LEAKS = [
      "#ff0000",
      "hsl(",
      "rgb(0,0,0)",
      ".ml-4",
      ".text-left",
      ".left-0",
    ];
    // The fixtures still say what the rule tests need them to say…
    const fixture = (name: string) =>
      readFileSync(resolve(repoRoot, "tests/fixtures/lint", name), "utf8");
    expect(fixture("raw-color.tsx")).toContain("bg-[#ff0000]");
    expect(fixture("physical-css.tsx")).toContain("ml-4");
    // …and an unscoped scan of the same repository still compiles them, so this test measures the
    // `@source` configuration and not the absence of the fixtures.
    const unscoped = await compileScannedCss(repoRoot, [
      { base: repoRoot, pattern: "**/*", negated: false },
    ]);
    for (const leak of LEAKS) expect(unscoped, leak).toContain(leak);
    // …while nothing of it reaches the stylesheet the build emits.
    for (const leak of LEAKS) expect(shipped, leak).not.toContain(leak);
  });

  it("ships no physical-direction utility, by the rule's own tables (AC-5)", () => {
    // The tables live in `fo/no-physical-css`; reusing them means one place lists `ml-`/`text-left`
    // and the stylesheet is held to exactly what the linter bans.
    const offenders = shippedClasses.filter(
      (candidate) => findPhysicalUtility(candidate) !== null,
    );
    expect(offenders).toEqual([]);
  });

  it("ships no arbitrary-value colour utility, by the rule's own tables (AC-1)", () => {
    const offenders = shippedClasses.filter(
      (candidate) => findArbitraryColourUtility(candidate) !== null,
    );
    expect(offenders).toEqual([]);
  });

  it("writes every colour literal into a custom property and nowhere else (AC-1)", () => {
    // In the built CSS the `@theme` block has become `:root` custom-property declarations, so
    // "inside @theme" reads as "the value of a `--*` declaration". Two upstream exceptions, both
    // from `tailwindcss`'s own preflight rather than from this repository: `@property`'s
    // `initial-value` descriptors for the `--tw-*` registers, and the `@supports` feature test
    // `color: rgb(from red r g b)` that detects relative colour syntax.
    const paint = shipped
      // Every custom-property declaration, however many lines its value wraps over, and
      // `@property`'s `initial-value` descriptor.
      .replaceAll(/(?:--[\w-]+|initial-value)\s*:[^;}]*[;}]?/g, "")
      // `@supports` conditions name colour syntax to feature-detect it, they do not paint.
      .replaceAll(/@supports[^{]*\{/g, "");
    expect(paint).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(paint).not.toMatch(
      /(?<![a-z-])(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\s*\(/,
    );
  });
});

/**
 * The founder-approved canvas is the source of truth for token *values* (`/review 27` nit 8).
 *
 * `docs/design/homepage-v1/tokens.css` is what the founder signed off; the `@theme` block is its
 * implementation. Until now only the token *names* were pinned, so a hue nudge or a type-step
 * change here would have shipped silently — the same drift `ui-icons.test.tsx` prevents between
 * `Mark` and `content/brand/mark.svg`. Each transform below is an intended, documented difference
 * (self-hosted font variables, fluid type, Tailwind's `--spacing-*` namespace); everything else
 * must match value for value. A founder-approved palette change therefore edits the canvas and the
 * `@theme` block in one diff, and this test names the token that fell behind.
 */
describe("token values against design system v2 (A21 clauses 2–3, T-01)", () => {
  const theme = parseThemeTokens(source);

  it.each(
    [...designTokens.keys()].filter((t) => !FONT_STACKS.includes(t as never)),
  )("declares %s with docs/design/system/tokens.css's value", (token) => {
    // Prettier wraps a long gradient over lines; whitespace inside parentheses is not a value.
    const flat = (value: string | undefined) =>
      value?.replaceAll(/\(\s+/g, "(").replaceAll(/\s+\)/g, ")");
    expect(
      flat(theme.get(token)),
      `${token} is missing from the @theme block, or differs`,
    ).toBe(flat(designTokens.get(token)));
  });

  it("carries A21's named palette values exactly", () => {
    // The table in docs/design/README.md "A21 clause 2 names → tokens.css".
    for (const [token, value] of [
      ["--color-paper", "oklch(99.8% 0.002 85)"],
      ["--color-paper-2", "oklch(98.9% 0.006 85)"],
      ["--color-card", "oklch(100% 0 0)"],
      ["--color-ink", "oklch(25% 0.06 285)"],
      ["--color-ink-2", "oklch(42% 0.05 285)"],
      ["--color-ink-3", "oklch(50% 0.04 285)"],
      ["--color-accent", "oklch(54% 0.2 30)"],
      ["--color-accent-strong", "oklch(47% 0.19 30)"],
      ["--color-sky", "oklch(48% 0.16 262)"],
      ["--color-sky-strong", "oklch(40% 0.15 262)"],
      ["--color-sun", "oklch(87% 0.15 92)"],
      ["--color-stem", "oklch(44% 0.1 155)"],
      ["--color-blush", "oklch(93.5% 0.04 30)"],
      ["--color-butter", "oklch(96.5% 0.055 95)"],
      ["--color-sage-wash", "oklch(94% 0.03 250)"],
      ["--color-leaf-wash", "oklch(94.5% 0.04 155)"],
      ["--color-logo-ink", "oklch(19% 0.01 250)"],
      ["--color-logo-accent", "oklch(42% 0.1 155)"],
    ] as const) {
      expect(theme.get(token), token).toBe(value);
    }
  });

  it("heads the three family stacks with the self-hosted variables, Latin-Ext first", () => {
    expect(theme.get("--font-display")).toBe(
      "var(--font-fraunces-ext), var(--font-fraunces)",
    );
    expect(theme.get("--font-body")).toBe(
      "var(--font-alegreya-ext), var(--font-alegreya)",
    );
    expect(theme.get("--font-hand")).toMatch(
      /^var\(--font-caveat-ext, "Caveat"\), var\(--font-caveat, "Bradley Hand"\)/,
    );
    // The design file names the families as strings; nothing in the theme names Newsreader
    // except the logo token, which no rule uses to load a face.
    for (const token of FONT_STACKS) {
      expect(theme.get(token), token).not.toContain("Newsreader");
    }
  });
});
