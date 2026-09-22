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
 * /{locale}/{segment}                      → src/app/[locale]/[segment]/page.tsx
 * /{locale}/{segment}/{child}              → src/app/[locale]/[segment]/[child]/page.tsx
 * /{locale}/{segment}/{child}/{grandchild} → src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx
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
 * **Depth 4 follows the same rule** (TASK-110, TASK-111): `/{locale}/{segment}/{child}/{grandchild}`
 * is one more shared file, `src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx`, because
 * spec §5.2's two depth-4 drawings (`[country]/[shopCategory]/[category]` and
 * `[country]/[occasions]/[occasion]`) collide with each other *and* with the depth-3 file's own
 * slug names. Both the country category and the country occasion resolve here.
 *
 * **Four page types now share depth 3** (TASK-112): the corridor page, the country shop root, the
 * category hub `/{locale}/{shopCategory}/{categorySlug}` and the occasion hub
 * `/{locale}/{occasions}/{occasionSlug}`. They are **disjoint by their first segment** — this
 * locale's `destinations` segment (corridor), its `shopCategory` segment (category hub), its
 * `occasions` segment (occasion hub), or a country slug (shop root) — and spec 008 **AC-4**'s
 * collision matrix is what keeps those four sets from intersecting: no country slug equals a path
 * segment in its locale, and `seed:check` refuses a category or occasion slug that equals a
 * `PATH_SEGMENT_KEYS` value or a country slug. The branches below are therefore **appended**
 * rather than interleaved, and `tests/unit/catalog-routes.test.ts` asserts both halves — that each
 * shape resolves to exactly one kind, and that a path whose segments match two branches' shapes
 * still resolves deterministically to the one listed first.
 *
 * **What is not here yet.** `occasionsIndex` shares depth 2 with the destinations hub; TASK-113
 * adds its branch to this union and its component to the depth-2 route file. Until then that URL
 * resolves to `notFound`, which is what it must do while the page does not exist.
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
import { resolveSlug } from "./slugs";

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
    }
  | {
      readonly kind: "countryCategory";
      readonly locale: LocaleCode;
      readonly iso2: CountryIso2;
      readonly countrySlug: string;
      /** The category's slug in this locale, as the URL spells it. */
      readonly categorySlug: string;
    }
  | {
      readonly kind: "countryOccasion";
      readonly locale: LocaleCode;
      readonly iso2: CountryIso2;
      readonly countrySlug: string;
      /** The catalogue key the URL's slug resolves to (`mothersDay`), never the slug itself. */
      readonly occasionKey: string;
      /** The occasion's slug in this locale, as the URL spells it. */
      readonly occasionSlug: string;
    }
  /**
   * The two destination-less hubs (spec 008 §2 rows 10 and 13, **AC-7**, **AC-11**; TASK-112).
   *
   * They carry the **slug** and not the catalogue key, exactly as the corridor and the shop root
   * carry the country slug: the page asks `listingView()` for the view model with the slug the URL
   * spells, so one function resolves a slug to a key and the route never holds a second answer to
   * "which entity is this". No `iso2`: a hub has no destination, which is the whole reason it
   * shows no money (§8).
   */
  | {
      readonly kind: "categoryHub";
      readonly locale: LocaleCode;
      readonly slug: string;
    }
  | {
      readonly kind: "occasionHub";
      readonly locale: LocaleCode;
      readonly slug: string;
    };

const NOT_FOUND: LocalePathResolution = { kind: "notFound" };

/** Whether `segment` is **this** locale's own segment for a page type (`plan/02` §4). */
function isOwnSegment(
  locale: LocaleCode,
  pageType: "destinations" | "shopCategory" | "occasions",
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

    // `/{locale}/{shopCategory}/{categorySlug}` — the destination-less category hub (§2 row 10).
    // The bare `/{locale}/{shopCategory}` stays a 404: no country-less categories index ships
    // (§13 Q4), which is the depth-2 branch above refusing this segment.
    if (isOwnSegment(code, "shopCategory", segment)) {
      return hubResolution(code, "categoryHub", "category", child);
    }

    // `/{locale}/{occasions}/{occasionSlug}` — the occasion hub (§2 row 13). The bare
    // `/{locale}/{occasions}` is the occasions index, TASK-113's, and 404s until it exists.
    if (isOwnSegment(code, "occasions", segment)) {
      return hubResolution(code, "occasionHub", "occasion", child);
    }
  }

  if (segments.length === 3) {
    const [segment, child, grandchild] = segments;
    if (
      segment === undefined ||
      child === undefined ||
      grandchild === undefined
    ) {
      return NOT_FOUND;
    }

    // `/{locale}/{countrySlug}/{shopCategory}/{categorySlug}` — spec 008's country category
    // (§2 row 7; TASK-110). The slug is turned into a catalogue key by `resolveSlug()`, the
    // inverse `slugFor()` built (AC-4), and the key is handed to the **one** existence predicate:
    // no rule about the six-product floor is restated here, which is why lifting a category over
    // it is a data flip with no edit under `src/app/` (AC-5).
    if (isOwnSegment(code, "shopCategory", child)) {
      const iso2 = corridorIso2ForSlug(code, segment);
      if (iso2 === undefined || !isCountryIso2(iso2)) return NOT_FOUND;
      const entityKey = resolveSlug(code, "category", grandchild);
      if (entityKey === undefined) return NOT_FOUND;
      const exists = await listingExists({
        pageType: "countryCategory",
        locale: code,
        countryIso: iso2,
        entityKey,
      });
      if (!exists) return NOT_FOUND;
      return {
        kind: "countryCategory",
        locale: code,
        iso2,
        countrySlug: segment,
        categorySlug: grandchild,
      };
    }

    // `/{locale}/{countrySlug}/{occasions}/{occasionSlug}` — spec 008's country occasion
    // (§2 row 8; TASK-111). The slug is resolved to a catalogue **key** here and the key is what
    // the existence rule is asked about: `listingExists()` reads `observed`, the product-count
    // floor and the authored slug, and this function adds none of them.
    if (isOwnSegment(code, "occasions", child)) {
      const iso2 = corridorIso2ForSlug(code, segment);
      if (iso2 === undefined || !isCountryIso2(iso2)) return NOT_FOUND;
      const occasionKey = resolveSlug(code, "occasion", grandchild);
      if (occasionKey === undefined) return NOT_FOUND;
      const exists = await listingExists({
        pageType: "countryOccasion",
        locale: code,
        countryIso: iso2,
        entityKey: occasionKey,
      });
      if (!exists) return NOT_FOUND;
      return {
        kind: "countryOccasion",
        locale: code,
        iso2,
        countrySlug: segment,
        occasionKey,
        occasionSlug: grandchild,
      };
    }
  }

  return NOT_FOUND;
}

