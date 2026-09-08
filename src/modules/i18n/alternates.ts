/**
 * The one hreflang generator (spec 003 §2 "Messages", §5.2, §6 "hreflang set", AC-14; TASK-039).
 *
 * `plan/02` §8 mandates a single generator "from the same data as the sitemap, so they cannot
 * disagree": this is it. Spec 007's `seo` module wraps it — `<head>` links, `xhtml:link` entries
 * in the sitemap and the `alternates` metadata all read this output — and must not reimplement
 * it.
 *
 * What it emits, per `plan/02` §3 and §8:
 *
 *  - one page entry per **indexable** locale (`isLocaleIndexable()`, TASK-039's review gate), so
 *    an unreviewed `de` never claims to be a German alternate of anything;
 *  - on each page, an alternate for itself and for every other indexable locale, plus each of
 *    their `hreflangAliases` (regional variants sharing one URL: `en-IE`, `en-NL`, `de-DE`,
 *    `de-AT`, `pl-PL`), so the set is **reciprocal and complete by construction** rather than by
 *    assertion — every page in the returned cluster carries the same alternate list;
 *  - `x-default` pointing at the x-default locale's URL (`/en`, `plan/02` §3).
 *
 * Structural consequences worth stating, because they are the reason this function exists:
 *
 *  - **A pseudo-locale cannot appear.** `en-XA`/`ar-XB` are never `isLaunch` (§2), and the gate
 *    starts from `isLaunch`, so no filter list has to be maintained here (AC-29).
 *  - **A cross-locale canonical is inexpressible.** The output is alternate pairs only; nothing
 *    in this shape can nominate another locale's URL as canonical (§6 "Canonical").
 *  - **`formattingTag` never leaks.** hreflang values come from `hreflangAliases` only. `en`'s
 *    formatting tag is `en-150` (TASK-044) and it is an `Intl` convention, not a document
 *    language; emitting it as an hreflang value would tell a crawler this page is written in a
 *    language nobody speaks.
 *
 * ## Decision: `en-150` is configured but not emitted
 *
 * `plan/02` §3 lists `en-150` among the hreflang values served on `/en/`, and
 * `src/config/locales.ts` keeps it, because it is a true statement about the audience of that
 * URL (pan-European English) and spec 002 will seed the same alias list. It is **not emitted as
 * an hreflang value**: Google documents support for an ISO 639-1 language code with an optional
 * ISO 3166-1 **alpha-2** region code (plus `x-default`), and `150` is a UN M.49 area code, not
 * alpha-2 — an unsupported region subtag makes the *whole* annotation ignored, which would put
 * the reciprocity of the entire cluster at risk to gain nothing. `emitInHreflang()` below is the
 * filter, applied to every locale's aliases rather than special-casing one value, so a Phase 4
 * locale that adds `es-419` inherits the same protection. The `plan/02` §3 table needs the
 * correction recorded (carried on TASK-043 for the doc pass); the alias data itself is correct.
 *
 * ## Purity and the base URL
 *
 * `baseUrl` is a required argument, not an env read: this module stays pure and testable, and the
 * `NEXT_PUBLIC_SITE_URL` read happens at the call site (spec 007's `seo` module), which is also
 * where the canonical form of the origin is already known. Hrefs are absolute `https://` URLs
 * because a relative alternate is silently ignored by Google, and the origin is normalised to no
 * trailing slash so the output is byte-comparable with the sitemap's.
 */
import {
  type LocaleConfig,
  X_DEFAULT,
  xDefaultLocale,
} from "../../config/locales.ts";

import { getLocaleRegistry } from "./registry.ts";
import { isLocaleIndexable } from "./review.ts";
import { type PageType, localePath } from "./routing.ts";

/** One `<link rel="alternate">` / `xhtml:link` pair. */
export interface HreflangAlternate {
  hreflang: string;
  href: string;
}

/**
 * One page and its complete alternate set — the shape `tests/fixtures/seo/hreflang/*.json` and
 * spec 001's `validate-hreflang` CLI consume (`{ pages: [...] }` wraps an array of these).
 */
export interface HreflangPage {
  url: string;
  alternates: HreflangAlternate[];
}

