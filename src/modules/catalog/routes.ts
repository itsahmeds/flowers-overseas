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
 * **Spec 009's product page is the third page type at depth 4** (TASK-121):
 * `/{locale}/{countrySlug}/{product}/{productSlug}` is the same three dynamic positions under a
 * third set of names, so it resolves here too, through `productPageExists()`. It is the one
 * branch whose route sets `dynamicParams = true` — the prebuild is the top 24 products per
 * (locale, destination) rather than the whole existence set (spec 009 §2, AC-3) — which is why
 * its existence rule is read on every request instead of once at build time.
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
 * **Depth 2 carries two page types** (TASK-113): spec 007's all-destinations hub and spec 008's
 * occasions index `/{locale}/{occasions}` (§2 row 14). They are disjoint by segment — this
 * locale's `destinations` segment against its `occasions` segment — and `/{locale}/{shopCategory}`
 * stays a 404 at this depth, because no country-less categories index ships (§13 Q4).
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
import { productPageExists, productPrebuildPages } from "./product";
import { ProductParamsSchema } from "./schemas";
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
    }
  | {
      /**
       * Spec 009's product detail page, `/{locale}/{countrySlug}/{product}/{productSlug}` — the
       * third page type at depth 4 (TASK-121). Its existence answer is `productPageExists()`,
       * exactly as the two listing branches read `listingExists()`.
       */
      readonly kind: "product";
      readonly locale: LocaleCode;
      readonly iso2: CountryIso2;
      readonly countrySlug: string;
      /** The catalogue key the URL's slug resolves to (`FO-BQ-001`), never the slug itself. */
      readonly sku: string;
      /** The product's slug in this locale, as the URL spells it. */
      readonly productSlug: string;
    }
  /**
   * The **occasions index** `/{locale}/{occasions}` (spec 008 §2 row 14, **AC-20**; TASK-113).
   *
   * One URL per locale and no entity at all, so it carries the locale and nothing else — the
   * destinations hub's shape, one segment over. It exists iff at least one occasion hub exists in
   * that locale, which is `listingExists()`'s answer and not a rule restated here.
   */
  | { readonly kind: "occasionsIndex"; readonly locale: LocaleCode };

const NOT_FOUND: LocalePathResolution = { kind: "notFound" };

/** Whether `segment` is **this** locale's own segment for a page type (`plan/02` §4). */
function isOwnSegment(
  locale: LocaleCode,
  pageType: "destinations" | "shopCategory" | "occasions" | "product",
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
    // `/{locale}/{occasions}` — the occasions index (§2 row 14; TASK-113). Unlike the hub above
    // it is **not** in every routable locale: a locale in which no occasion has an authored slug
    // has no hub to list, so the page does not exist there and the URL is a hard 404. That is
    // `listingExists()`'s rule, asked once.
    if (isOwnSegment(code, "occasions", segment)) {
      const exists = await listingExists({
        pageType: "occasionsIndex",
        locale: code,
      });
      return exists ? { kind: "occasionsIndex", locale: code } : NOT_FOUND;
    }
    // `/{locale}/{shopCategory}` is a 404 by §13 Q4: no country-less categories index ships.
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

    // `/{locale}/{countrySlug}/{product}/{productSlug}` — spec 009's product detail page (§2;
    // TASK-121), the third page type sharing this depth. Two things make it the only route in the
    // site that reads its existence rule at **request** time as well as at build time: the PDP
    // route sets `dynamicParams = true` (the prebuild is the top 24 per locale and destination,
    // not the 200 set — spec 009 AC-3), and `productPageExists()` is what keeps the two equal.
    // Every 404 shape of AC-1 arrives here as a miss: an unknown slug (`resolveSlug`), a product
    // with no active price in that destination, an unpublished destination and a locale with no
    // slug for the product (`productPageExists`), another locale's `product` segment
    // (`isOwnSegment`), and an uppercase or otherwise non-canonical segment (the schema).
    if (isOwnSegment(code, "product", child)) {
      const params = ProductParamsSchema.safeParse({
        locale: code,
        country: segment,
        slug: grandchild,
      });
      if (!params.success) return NOT_FOUND;
      const iso2 = corridorIso2ForSlug(code, params.data.country);
      if (iso2 === undefined || !isCountryIso2(iso2)) return NOT_FOUND;
      const sku = resolveSlug(code, "product", params.data.slug);
      if (sku === undefined) return NOT_FOUND;
      if (!(await productPageExists({ locale: code, countryIso: iso2, sku }))) {
        return NOT_FOUND;
      }
      return {
        kind: "product",
        locale: code,
        iso2,
        countrySlug: params.data.country,
        sku,
        productSlug: params.data.slug,
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
 * share the depth (spec 008 §14 A5): spec 007's all-destinations hub, which exists in every
 * routable locale, and spec 008's occasions index, which exists only where an occasion hub does
 * (TASK-113). With `dynamicParams = false` this list *is* the 200 set at this depth.
 *
 * Asynchronous since the index joined it, for `localeChildParams()`'s reason: the second member
 * is `listingExists()`'s answer and not a fact about the locale registry, so it is read from the
 * predicate rather than restated. `/pl/okazje` is a 404 today because no occasion has a Polish
 * slug yet, and it becomes a page the day one is authored — with no edit here.
 */
export async function localeSegmentParams(): Promise<
  readonly LocaleSegmentParams[]
> {
  const params: LocaleSegmentParams[] = [];
  for (const locale of listingLocales()) {
    params.push({
      locale,
      // The localised segment, from `locales.data.ts` through the one URL builder:
      // `/en/send-flowers-to`, `/de/blumen-verschicken`, `/pl/wyslij-kwiaty`.
      segment: localePath(locale, "destinations").split("/")[2] ?? "",
    });
    if (await listingExists({ pageType: "occasionsIndex", locale })) {
      params.push({
        locale,
        segment: localePath(locale, "occasions").split("/")[2] ?? "",
      });
    }
  }
  return params;
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
 * `generateStaticParams` for the **product** pages of `/{locale}/{segment}/{child}/{grandchild}`
 * (spec 009 **AC-3**; TASK-121).
 *
 * Separate from `localeGrandchildParams()` and unioned with it by the route file, because the two
 * halves of that depth answer a different question. The listing half **is** the 200 set:
 * `dynamicParams = false` makes every URL outside it a 404 answered by the router. The product
 * half is a *prebuild*: `plan/01` §3's budget says prebuild the top 24 per (locale, destination)
 * and generate the rest on demand, so the PDP route sets `dynamicParams = true` and the 404
 * guarantee moves into `productPageExists()`, which this resolver calls on every request. Mixing
 * the two lists into one function would hide exactly that difference.
 *
 * Every field is read from `productPrebuildPages()` rather than restated: the destination's slug
 * and the product's slug are the ones the existence set already carries, and the page-type
 * segment is the one `localePath()` builds — so a product that gains a price in a destination
 * gains its URL from the data alone, with no edit under `src/app/`.
 */
export async function localeProductParams(): Promise<
  readonly LocaleGrandchildParams[]
> {
  const params: LocaleGrandchildParams[] = [];

  for (const page of await productPrebuildPages()) {
    params.push({
      locale: page.locale,
      segment: page.countrySlug,
      child: localePath(page.locale, "product").split("/")[2] ?? "",
      grandchild: page.slug,
    });
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
