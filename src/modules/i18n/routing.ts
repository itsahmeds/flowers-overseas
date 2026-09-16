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
export interface LocalePathParts {
  readonly pageType: PageType;
  /**
   * A destination slug rendered **before** the page segment: `/en-gb/poland/flowers`. Shop and
   * product URLs are country-first (`plan/02` §4.1, spec 008 §2), which is the one shape the
   * variadic form cannot express — and the reason it is a named field here rather than a leading
   * element of `segments`, where a caller could put it by mistake on a corridor path.
   */
  readonly country?: string;
  readonly segments?: readonly string[];
}

export function localePath(
  locale: string,
  pageType: PageType,
  ...segments: readonly string[]
): string;
export function localePath(locale: string, parts: LocalePathParts): string;
export function localePath(
  locale: string,
  pageTypeOrParts: PageType | LocalePathParts,
  ...rest: readonly string[]
): string {
  const { pageType, country, segments } =
    typeof pageTypeOrParts === "string"
      ? { pageType: pageTypeOrParts, country: undefined, segments: rest }
      : {
          pageType: pageTypeOrParts.pageType,
          country: pageTypeOrParts.country,
          segments: pageTypeOrParts.segments ?? [],
        };

  const config = getLocaleRegistry().get(locale);
  if (config === undefined) {
    throw new Error(`unknown locale code: ${locale}`);
  }
  const parts: string[] = [config.code];
  if (country !== undefined) {
    if (!TRAILING_SEGMENT_PATTERN.test(country)) {
      throw new Error(
        `path segment \`${country}\` must be lowercase ASCII, hyphen-separated and slash-free (plan/02 §4)`,
      );
    }
    parts.push(country);
  }
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

/* -------------------------------------------------------------------------- */
/* The listing URLs of spec 008 §2 (TASK-105).                                 */
/* -------------------------------------------------------------------------- */

/**
 * The six page types spec 008 §2 defines, as the URL builder names them. A value list rather than
 * six literals, so the collision matrix, `generateStaticParams`, the sitemap builders and the
 * descriptor registry iterate one set.
 */
export const LISTING_PAGE_TYPES = [
  "countryShopRoot",
  "countryCategory",
  "countryOccasion",
  "categoryHub",
  "occasionHub",
  "occasionsIndex",
] as const;
export type ListingPageType = (typeof LISTING_PAGE_TYPES)[number];

/**
 * What each listing URL is made of (spec 008 §2's table). `country` is a country slug **in this
 * locale** and `slug` a category or occasion slug in this locale: both are authored data from
 * `countries.ts` and spec 006's copy, and nothing here translates, folds or derives one.
 */
export type ListingTarget =
  | { readonly pageType: "countryShopRoot"; readonly country: string }
  | {
      readonly pageType: "countryCategory";
      readonly country: string;
      readonly slug: string;
    }
  | {
      readonly pageType: "countryOccasion";
      readonly country: string;
      readonly slug: string;
    }
  | { readonly pageType: "categoryHub"; readonly slug: string }
  | { readonly pageType: "occasionHub"; readonly slug: string }
  | { readonly pageType: "occasionsIndex" };

/**
 * The path of one of spec 008's six listing pages.
 *
 * It composes through `localePath()` and contributes no string of its own, so every fixed segment
 * stays the locale's authored `pathSegments` (`flowers` / `blumen` / `kwiaty`, `occasions` /
 * `anlaesse` / `okazje`) and a German segment can never appear on a Polish URL (spec 003 §6, spec
 * 008 §2). The three country-scoped types put the destination before the page segment
 * (`/en-gb/poland/flowers`) — `plan/02` §4.1's shape, and the reason `localePath()` grew a
 * `country` prefix instead of a caller growing a concatenation.
 */
export function listingPath(locale: string, target: ListingTarget): string {
  switch (target.pageType) {
    case "countryShopRoot":
      return localePath(locale, {
        pageType: "shopCategory",
        country: target.country,
      });
    case "countryCategory":
      return localePath(locale, {
        pageType: "shopCategory",
        country: target.country,
        segments: [target.slug],
      });
    case "countryOccasion":
      return localePath(locale, {
        pageType: "occasions",
        country: target.country,
        segments: [target.slug],
      });
    case "categoryHub":
      return localePath(locale, "shopCategory", target.slug);
    case "occasionHub":
      return localePath(locale, "occasions", target.slug);
    case "occasionsIndex":
      return localePath(locale, "occasions");
  }
}

/**
 * The product-detail path `/{locale}/{country}/{product}/{slug}` (`plan/02` §4.1; spec 008 §2
 * reserves the pattern, spec 009 §5.2 owns the route).
 *
 * Spec 008 builds it so a product card becomes a link the moment spec 009 publishes the link id,
 * with no markup change (§13 Q8, AC-12). The slug is the shared authored ASCII slug of spec 009
 * §13 Q1 — `slugFor("product", …)` produces it and this builder only places it.
 */
export function productPath(
  locale: string,
  country: string,
  slug: string,
): string {
  return localePath(locale, {
    pageType: "product",
    country,
    segments: [slug],
  });
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
