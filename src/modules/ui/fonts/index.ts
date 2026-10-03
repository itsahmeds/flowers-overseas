/**
 * The self-hosted page faces (spec 004 §2 "Font", §14 A21 clause 3; TASK-045, TASK-175).
 *
 * **Fraunces** (display: roman 400, italic 300) and **Alegreya Sans** (body: 400, 700), each split
 * into a Latin and a Latin-Ext file with a matching `unicode-range`, all committed under this
 * directory by `pnpm fonts:build` (`scripts/fonts/build-fonts.ts`) and served through
 * `next/font/local`: no page ever requests `fonts.googleapis.com` or `fonts.gstatic.com`
 * (ADR-0016's `font-src 'self'`). Caveat, the third family, is the product page's alone and lives
 * in `./hand.ts` so that no other page's module graph contains it.
 *
 * **Why two `localFont()` calls per family.** `next/font/local` writes one set of `declarations`
 * for every `@font-face` of a call, so a `unicode-range` per subset needs a call per subset. Each
 * call becomes its own CSS family, and the theme stacks them **Latin-Ext first**
 * (`--font-body: var(--font-alegreya-ext), var(--font-alegreya)` in `src/app/globals.css`): the
 * Latin-Ext family's faces cover none of the Latin code points, so the browser falls through to
 * the Latin family for every ASCII letter and reaches the Latin-Ext file only for a character such
 * as `ą` — which an `en`, `en-gb` or `de` page never renders, so it never downloads the file. The
 * Latin family's variable carries the metric-matched fallback (`adjustFontFallback`) and the named
 * fallbacks, so the stack ends in the right order.
 *
 * **Matched fallback metrics on Linux too.** `adjustFontFallback` writes one metric-matched face
 * over `local("Arial")` / `local("Times New Roman")`, which a Linux machine (the CI runners
 * included) does not have; there the swap fell back to an unmatched system face and a late
 * Fraunces moved the masthead and the hero card (CLS 0.000156 in CI, where AC-7 and AC-28 require
 * 0). The first named fallback of each Latin call is therefore a second metric-matched face,
 * declared in `src/app/globals.css` over the metric-compatible clones Liberation Sans / Arimo and
 * Liberation Serif / Tinos, with the overrides Next computes for the first; `tests/unit/fonts.test.ts`
 * recomputes them from the committed files, so the two cannot drift.
 *
 * **Preloads (A21 clause 3: at most two, never the italic, the Latin-Ext files or Caveat).**
 * `next/font` preloads every file of a call or none of them, and a weight cannot move to a second
 * family without breaking font matching (a family holding only a 400 face renders bold text as a
 * synthesised 400). So the Alegreya Sans **Latin** call — 400 and 700 — is the one preloaded call:
 * two files, 19,320 B against the 50 KB preload budget. Fraunces is preloaded nowhere: A21 permits
 * its Latin roman "only on a page whose LCP element is display-face text", and a layout cannot know
 * that for every page under it. The 700 in the second preload slot is recorded in
 * `docs/tasks/TASK-175.md` under Escalations.
 *
 * Every `localFont()` argument is a literal because Next reads them at compile time; the two
 * `unicode-range` strings are pinned to `unicodeRange()` of the build script by
 * `tests/unit/fonts.test.ts`, so the CSS and the file contents cannot drift apart.
 */
import localFont from "next/font/local";

/** Fraunces, Latin: roman 400 and italic 300, `opsz` 144, `SOFT` 100. `--font-fraunces`. */
export const displayFont = localFont({
  src: [
    { path: "./fraunces-400-latin.woff2", weight: "400", style: "normal" },
    {
      path: "./fraunces-300-italic-latin.woff2",
      weight: "300",
      style: "italic",
    },
  ],
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
  fallback: [
    "Fraunces Fallback Liberation",
    "Iowan Old Style",
    "Georgia",
    "serif",
  ],
  adjustFontFallback: "Times New Roman",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC, U+2122, U+2190-2193, U+2212",
    },
  ],
});

/** Fraunces, Latin-Ext. `--font-fraunces-ext`; first in the display stack. */
export const displayFontExt = localFont({
  src: [
    { path: "./fraunces-400-latin-ext.woff2", weight: "400", style: "normal" },
    {
      path: "./fraunces-300-italic-latin-ext.woff2",
      weight: "300",
      style: "italic",
    },
  ],
  variable: "--font-fraunces-ext",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-0130, U+0132-0151, U+0154-024F, U+1E00-1EFF, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});

/** Alegreya Sans, Latin: 400 and 700. The one preloaded call. `--font-alegreya`. */
export const bodyFont = localFont({
  src: [
    { path: "./alegreya-sans-400-latin.woff2", weight: "400", style: "normal" },
    { path: "./alegreya-sans-700-latin.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-alegreya",
  display: "swap",
  preload: true,
  fallback: [
    "Alegreya Sans Fallback Liberation",
    "Gill Sans",
    "Segoe UI",
    "system-ui",
    "sans-serif",
  ],
  adjustFontFallback: "Arial",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC, U+2122, U+2190-2193, U+2212",
    },
  ],
});

/** Alegreya Sans, Latin-Ext. `--font-alegreya-ext`; first in the body stack. */
export const bodyFontExt = localFont({
  src: [
    {
      path: "./alegreya-sans-400-latin-ext.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./alegreya-sans-700-latin-ext.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-alegreya-ext",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-0130, U+0132-0151, U+0154-024F, U+1E00-1EFF, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});

/**
 * The `className` every document's `<html>` carries: the four page-face variables in scope.
 *
 * A single string so no layout has to remember the set, and so adding a face is one edit here.
 */
export const fontVariables = [
  displayFont.variable,
  displayFontExt.variable,
  bodyFont.variable,
  bodyFontExt.variable,
].join(" ");
