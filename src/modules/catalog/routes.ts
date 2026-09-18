/**
 * **One resolver for one URL depth** (spec 008 §14 **A5**, spec 007 §14 **A8**; TASK-109).
 *
 * Next.js allows exactly one dynamic slug **name** per (depth, position) across the whole `app/`
 * tree, route groups included: `/[locale]/[destinations]/[country]` (spec 007's corridor) and
 * `/[locale]/[country]/[shopCategory]` (spec 008's shop root) are the same two dynamic positions
 * under two names, and `getSortedRoutes` throws on the pair at build **and** at server start. A
 * catch-all does not rescue it either — `resolve-routes` stops at the first matching dynamic
 * route, and with `dynamicParams = false` the corridor would answer 404 for every shop URL.
 *
 * So the ruling is: **one route file per URL depth**, each calling this one resolver.
 *
 * ```
 * /{locale}/{segment}           → src/app/[locale]/[segment]/page.tsx
 * /{locale}/{segment}/{child}   → src/app/[locale]/[segment]/[child]/page.tsx
 * ```
 *
 * `resolveLocalePath()` answers *which page a path names*, as a discriminated union over the two
 * existence sets that already exist — spec 007's `corridorPageExists()` and spec 008's
 * `listingExists()`. It invents no third rule, so a URL that answers 200 here is a URL one of
 * those two predicates already claimed, which is what keeps `generateStaticParams`, the sitemap
 * builders, the link renderers and the e2e crawl in agreement (spec 008 §2, AC-3).
 *
 * **`app/` stays thin.** The route files resolve, mount one module page component, and hold no
 * knowledge of segments or slugs; everything a reader could get wrong about which page a URL is
 * lives here, beside the rules it reads.
 *
 * **What is not here yet.** `categoryHub` and `occasionHub` share depth 3 with the corridor and
 * the shop root, and `occasionsIndex` shares depth 2 with the destinations hub; TASK-112/113 add
 * their branches to this union and their components to the same two route files. Until then those
 * URLs resolve to `notFound`, which is what they must do while the pages do not exist.
 *
 * Nothing here reads a cookie, a header or the clock.
 */
import { type CountryIso2, isCountryIso2 } from "@/config/countries";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import {
  corridorIso2ForSlug,
  corridorPageExists,
  listCorridorPages,
} from "@/modules/geo";
import { localePath, routableLocale } from "@/modules/i18n";

import { listingExists, listingLocales, listingPages } from "./listing";

/**
 * The page a `/{locale}/…` path names, or `notFound`.
 *
 * Each branch carries the **params the page component needs and nothing more**: an ISO code and a
 * locale, never a rendered view — the route asks the owning module for the view model, which is
 * where the single-source rule of spec 008 §5.2 lives.
 */
export type LocalePathResolution =
  | { readonly kind: "notFound" }
  | { readonly kind: "destinationsHub"; readonly locale: LocaleCode }
  | {
      readonly kind: "corridor";
      readonly locale: LocaleCode;
      readonly iso2: CountryIso2;
      /** The destination's slug in this locale, as the URL spells it. */
      readonly countrySlug: string;
    }
  | {
      readonly kind: "countryShopRoot";
      readonly locale: LocaleCode;
      readonly iso2: CountryIso2;
      readonly countrySlug: string;
    };

const NOT_FOUND: LocalePathResolution = { kind: "notFound" };

/** Whether `segment` is **this** locale's own segment for a page type (`plan/02` §4). */
function isOwnSegment(
  locale: LocaleCode,
  pageType: "destinations" | "shopCategory",
  segment: string,
): boolean {
  return localePath(locale, pageType) === `/${locale}/${segment}`;
}

/**
 * Which page `/{locale}/{segments…}` is, over the two shared route depths.
 *
 * Every shape spec 008 AC-1 and spec 007 AC-5 require to 404 arrives here as a miss: an unknown
 * locale, a segment belonging to another locale, an uppercase variant (slugs and segments are
 * authored lowercase and nothing folds case — ADR-0006), an unknown slug, an unpublished country
 * and a country with no deliverable product. None of them is a redirect and none of them is an
 * empty page. A **trailing slash** never reaches this function: `trailingSlash: false` makes it a
 * 308 to the bare URL before routing (spec 008 §14 A7, spec 007 §14 A6).
 */
