/**
 * URL routing for the locale prefix (spec 003 §2 "Locale set and routing", §5.2, §6 "URL
 * pattern", AC-6, AC-8, AC-13; TASK-034).
 *
 * Three functions, one rule each:
 *
 *  - `localePath()` is the **only** URL builder in the application (§6, AC-13). Every path is
 *    `/{locale}` plus the locale's own `pathSegments` value for the page type, so a German slug
 *    can never appear on a Polish URL and no caller concatenates a path by hand.
 *  - `parseLocaleFromPath()` reads the first segment of a pathname. It is what `src/proxy.ts`
 *    attaches to the log line and the `x-fo-locale` request header, and it never looks at a
 *    header, a cookie or an IP (ADR-0006, §7 "Deliberate narrowing").
 *  - `isLaunchLocale()` is the routing gate: `generateStaticParams` emits exactly these codes and
 *    everything else 404s (AC-8). Uppercase, unknown and non-launch codes all answer `false`;
 *    there is no case-insensitive match, because `/EN` must 404 rather than serve a duplicate of
 *    `/en` (§6 "Canonical").
 *
 * All three read the registry through `getLocaleRegistry()`, so a database-backed locale set moves
 * routing with it and no caller changes (AC-5).
 */
import {
  type PathSegmentKey,
  PATH_SEGMENT_KEYS,
} from "../../config/locales.ts";

import { type LocaleConfig, getLocaleRegistry } from "./registry.ts";

/**
 * Page types `localePath()` can build. `"home"` is the locale root (`/de`); every other key is a
 * `plan/02` §4.1 path segment authored per locale in `src/config/locales.ts`.
 */
export type PageType = "home" | PathSegmentKey;

export const PAGE_TYPES: readonly PageType[] = ["home", ...PATH_SEGMENT_KEYS];

/** Same shape as a `pathSegments` value: lowercase ASCII, hyphen-separated, no slash (§6). */
const TRAILING_SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The live locales, in registry order — the set the chooser lists, the switcher links to and
 * `generateStaticParams` prerenders. Full `LocaleConfig` objects because every consumer needs the
 * `nativeName`, `bcp47` and `dir` alongside the code (spec 003 §2, AC-7), and because reading them
 * back one by one through `launchLocale()` would invite a caller to filter `isLaunch` itself.
 */
export function launchLocales(): readonly LocaleConfig[] {
  return getLocaleRegistry()
    .list()
    .filter((locale) => locale.isLaunch);
}

export function launchLocaleCodes(): readonly string[] {
  return launchLocales().map((locale) => locale.code);
}

/** True for a configured **launch** locale code, matched exactly (no case folding). */
export function isLaunchLocale(code: string | undefined): boolean {
  if (code === undefined) return false;
  return getLocaleRegistry().get(code)?.isLaunch === true;
}

/**
 * The configured locale for a URL segment, or `undefined` when the segment is not a live locale —
 * which is the 404 condition of AC-8, not an error.
 */
export function launchLocale(
  code: string | undefined,
): LocaleConfig | undefined {
  if (code === undefined) return undefined;
  const locale = getLocaleRegistry().get(code);
  return locale?.isLaunch === true ? locale : undefined;
}

/**
 * The locales that **have URLs**: the launch locales plus the pseudo-locales when
 * `ENABLE_PSEUDO_LOCALES` puts them in the registry (spec 003 §2 "Pseudo-locales", AC-29;
 * TASK-042). This is the set `generateStaticParams` prerenders and the `[locale]` layout resolves,
 * and it is deliberately *not* `launchLocales()`: a pseudo-locale must render a real document for
 * the visual and a11y suites while staying out of every place that speaks to a buyer or a crawler
 * — the switcher (`launchLocales()`), hreflang (`alternatesFor()`), sitemaps and robots-meta
 * lifting (`isLocaleIndexable()`), all of which start from `isLaunch`.
 *
 * A registry member that is neither a launch nor a pseudo locale still has no URL, so a locale
 * staged for a later launch (`isLaunch: false`) keeps 404ing until the flag is flipped.
 */
export function routableLocales(): readonly LocaleConfig[] {
  return getLocaleRegistry()
    .list()
    .filter((locale) => locale.isLaunch || locale.isPseudo);
}

export function routableLocaleCodes(): readonly string[] {
  return routableLocales().map((locale) => locale.code);
}

/**
 * The configured locale for a URL segment that has one, or `undefined` — the 404 condition of
 * AC-8, unchanged for every code that is not a launch or pseudo locale (`/fr`, `/xx`, `/EN`).
 */
export function routableLocale(
  code: string | undefined,
): LocaleConfig | undefined {
  if (code === undefined) return undefined;
  const locale = getLocaleRegistry().get(code);
  if (locale === undefined) return undefined;
  return locale.isLaunch || locale.isPseudo ? locale : undefined;
}

/**
 * Build the one canonical path form for a page: leading slash, lowercase locale prefix, localised
 * page segment, no trailing slash, no query. Extra `segments` are leaf slugs (a country, a product
 * slug) and must already be URL-shaped; an empty, uppercase or slash-bearing segment is a
 * programming error and throws here rather than emitting a URL that `i18n:check` (AC-13) or the
 * canonical rule would reject later.
 */
export function localePath(
  locale: string,
  pageType: PageType,
  ...segments: readonly string[]
): string {
  const config = getLocaleRegistry().get(locale);
  if (config === undefined) {
    throw new Error(`unknown locale code: ${locale}`);
  }
  const parts: string[] = [config.code];
  if (pageType !== "home") {
    parts.push(config.pathSegments[pageType]);
  }
  for (const segment of segments) {
    if (!TRAILING_SEGMENT_PATTERN.test(segment)) {
      throw new Error(
        `path segment \`${segment}\` must be lowercase ASCII, hyphen-separated and slash-free (plan/02 §4)`,
      );
    }
    parts.push(segment);
  }
  return `/${parts.join("/")}`;
}

export interface ParsedPath {
  /** The launch locale the path is prefixed with, or `undefined` when it carries none. */
  locale: string | undefined;
  /** The path after the locale prefix, always starting with `/` (`/` when there is nothing). */
  rest: string;
}

/**
 * Split a pathname into its locale prefix and the rest. A first segment that is not a launch
 * locale yields `locale: undefined` and the pathname unchanged — no guessing, no normalisation,
 * no redirect.
 */
export function parseLocaleFromPath(pathname: string): ParsedPath {
  const withoutQuery = pathname.split(/[?#]/)[0] ?? pathname;
  const [, first = "", ...others] = withoutQuery.split("/");
  if (!isLaunchLocale(first)) {
    return {
      locale: undefined,
      rest: withoutQuery === "" ? "/" : withoutQuery,
    };
  }
  const rest = others.join("/");
  return { locale: first, rest: rest === "" ? "/" : `/${rest}` };
}
