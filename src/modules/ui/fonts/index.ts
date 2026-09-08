/**
 * The two self-hosted families (spec 004 §2 "Font", §13 Q2, AC-4; TASK-045).
 *
 * §2 specifies "one variable font" and "no second display face"; §13's 2026-09-08 resolution note
 * supersedes both sentences with the founder-approved pairing of the design canvas — **Newsreader**
 * (display, weight 500, roman) and **IBM Plex Sans** (body) — and AC-4's ≤45 KB per-page font
 * transfer therefore covers both families together. The measured total is 40 844 B (39.9 KiB) for
 * three faces: see `subset.json` and `tests/unit/fonts.test.ts`.
 *
 * `next/font/local` rather than `next/font/google`: the files are committed under this module
 * (`scripts/fonts/build-fonts.ts` generates them by hand), so no build and no page ever requests
 * `fonts.googleapis.com` or `fonts.gstatic.com` — a Core Web Vitals decision and a German-court
 * one (`plan/07` §1.4). Next fingerprints them into `/_next/static/media`, serves them
 * `immutable`, emits `font-display: swap` and — because `display`/`preload` are set here and this
 * module is imported by every document layout — writes the `<link rel="preload">` for all three
 * faces into the HTML `<head>`.
 *
 * `adjustFontFallback` is what keeps the swap from costing layout shift: Next computes
 * `size-adjust`, `ascent-override`, `descent-override` and `line-gap-override` for the named local
 * fallback so the fallback's metrics match the webfont's before it arrives (AC-4's "fallback
 * metrics set", CLS in AC-7/AC-24). Times New Roman for the serif, Arial for the sans — the two
 * values the API accepts, and the two faces present on every desktop OS.
 *
 * Both variables are consumed by the `@theme` block of `src/app/globals.css`
 * (`--font-display`/`--font-body`), so no component names a font family.
 */
import localFont from "next/font/local";

/** Newsreader 500 roman — headings and the wordmark. `--font-newsreader`. */
export const displayFont = localFont({
  src: [
    {
      path: "./newsreader-500-latin-ext.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-newsreader",
  display: "swap",
  preload: true,
  fallback: ["Iowan Old Style", "Georgia", "Times New Roman", "serif"],
  adjustFontFallback: "Times New Roman",
});

/**
 * IBM Plex Sans 400 + 600 — body copy, labels, buttons and navigation. `--font-plex-sans`.
 *
 * Two weights, not three: the canvas uses 400, 500 and 600, and a third face would put the page
 * 11 KB over AC-4's budget. 500 is therefore declared as 600 in the type utilities
 * (`--font-weight-medium`), so the design's medium weight renders from a real face instead of
 * being matched down to 400 by the CSS font-matching algorithm. Recorded in the PR body.
 */
export const bodyFont = localFont({
  src: [
    { path: "./plex-sans-400-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "./plex-sans-600-latin-ext.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-sans",
  display: "swap",
  preload: true,
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

/**
 * The `className` every document's `<html>` carries: both font variables in scope.
 *
 * A single string so no layout has to remember the pair, and so adding a face is one edit here.
 */
export const fontVariables = `${displayFont.variable} ${bodyFont.variable}`;
