/**
 * T-51, the unit half (spec 004 §14 A24 clause 5, AC-46; TASK-196): computed over pure white under
 * the phone cover's ink fade (the worst photograph), the H1 meets at least 3∶1 and the supporting
 * line at least 4.5∶1. The eyebrow, 13 px on the same fade, is held to 4.5∶1 as well.
 *
 * The values are the stylesheet's (`src/app/globals.css`), parsed and resolved, so the case goes
 * red when the fade's alpha is lowered there (watched: `/ 0.88` → `/ 0.4` puts the H1 at 2.43∶1; the shipped 0.88 gives 11.19∶1).
 * The markup half ties the tokens to the component: `HomeHero` must draw the fade from
 * `--color-cover-fade` and the three texts in the tokens measured here, or this test is measuring
 * colours nobody paints.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COVER_FADE_TOKEN,
  COVER_TEXT,
  coverFadeContrast,
  parseOklchAlpha,
} from "../../src/modules/ui/home/cover-fade.ts";
import {
  NON_SINGLE_COLOUR_TOKENS,
  formatRatio,
} from "../../src/modules/ui/tokens/contrast.ts";

const repoRoot = resolve(__dirname, "../..");
const css = readFileSync(resolve(repoRoot, "src/app/globals.css"), "utf8");

const FADE_DECLARATION =
  /--color-cover-fade:\s*oklch\(([^)]*)\/\s*([\d.]+)\s*\)/u;

function withAlpha(alpha: string): string {
  const next = css.replace(
    FADE_DECLARATION,
    (_match, colour: string) =>
      `--color-cover-fade: oklch(${colour}/ ${alpha})`,
  );
  expect(next, "the fade declaration was rewritten").toContain(
    `--color-cover-fade: oklch(25% 0.06 285 / ${alpha})`,
  );
  return next;
}

describe("the cover fade's contrast over pure white (T-51 unit, AC-46)", () => {
  const results = coverFadeContrast(css);

  it.each(results.map((result) => [result.part, result] as const))(
    "%s meets its threshold",
    (_part, result) => {
      expect(
        result.ratio,
        `${result.part} (${result.token}) is ${formatRatio(result.ratio)}:1 on the fade, below ${String(result.threshold)}:1`,
      ).toBeGreaterThanOrEqual(result.threshold);
    },
  );

  it("holds the spec's two thresholds, the H1 at 3∶1 and its line at 4.5∶1", () => {
    expect(
      COVER_TEXT.map(({ part, threshold }) => `${part} ${String(threshold)}`),
    ).toEqual(["heading 3", "line 4.5", "eyebrow 4.5"]);
  });

  it("goes red when the fade's alpha is lowered until the H1 is under 3∶1", () => {
    const heading = (alpha: string): number =>
      coverFadeContrast(withAlpha(alpha)).find(
        (result) => result.part === "heading",
      )?.ratio ?? Number.NaN;
    expect(heading("0.4")).toBeLessThan(3);
    expect(
      coverFadeContrast(withAlpha("0.4")).every((result) => result.passes),
    ).toBe(false);
    // And it is the alpha that decides: the shipped value passes, a transparent fade is ~1∶1.
    expect(heading("0.88")).toBeGreaterThan(3);
    expect(heading("0")).toBeLessThan(1.1);
  });

  it("reads the alpha as a fraction or a percentage", () => {
    expect(parseOklchAlpha("oklch(25% 0.06 285 / 0.88)")?.alpha).toBe(0.88);
    expect(parseOklchAlpha("oklch(25% 0.06 285 / 88%)")?.alpha).toBe(0.88);
    expect(parseOklchAlpha("oklch(25% 0.06 285)")).toBeUndefined();
  });
});

// The v3 home has no phone cover (spec 004 §14 A-founder-2026-10-24a item 4.2; TASK-386): the
// markup half that tied `HomeHero` to these tokens left with it. The token and its measured
// contrast stay, for any surface that paints the fade again.

describe("the fade's exemption from the pair manifest points here", () => {
  // `--color-cover-fade` is translucent, so `tests/unit/contrast.test.ts` cannot pair it; its entry
  // in `NON_SINGLE_COLOUR_TOKENS` is the record that this file measures it instead (`/break` 212,
  // hole 3).
  it("names the cover fade and this test as the place its contrast is computed", () => {
    expect(NON_SINGLE_COLOUR_TOKENS[COVER_FADE_TOKEN]).toContain(
      "tests/unit/home-cover-fade.test.tsx",
    );
  });
});