/** The same page in every locale, addressed the way `localePath()` builds it. */
export interface AlternatesPageTarget {
  /** `"home"` for `/{locale}`, otherwise a `plan/02` §4.1 page type (localised per locale). */
  pageType: PageType;
  /** Leaf slugs appended after the localised segment (a destination country, a product slug). */
  segments?: readonly string[];
}

/**
 * The same page in every locale, addressed by explicit per-locale path — for pages whose leaf
 * slug is per-entity translated data rather than a config segment (spec 007/008). A locale
 * missing from the record has no translated page and therefore no alternate, which is
 * `plan/02` §8's "a `pl` post without a `de` translation has no `de` alternate".
 */
export interface AlternatesPathTarget {
  pathByLocale: Readonly<Record<string, string>>;
}

export type AlternatesTarget = AlternatesPageTarget | AlternatesPathTarget;

export interface AlternatesOptions {
  /** Absolute site origin, e.g. `https://flowersoverseas.com` (see the header). */
  baseUrl: string;
}

/**
 * `hreflang` values Google honours: `x-default`, or an ISO 639-1/639-2 language with an optional
 * ISO 15924 script and an optional ISO 3166-1 **alpha-2** region. A numeric (UN M.49) region such
 * as `150` is excluded — see the header decision.
 */
const SUPPORTED_HREFLANG = /^[a-z]{2,3}(?:-[a-z]{4})?(?:-[a-z]{2})?$/i;

export function emitInHreflang(value: string): boolean {
  return value === X_DEFAULT || SUPPORTED_HREFLANG.test(value);
}

function origin(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:") {
    throw new Error(
      `hreflang hrefs must be absolute https:// URLs; got \`${baseUrl}\``,
    );
  }
  return `${url.origin}`;
}

function isPathTarget(
  target: AlternatesTarget,
): target is AlternatesPathTarget {
  return "pathByLocale" in target;
}

function pathFor(
  locale: LocaleConfig,
  target: AlternatesTarget,
): string | undefined {
  if (isPathTarget(target)) return target.pathByLocale[locale.code];
  return localePath(locale.code, target.pageType, ...(target.segments ?? []));
}

/**
 * The complete, reciprocal hreflang cluster for one page across the indexable locales.
 *
 * Returns `[]` when the cluster cannot be described honestly: no indexable locale has the page,
 * or the **x-default locale** itself is not indexable. The second case is a deliberate decision
 * rather than an oversight: `plan/02` §3 fixes `x-default` to `/en` and `plan/02` §8 requires
 * every alternate set to carry one, so promoting another locale to `x-default` would misstate
 * which URL serves the unmatched visitor, and emitting a cluster without `x-default` would be an
 * annotation our own `validate-hreflang` gate (and `plan/02` §8) rejects. Emitting nothing is the
 * safe answer: a page with no hreflang annotation is merely unannotated, not wrong. It is also
 * unreachable in practice — `en` is the authored source language, so its unreviewed share is 0 by
 * construction — and a test pins the behaviour so a future locale-set change cannot silently
 * produce a half cluster.
 */
export function alternatesFor(
  target: AlternatesTarget,
  { baseUrl }: AlternatesOptions,
): HreflangPage[] {
  const site = origin(baseUrl);
  const registry = getLocaleRegistry();

  const pages = registry
    .list()
    .filter((locale) => isLocaleIndexable(locale.code))
    .flatMap((locale) => {
      const path = pathFor(locale, target);
      return path === undefined ? [] : [{ locale, url: `${site}${path}` }];
    });

  const xDefault = pages.find((page) => page.locale.code === xDefaultLocale);
  if (xDefault === undefined) return [];

  const alternates: HreflangAlternate[] = pages.flatMap((page) =>
    page.locale.hreflangAliases
      .filter((alias) => alias !== X_DEFAULT && emitInHreflang(alias))
      .map((alias) => ({ hreflang: alias, href: page.url })),
  );
  alternates.push({ hreflang: X_DEFAULT, href: xDefault.url });

  // Every page carries the same list: reciprocity and completeness by construction (`plan/02`
  // §8), not by a check somebody has to remember to run.
  return pages.map((page) => ({
    url: page.url,
    alternates: alternates.map((alternate) => ({ ...alternate })),
  }));
}
