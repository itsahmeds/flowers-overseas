/**
 * T-04 / AC-3 (TASK-045): every pair in the contrast manifest meets its WCAG threshold, computed
 * **from the token values themselves**, and a token changed to a failing value fails with the pair
 * named.
 *
 * The manifest is `src/modules/ui/tokens/contrast.ts`; the values come from the `@theme` block of
 * `src/app/globals.css`, parsed and `var()`-resolved here. Nothing is restated: that is what makes
 * this a gate on the palette rather than on a copy of it.
 *
 * The last two assertions are the "a component using a pair absent from the manifest fails the
 * same test" half of AC-3, in the strongest form a unit test can hold: **every colour token
 * declared must appear in at least one pair**, so a new colour cannot enter the system without
 * declaring how it may be used, and a `decorative` pair must carry a written reason.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  colorTokenNames,
  CONTRAST_PAIRS,
  CONTRAST_THRESHOLDS,
  contrastRatio,
  evaluateContrastPairs,
  formatContrastTable,
  formatRatio,
  parseOklch,
  parseThemeTokens,
  relativeLuminance,
  resolveColorToken,
} from "../../src/modules/ui/tokens/contrast.ts";

const repoRoot = resolve(__dirname, "../..");
const css = readFileSync(resolve(repoRoot, "src/app/globals.css"), "utf8");
const tokens = parseThemeTokens(css);
const results = evaluateContrastPairs(css);

describe("the OKLCH arithmetic", () => {
  it("parses the canvas notation", () => {
    expect(parseOklch("oklch(42% 0.1 155)")).toEqual({
      l: 0.42,
      c: 0.1,
      h: 155,
    });
    expect(parseOklch("linear-gradient(160deg, red, blue)")).toBeUndefined();
  });

  it("agrees with the sRGB reference points", () => {
    // White and black, to four decimals of relative luminance, and their 21:1 ratio.
    const white = { l: 1, c: 0, h: 0 };
    const black = { l: 0, c: 0, h: 0 };
    expect(relativeLuminance(white)).toBeCloseTo(1, 4);
    expect(relativeLuminance(black)).toBeCloseTo(0, 4);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 2);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 6);
  });

  it("resolves a semantic alias through its var() chain", () => {
    expect(resolveColorToken("--color-surface", tokens)).toEqual(
      resolveColorToken("--color-paper", tokens),
    );
    expect(resolveColorToken("--color-on-brand", tokens)).toEqual(
      resolveColorToken("--color-accent-ink", tokens),
    );
  });

  it("refuses a token that is not a single colour, and names it", () => {
    expect(() => resolveColorToken("--color-photo", tokens)).toThrow(
      /--color-photo is not a single OKLCH colour/,
    );
    expect(() => resolveColorToken("--color-nope", tokens)).toThrow(
      /--color-nope is not declared/,
    );
  });

  it("formats a ratio without Intl and without toFixed", () => {
    expect(formatRatio(5.394)).toBe("5.39");
    expect(formatRatio(7.9)).toBe("7.90");
    expect(formatRatio(21)).toBe("21.00");
  });
});

describe("the declared contrast manifest (T-04 / AC-3)", () => {
  it.each(
    results.map(
      (result) =>
        [
          `${result.foreground} on ${result.background} (${result.kind})`,
          result,
        ] as const,
    ),
  )("%s meets its threshold", (_name, result) => {
    expect(
      result.ratio,
      `${result.foreground} on ${result.background} is ${formatRatio(result.ratio)}:1, below the ${String(result.threshold)}:1 required for ${result.kind} — ${result.usage}`,
    ).toBeGreaterThanOrEqual(result.threshold);
  });

  it("holds the canvas's three low-chroma pairs, which are the risky ones", () => {
    const ratioOf = (foreground: string, background: string): number =>
      contrastRatio(
        resolveColorToken(foreground, tokens),
        resolveColorToken(background, tokens),
      );
    // The `label` voice on paper: 11 px text, so the 4.5:1 body threshold applies. It passes at
    // 5.39:1, which is why no token was darkened (TASK-045 row: "if a canvas pair fails AC-3,
    // darken the token and record the delta").
    expect(ratioOf("--color-ink-3", "--color-paper")).toBeGreaterThanOrEqual(
      4.5,
    );
    // The photo caption over the gradient's lightest stop.
    expect(
      ratioOf("--color-photo-ink", "--color-photo-stop-1"),
    ).toBeGreaterThanOrEqual(4.5);
    // A button label on the accent fill.
    expect(
      ratioOf("--color-accent-ink", "--color-accent"),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("fails with the pair named when a token is darkened past its threshold", () => {
    const broken = css.replace(
      "--color-ink-3: oklch(52% 0.008 250);",
      "--color-ink-3: oklch(78% 0.008 250);",
    );
    expect(broken).not.toBe(css);
    const brokenResults = evaluateContrastPairs(broken);
    const failures = brokenResults.filter((result) => !result.passes);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.map((result) => result.foreground)).toContain(
      "--color-ink-3",
    );
    // The report a reviewer reads names both tokens and the ratio.
    expect(formatContrastTable(failures)).toContain("--color-ink-3");
  });

  it("declares every colour token in at least one pair (AC-3's 'absent from the manifest')", () => {
    const declared = colorTokenNames(tokens);
    const used = new Set(
      CONTRAST_PAIRS.flatMap((pair) => [pair.foreground, pair.background]),
    );
    // Aliases are resolved to the same colour as their target, so a pair naming the alias covers
    // it; what must not happen is a *new* colour with no declared usage.
    const unpaired = declared.filter((token) => {
      if (used.has(token)) return false;
      const colour = tokens.get(token) ?? "";
      // A pure alias of a token that is itself paired is covered by that pair.
      const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(colour)?.[1];
      if (alias !== undefined && used.has(alias)) return false;
      // The gradient composite is not a colour a pair can name; its stops are paired.
      return token !== "--color-photo";
    });
    expect(unpaired).toEqual([]);
  });

  it("requires a written reason for every decorative pair", () => {
    for (const pair of CONTRAST_PAIRS) {
      if (pair.kind !== "decorative") continue;
      expect(
        pair.reason,
        `${pair.foreground} on ${pair.background}`,
      ).toBeDefined();
      expect((pair.reason ?? "").length).toBeGreaterThan(40);
    }
  });

  it("gives every pair a usage sentence a reviewer can check a component against", () => {
    for (const pair of CONTRAST_PAIRS) {
      expect(
        pair.usage.length,
        `${pair.foreground}/${pair.background}`,
      ).toBeGreaterThan(10);
    }
  });

  it("uses the WCAG 2.1 thresholds and no others", () => {
    expect(CONTRAST_THRESHOLDS["body-text"]).toBe(4.5);
    expect(CONTRAST_THRESHOLDS["large-text"]).toBe(3);
    expect(CONTRAST_THRESHOLDS.boundary).toBe(3);
    expect(CONTRAST_THRESHOLDS.focus).toBe(3);
  });
});
