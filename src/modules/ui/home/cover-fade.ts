/**
 * The phone cover's ink fade and the contrast of the words on it (spec 004 §14 A24 clause 5,
 * **AC-46**; TASK-196; `docs/design/wireframes/home-mobile.dc.html`, `.m1::after`).
 *
 * On the phone the flat-lay is the whole first screen and the H1, its eyebrow and its one line sit
 * on an ink fade at the cover's foot. A photograph has no fixed colour, so AC-46 takes the worst
 * case: the fade **composited over pure white**, and the text tokens measured against that. The H1
 * (50 px, large text) needs 3∶1 and the line and the eyebrow (16 and 13 px) need 4.5∶1.
 *
 * The values are read from `src/app/globals.css`, never restated here, so lowering the fade's alpha
 * in the stylesheet is what turns `tests/unit/home-cover-fade.test.tsx` red. The fade reaches its
 * full alpha **above** the eyebrow: `HomeHero` draws the gradient's ramp inside the copy block's
 * block-start padding, and `tests/e2e/home-v3.spec.ts` asserts that the text starts below it, so
 * the full-alpha figure computed here is the one under every glyph.
 */
import {
  type Oklch,
  oklchToLinearSrgb,
  parseThemeTokens,
  relativeLuminance,
  resolveColorToken,
} from "../tokens/contrast.ts";

/** The fade token, as `HomeHero` names it. */
export const COVER_FADE_TOKEN = "--color-cover-fade";

/** The ramp above the copy, in px: the fade climbs from transparent to its token over this. */
export const COVER_FADE_RAMP_PX = 96;

/** What sits on the fade, the token each is drawn in, and the WCAG threshold that applies. */
export const COVER_TEXT = [
  { part: "heading", token: "--color-on-inverse", threshold: 3 },
  { part: "line", token: "--color-on-inverse", threshold: 4.5 },
  { part: "eyebrow", token: "--color-on-inverse-accent", threshold: 4.5 },
] as const;

export type CoverTextPart = (typeof COVER_TEXT)[number]["part"];

export interface CoverFadeResult {
  readonly part: CoverTextPart;
  readonly token: string;
  readonly threshold: number;
  readonly ratio: number;
  readonly passes: boolean;
}

const OKLCH_ALPHA =
  /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+)(%?)\s*\)$/u;
const VAR_REFERENCE = /^var\(\s*(--[\w-]+)\s*\)$/u;

/** An `oklch(L% C H / A)` value, its alpha as 0–1; `undefined` for anything else. */
export function parseOklchAlpha(
  value: string,
): (Oklch & { readonly alpha: number }) | undefined {
  const match = OKLCH_ALPHA.exec(value.trim());
  if (match === null) return undefined;
  const [, l, c, h, a, percent] = match;
  const alpha = Number(a) / (percent === "%" ? 100 : 1);
  return { l: Number(l) / 100, c: Number(c), h: Number(h), alpha };
}

/** The fade token's colour and alpha, following a `var()` chain. */
export function resolveFade(
  tokens: Map<string, string>,
  name: string = COVER_FADE_TOKEN,
): Oklch & { readonly alpha: number } {
  let value = tokens.get(name);
  const seen = new Set<string>([name]);
  for (;;) {
    if (value === undefined) throw new Error(`${name} is not declared`);
    const next = VAR_REFERENCE.exec(value.trim())?.[1];
    if (next === undefined || seen.has(next)) break;
    seen.add(next);
    value = tokens.get(next);
  }
  const fade = parseOklchAlpha(value);
  if (fade === undefined) {
    throw new Error(`${name} is not an oklch(… / alpha) colour: ${value}`);
  }
  return fade;
}

const encode = (linear: number): number => {
  const x = Math.min(1, Math.max(0, linear));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
};
const decode = (gamma: number): number =>
  gamma <= 0.04045 ? gamma / 12.92 : ((gamma + 0.055) / 1.055) ** 2.4;

/**
 * The relative luminance of the fade painted over pure white. A browser composites in encoded
 * sRGB, so each channel is mixed there and decoded afterwards.
 */
export function fadeOverWhiteLuminance(
  fade: Oklch & { readonly alpha: number },
): number {
  const [r, g, b] = oklchToLinearSrgb(fade).map((channel) => {
    const mixed = fade.alpha * encode(channel) + (1 - fade.alpha);
    return decode(mixed);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Each text token on the fade over white, with its ratio and whether it meets its threshold. */
export function coverFadeContrast(css: string): CoverFadeResult[] {
  const tokens = parseThemeTokens(css);
  const ground = fadeOverWhiteLuminance(resolveFade(tokens));
  return COVER_TEXT.map(({ part, token, threshold }) => {
    const ink = relativeLuminance(resolveColorToken(token, tokens));
    const ratio =
      (Math.max(ink, ground) + 0.05) / (Math.min(ink, ground) + 0.05);
    return { part, token, threshold, ratio, passes: ratio >= threshold };
  });
}
