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
describe("token values against the approved canvas (AC-1)", () => {
  const canvas = parseCanvasTokens(
    readFileSync(
      resolve(repoRoot, "docs/design/homepage-v1/tokens.css"),
      "utf8",
    ),
  );
  const theme = parseThemeTokens(source);

  /** `:root { … }` declarations, several to a line in the canvas file. */
  function parseCanvasTokens(css: string): Map<string, string> {
    const block = css.slice(css.indexOf("{") + 1, css.lastIndexOf("}"));
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

  /** `oklch(42% 0.10 155)` and `oklch(42% 0.1 155)` are the same colour. */
  const normalise = (value: string) =>
    value.replaceAll(/(\d+\.\d*?)0+\b/g, "$1").replaceAll(/\.(?=\D)/g, "");

  const COLOURS = [
    "--color-paper",
    "--color-paper-2",
    "--color-paper-3",
    "--color-ink",
    "--color-ink-2",
    "--color-ink-3",
    "--color-rule",
    "--color-accent",
    "--color-accent-ink",
  ] as const;

  it.each(COLOURS)("keeps %s at the canvas value", (token) => {
    expect(theme.get(token), token).toBeDefined();
    expect(normalise(theme.get(token) ?? ""), token).toBe(
      normalise(canvas.get(token) ?? "canvas token missing"),
    );
  });

  it("keeps the photo placeholder's gradient stops and geometry", () => {
    const gradient = canvas.get("--color-photo") ?? "";
    // The canvas inlines the three stops; the theme names them, so `--color-photo` can stay a
    // gradient token while the contrast manifest reasons about the darkest stop.
    const stops = [...gradient.matchAll(/oklch\([^)]*\)/g)].map((m) => m[0]);
    expect(stops).toHaveLength(3);
    for (const [index, stop] of stops.entries()) {
      expect(
        normalise(theme.get(`--color-photo-stop-${String(index + 1)}`) ?? ""),
        `stop ${String(index + 1)}`,
      ).toBe(normalise(stop));
    }
    const themeGradient = theme.get("--color-photo") ?? "";
    expect(themeGradient).toContain("160deg");
    for (const position of ["0%", "45%", "100%"]) {
      expect(themeGradient, position).toContain(position);
    }
  });

  it("keeps the two font stacks' fallbacks (the first family is self-hosted)", () => {
    // `next/font/local` hands the family name over as a CSS variable, so the head of the stack is
    // `var(--font-newsreader)` where the canvas writes `"Newsreader"`. The fallbacks — which are
    // what a reader with the font blocked actually sees — must match exactly.
    for (const [token, family] of [
      ["--font-display", "Newsreader"],
      ["--font-body", "IBM Plex Sans"],
    ] as const) {
      const canvasStack = (canvas.get(token) ?? "")
        .split(",")
        .map((f) => f.trim());
      const themeStack = (theme.get(token) ?? "")
        .split(",")
        .map((f) => f.trim());
      expect(canvasStack[0], token).toBe(`"${family}"`);
      expect(themeStack[0], token).toMatch(/^var\(--font-[a-z-]+\)$/);
      expect(themeStack.slice(1), token).toEqual(canvasStack.slice(1));
    }
  });

  /** The canvas's fixed px, and the rem the theme must reach at the largest artboard. */
  const TYPE_STEPS = [
    ["--text-display", 68],
    ["--text-display-s", 42],
    ["--text-2xl", 34],
    ["--text-xl", 24],
    ["--text-lg", 18],
    ["--text-md", 15],
    ["--text-sm", 13],
    ["--text-xs", 11],
  ] as const;

  it.each(TYPE_STEPS)(
    "reaches the canvas's %s at the desktop artboard",
    (token, px) => {
      expect(canvas.get(token), token).toBe(`${String(px)}px`);
      const value = theme.get(token) ?? "";
      // Fluid steps (`clamp(min, preferred, max)`) must top out at the canvas value; fixed steps
      // are the canvas value. Both are expressed in rem so a reader's font size still scales them.
      const rem = value.startsWith("clamp(")
        ? (/,\s*([\d.]+)rem\s*\)$/.exec(value)?.[1] ?? "")
        : (/^([\d.]+)rem$/.exec(value)?.[1] ?? "");
      expect(Number(rem) * 16, `${token} = ${value}`).toBeCloseTo(px, 5);
    },
  );

  it("keeps the space scale, the radii and the hairline", () => {
    for (const step of ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"]) {
      // Tailwind's namespace is `--spacing-*`; the canvas calls it `--space-*`.
      expect(theme.get(`--spacing-${step}`), step).toBe(
        canvas.get(`--space-${step}`),
      );
    }
    for (const radius of ["sm", "md"]) {
      expect(theme.get(`--radius-${radius}`), radius).toBe(
        canvas.get(`--radius-${radius}`),
      );
    }
    expect(theme.get("--rule")).toBe(canvas.get("--rule"));
  });
});