/**
 * One hub, resolved from the slug the URL spells (spec 008 §2 rows 10 and 13, §14 **A1**).
 *
 * Two misses, both of them 404s and neither a redirect: a slug this locale has never authored
 * (`resolveSlug()` answers `undefined` — the German and Polish hubs do not exist until TASK-106
 * authors their slugs), and an entity whose hub fails its existence rule (`listingExists()`, which
 * reads §14 A1's evergreen clause as well as the seasonal one). The rule is read here and nowhere
 * else, so the router, `generateStaticParams`, the sitemap and the link renderers cannot disagree.
 */
async function hubResolution(
  locale: LocaleCode,
  pageType: "categoryHub" | "occasionHub",
  kind: "category" | "occasion",
  slug: string,
): Promise<LocalePathResolution> {
  const entityKey = resolveSlug(locale, kind, slug);
  if (entityKey === undefined) return NOT_FOUND;
  const exists = await listingExists({ pageType, locale, entityKey });
  if (!exists) return NOT_FOUND;
  return { kind: pageType, locale, slug };
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

/** One prebuilt URL of the depth-4 route file (spec 008 §14 A5's "depth-4 routes"). */
export interface LocaleGrandchildParams extends LocaleChildParams {
  readonly grandchild: string;
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

    const occasions = localePath(locale, "occasions").split("/")[2] ?? "";

    for (const page of await listingPages(locale)) {
      if (
        page.countrySlug !== undefined &&
        page.pageType === "countryShopRoot"
      ) {
        params.push({ locale, segment: page.countrySlug, child: shopCategory });
        continue;
      }
      // The two hubs (TASK-112). Their segment is the *page type's* localised segment and their
      // child is the entity's authored slug — the mirror image of the shop root, whose segment is
      // the destination. Both come from `listingPages()`, so the prebuilt set is the existence set
      // and nothing here restates a rule (AC-3).
      if (page.slug === undefined) continue;
      if (page.pageType === "categoryHub") {
        params.push({ locale, segment: shopCategory, child: page.slug });
      } else if (page.pageType === "occasionHub") {
        params.push({ locale, segment: occasions, child: page.slug });
      }
    }

    for (const slug of corridorSlugsIn(locale)) {
      params.push({ locale, segment: destinations, child: slug });
    }
  }

  return params;
}

/**
 * `generateStaticParams` for `/{locale}/{segment}/{child}/{grandchild}` — the **union** of the
 * existence sets that share depth 4 (spec 008 §14 A5's rule applied one level down): the country
 * categories of §2 row 7 (TASK-110) and the country occasions of §2 row 8 (TASK-111).
 *
 * Every field is read from `listingPages()` rather than restated: the destination's slug and the
 * entity's slug are the ones the existence set already carries, and the page-type segment is the
 * one `localePath()` builds — so a category that crosses the six-product floor gains its URL from
 * the data alone (**AC-5**), and one that falls below it loses it at the next build rather than
 * becoming a thin page. Neither branch names a country, a category or a floor.
 */
export async function localeGrandchildParams(): Promise<
  readonly LocaleGrandchildParams[]
> {
  const params: LocaleGrandchildParams[] = [];

  for (const locale of listingLocales()) {
    const shopCategory = localePath(locale, "shopCategory").split("/")[2] ?? "";
    const occasions = localePath(locale, "occasions").split("/")[2] ?? "";

    for (const page of await listingPages(locale)) {
      if (page.countrySlug === undefined || page.slug === undefined) continue;
      const child =
        page.pageType === "countryCategory"
          ? shopCategory
          : page.pageType === "countryOccasion"
            ? occasions
            : undefined;
      if (child === undefined) continue;
      params.push({
        locale,
        segment: page.countrySlug,
        child,
        grandchild: page.slug,
      });
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
