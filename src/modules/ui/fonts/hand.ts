/**
 * Caveat 500 — the buyer's own words in the product page's printed-card preview, and nowhere else
 * (spec 004 §14 A21 clause 3; TASK-175).
 *
 * Its own module, deliberately **not** re-exported from `./index.ts` or the `ui` barrel: Next
 * attaches a `localFont()` call's `@font-face` rules to every route whose module graph imports the
 * call, so Caveat must be reachable only from the product page's preview (TASK-179 imports
 * `handFontVariables` there and puts it on the preview's container). Never preloaded (A21 clause
 * 3), never a price, a button, a label or a heading. Latin and Latin-Ext as two calls for the same
 * reason as the page faces (`./index.ts`); the theme's `--font-hand` stacks them Latin-Ext first.
 * Its two files are 24,760 B against the 30 KB Caveat budget (`subset.json`).
 */
import localFont from "next/font/local";

/** Caveat, Latin. `--font-caveat`. */
export const handFont = localFont({
  src: [{ path: "./caveat-500-latin.woff2", weight: "500", style: "normal" }],
  variable: "--font-caveat",
  display: "swap",
  preload: false,
  fallback: ["Bradley Hand", "Segoe Print", "cursive"],
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC, U+2122, U+2190-2193, U+2212",
    },
  ],
});

/** Caveat, Latin-Ext. `--font-caveat-ext`. */
export const handFontExt = localFont({
  src: [
    { path: "./caveat-500-latin-ext.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-caveat-ext",
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

/** The class the preview's container carries: both Caveat variables in scope. */
export const handFontVariables = `${handFont.variable} ${handFontExt.variable}`;
