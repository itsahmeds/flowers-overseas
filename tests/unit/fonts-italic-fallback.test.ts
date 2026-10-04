/**
 * The metric-matched fallback for the Fraunces italic (spec 004 §14 A21 clause 3, "matched
 * fallback metrics on every face"; TASK-177, escalation 7).
 *
 * `src/app/globals.css` declares the italic face of "Fraunces Fallback Liberation" over Liberation
 * Serif Italic and Tinos Italic. These cases recompute its overrides from the committed italic
 * file the way Next computes its own fallback faces (`getFallbackMetricsFromFontFile`: the a–z
 * average width over the fallback's, and the ascent and descent over that), with the italic
 * reference instead of Next's roman one, so a re-subset or a hand edit fails here rather than as a
 * shift in CI's browsers.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");
const ITALIC_FILE = "src/modules/ui/fonts/fraunces-300-italic-latin.woff2";
const FAMILY = "Fraunces Fallback Liberation";

/**
 * Times New Roman Italic's a–z average advance, in units of its 2048 em, measured with Next's
 * `calcAverageWidth` string over the macOS file. Liberation Serif Italic and Tinos Italic are
 * metric-compatible clones, so they share it, as Next's own roman constant (854.395) is shared by
 * Liberation Serif.
 */
const TIMES_ITALIC = { azAvgWidth: 846.5581395348837, unitsPerEm: 2048 };

/** Next's sample: letter frequency and word length, spaces included. */
const AVG_CHARACTERS = "aaabcdeeeefghiijklmnnoopqrrssttuvwxyz      ";

interface Glyph {
  readonly advanceWidth: number;
}
interface FontFile {
  readonly ascent: number;
  readonly descent: number;
  readonly lineGap: number;
  readonly unitsPerEm: number;
  glyphsForString(text: string): Glyph[];
}

const nextRequire = createRequire(resolve(repoRoot, "package.json"));
const fontkitModule = nextRequire(
  "next/dist/compiled/@next/font/dist/fontkit",
) as {
  default: ((buffer: Buffer) => FontFile) & {
    default?: (buffer: Buffer) => FontFile;
  };
};
const fontFromBuffer = fontkitModule.default.default ?? fontkitModule.default;

/** Next's `formatOverrideValue`. */
const format = (value: number): string =>
  `${Math.abs(value * 100).toFixed(2)}%`;

/** `100%` → 100; the stylesheet writes `0%` where Next writes `0.00%`. */
const percent = (value: string | undefined): number =>
  Number.parseFloat((value ?? "").replace("%", ""));

/** Every `@font-face` block of `globals.css`, as property maps, in source order. */
function fontFaces(): Map<string, string>[] {
  const css = readFileSync(
    resolve(repoRoot, "src/app/globals.css"),
    "utf8",
  ).replaceAll(/\/\*[\s\S]*?\*\//g, "");
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => {
    const props = new Map<string, string>();
    for (const declaration of (match[1] ?? "").split(";")) {
      const colon = declaration.indexOf(":");
      if (colon === -1) continue;
      props.set(
        declaration.slice(0, colon).trim(),
        declaration.slice(colon + 1).trim(),
      );
    }
    return props;
  });
}

function expectedItalicOverrides() {
  const font = fontFromBuffer(readFileSync(resolve(repoRoot, ITALIC_FILE)));
  const widths = font
    .glyphsForString(AVG_CHARACTERS)
    .map((glyph) => glyph.advanceWidth);
  const average = widths.reduce((sum, width) => sum + width, 0) / widths.length;
  const sizeAdjust =
    average /
    font.unitsPerEm /
    (TIMES_ITALIC.azAvgWidth / TIMES_ITALIC.unitsPerEm);
  const em = font.unitsPerEm * sizeAdjust;
  return {
    "ascent-override": format(font.ascent / em),
    "descent-override": format(font.descent / em),
    "line-gap-override": format(font.lineGap / em),
    "size-adjust": format(sizeAdjust),
  };
}

describe("the Fraunces italic's metric-matched fallback (A21 clause 3)", () => {
  const faces = fontFaces().filter(
    (face) => face.get("font-family")?.replaceAll('"', "") === FAMILY,
  );
  const italic = faces.filter((face) => face.get("font-style") === "italic");
  const roman = faces.filter((face) => face.get("font-style") !== "italic");

  it("is the italic face of the family the display call names first, beside one roman face", () => {
    expect(italic).toHaveLength(1);
    expect(roman).toHaveLength(1);
    expect(roman[0]?.get("font-style") ?? "normal").toBe("normal");
    const fonts = readFileSync(
      resolve(repoRoot, "src/modules/ui/fonts/index.ts"),
      "utf8",
    );
    expect(fonts).toMatch(
      /fraunces-300-italic-latin\.woff2[\s\S]*?fallback:\s*\[\s*"Fraunces Fallback Liberation"/,
    );
  });

  it("is declared over the italic Liberation and Croscore clones only", () => {
    expect(italic[0]?.get("src")).toBe(
      'local("Liberation Serif Italic"), local("Tinos Italic")',
    );
  });

  it("carries the overrides computed from the committed italic file", () => {
    const expected = expectedItalicOverrides();
    for (const [prop, value] of Object.entries(expected)) {
      expect(percent(italic[0]?.get(prop)), prop).toBe(percent(value));
    }
    // The italic is narrower than the roman, so its size-adjust must be smaller than the roman
    // face's: the roman's 95.19 % on italic text is what made the selects swap wider.
    expect(percent(italic[0]?.get("size-adjust"))).toBeLessThan(
      percent(roman[0]?.get("size-adjust")),
    );
  });
});
