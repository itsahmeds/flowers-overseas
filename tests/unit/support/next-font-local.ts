/**
 * `next/font/local` stand-in for the unit suite (spec 004 AC-4; TASK-045).
 *
 * `localFont()` is not a runtime function: Next's compiler plugin replaces the call at build time
 * with the generated `@font-face` CSS and the hashed asset URLs, and calling the real module from
 * plain Node throws ("Font loaders are only usable inside a Next.js app"). Every unit test that
 * renders a document layout would therefore fail on an import it does not care about, so
 * `vitest.config.ts` aliases the module here.
 *
 * The stub returns the same *shape* — `className`, `variable`, `style.fontFamily` — derived from
 * the requested `variable` name, so `fontVariables` is still asserted to contain both custom
 * properties and a layout snapshot still shows two font classes. What it deliberately does **not**
 * do is verify subsetting, `display: swap` or the preload links: those are the build's job and
 * they are asserted where they are observable — `tests/unit/fonts.test.ts` (the committed subsets
 * and the budget) and `tests/e2e/fonts.spec.ts` (the served `<head>`, `swap`, and zero requests to
 * Google Fonts).
 */
interface LocalFontOptions {
  readonly variable?: string;
  readonly src?: unknown;
  readonly display?: string;
  readonly preload?: boolean;
  readonly fallback?: readonly string[];
  readonly adjustFontFallback?: string | false;
}

export default function localFont(options: LocalFontOptions): {
  className: string;
  variable: string;
  style: { fontFamily: string };
} {
  const name = (options.variable ?? "--font-stub").replace(/^--/, "");
  return {
    className: `${name}-class`,
    variable: `${name}-variable`,
    style: { fontFamily: name },
  };
}