export async function resolveLocalePath(
  locale: string,
  segments: readonly string[],
): Promise<LocalePathResolution> {
  const config = routableLocale(locale);
  if (config === undefined || !isLocaleCode(config.code)) return NOT_FOUND;
  const code = config.code;

  if (segments.length === 1) {
    const [segment] = segments;
    if (segment === undefined) return NOT_FOUND;
    // `/{locale}/{destinations}` — the all-destinations hub exists in every routable locale
    // (spec 007 §2: its URL is in that locale's own footer and breadcrumb).
    if (isOwnSegment(code, "destinations", segment)) {
      return { kind: "destinationsHub", locale: code };
    }
    // `/{locale}/{occasions}` is TASK-113's, and `/{locale}/{shopCategory}` is a 404 by §13 Q4.
    return NOT_FOUND;
  }

  if (segments.length === 2) {
    const [segment, child] = segments;
    if (segment === undefined || child === undefined) return NOT_FOUND;

    // `/{locale}/{destinations}/{countrySlug}` — spec 007's corridor page.
    if (isOwnSegment(code, "destinations", segment)) {
      const iso2 = corridorIso2ForSlug(code, child);
      if (iso2 === undefined || !corridorPageExists(iso2, code)) {
        return NOT_FOUND;
      }
      return { kind: "corridor", locale: code, iso2, countrySlug: child };
    }

    // `/{locale}/{countrySlug}/{shopCategory}` — spec 008's country shop root. The destination
    // comes **first** in a shop URL (`plan/02` §4.2: price, currency, VAT wording and
    // availability all depend on it), which is the collision that made this file necessary.
    if (isOwnSegment(code, "shopCategory", child)) {
      const iso2 = corridorIso2ForSlug(code, segment);
      if (iso2 === undefined || !isCountryIso2(iso2)) return NOT_FOUND;
      const exists = await listingExists({
        pageType: "countryShopRoot",
        locale: code,
        countryIso: iso2,
      });
      if (!exists) return NOT_FOUND;
      return {
        kind: "countryShopRoot",
        locale: code,
        iso2,
        countrySlug: segment,
      };
    }
  }

  return NOT_FOUND;
}

/** One prebuilt URL of the depth-2 route file. */
export interface LocaleSegmentParams {
  readonly locale: string;
  readonly segment: string;
}

/** One prebuilt URL of the depth-3 route file. */
export interface LocaleChildParams extends LocaleSegmentParams {
  readonly child: string;
}

/**
 * `generateStaticParams` for `/{locale}/{segment}` — the **union** of the existence sets that
 * share the depth (spec 008 §14 A5). Today: the all-destinations hub in every routable locale.
 */
export function localeSegmentParams(): readonly LocaleSegmentParams[] {
  return listingLocales().map((locale) => ({
    locale,
    // The localised segment, from `locales.data.ts` through the one URL builder:
    // `/en/send-flowers-to`, `/de/blumen-verschicken`, `/pl/wyslij-kwiaty`.
    segment: localePath(locale, "destinations").split("/")[2] ?? "",
  }));
}

/**
 * `generateStaticParams` for `/{locale}/{segment}/{child}` — the union of spec 007's corridor set
 * and spec 008's country-shop-root set, each read from its own predicate rather than restated
 * here (AC-3). With `dynamicParams = false` this list *is* the 200 set: every other slug, segment
 * and casing variant is a 404 answered by the router.
 */
export async function localeChildParams(): Promise<
  readonly LocaleChildParams[]
> {
  const params: LocaleChildParams[] = [];

  for (const locale of listingLocales()) {
    const destinations = localePath(locale, "destinations").split("/")[2] ?? "";
    const shopCategory = localePath(locale, "shopCategory").split("/")[2] ?? "";

    for (const page of await listingPages(locale)) {
      if (page.pageType !== "countryShopRoot") continue;
      if (page.countrySlug === undefined) continue;
      params.push({ locale, segment: page.countrySlug, child: shopCategory });
    }

    for (const slug of corridorSlugsIn(locale)) {
      params.push({ locale, segment: destinations, child: slug });
    }
  }

  return params;
}

/**
 * Spec 007's corridor existence set for one locale, as slugs.
 *
 * `listCorridorPages()` is spec 007's own enumeration of that set — the list its route prebuilt
 * before the move — so this file adds no second rule about which corridors exist, and the slug is
 * the one `corridorSlug()` built rather than a second spelling of it.
 */
function corridorSlugsIn(locale: LocaleCode): readonly string[] {
  return listCorridorPages()
    .filter((page) => page.locale === locale)
    .map((page) => page.slug);
}
