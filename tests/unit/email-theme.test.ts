/**
 * The email palette is the site's palette (artboard `email-layout-*.dc.html`, "Colour": the
 * escalation's `emails/theme.ts` generated from `globals.css`, checked in CI; spec 016 §5.3;
 * TASK-332).
 *
 * Mail clients do not read CSS custom properties, so `EMAIL_COLOURS` holds literal sRGB hex
 * values. Each must be the `@theme` token of the same name in `src/app/globals.css`, converted
 * from OKLCH to sRGB (gamut-clamped, as a browser paints it) and rounded to 8 bits. A token
 * changed in `globals.css` without the email palette following it turns this red.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EMAIL_COLOURS } from "../../src/modules/notifications/emails";
import {
  oklchToLinearSrgb,
  parseThemeTokens,
  resolveColorToken,
} from "../../src/modules/ui/tokens/contrast.ts";

const css = readFileSync(
  fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)),
  "utf8",
);
const tokens = parseThemeTokens(css);

/** One linear channel → its 8-bit sRGB hex pair. */
function channel(linear: number): string {
  const clamped = Math.min(1, Math.max(0, linear));
  const encoded =
    clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255)
    .toString(16)
    .padStart(2, "0");
}

function hexOf(token: string): string {
  return `#${oklchToLinearSrgb(resolveColorToken(`--color-${token}`, tokens))
    .map(channel)
    .join("")}`;
}

describe("the email palette", () => {
  for (const [token, hex] of Object.entries(EMAIL_COLOURS)) {
    it(`${token} is globals.css's --color-${token}`, () => {
      expect(hex).toBe(hexOf(token));
    });
  }

  it("has the tokens the layout artboard names", () => {
    expect(Object.keys(EMAIL_COLOURS).sort()).toEqual(
      [
        "paper-2",
        "card",
        "rule",
        "ink",
        "ink-2",
        "ink-3",
        "eyebrow",
        "accent",
        "accent-strong",
        "accent-ink",
        "link",
        "stem",
        "sage-wash",
        "leaf-wash",
        "blush",
        "butter",
        "logo-ink",
        "logo-accent",
      ].sort(),
    );
  });
});
