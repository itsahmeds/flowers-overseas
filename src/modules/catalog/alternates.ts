/**
 * **This page in every launch locale**, for the header, menu and footer language links (spec 003
 * §2 "Header locale switcher", §5.3; spec 004 §14 A24 AC-47; TASK-233).
 *
 * The locale layout mounts the switcher and does not know the page, so each URL depth has a
 * `@switcher` slot page that hands its path segments here. The answer is the page type's own
 * existence answer, never a rewrite of the path: `resolveLocalePath()` names the page, and the
 * builder its route already hands the language popup (`LanguageAlternates`) lists the locales that
 * have it — `corridorAlternatePaths()` for a guide, `listingAlternatePaths()` for the six listing
 * pages, `productAlternatePaths()` for a product. A locale missing from the map has no such page,
 * and the switcher links its home instead (§2 "falling back to the locale home"), so no language
 * link can reach a 404 (spec 004 AC-14, spec 008 AC-21).
 *
 * An empty segment list is the locale home; a path the resolver refuses is `{}`.
 */
import { launchLocaleCodes, localePath } from "@/modules/i18n";
import {
  blogIndexAlternatePaths,
  blogPostAlternatePaths,
  infoPageAlternatePaths,
} from "@/modules/content";
import { corridorAlternatePaths } from "@/modules/geo";

import { listingAlternatePaths } from "./listing";
import { productAlternatePaths } from "./product";
import { resolveLocalePath } from "./routes";
import { resolveSlug } from "./slugs";

/** Every launch locale's path of one page type that exists in all of them. */
function everyLocale(
  pageType: "home" | "destinations",
): Record<string, string> {
  return Object.fromEntries(
    launchLocaleCodes().map((code) => [code, localePath(code, pageType)]),
  );
}

export async function pageAlternatePaths(
  locale: string,
  segments: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  if (segments.length === 0) return everyLocale("home");
  const match = await resolveLocalePath(locale, segments);
  switch (match.kind) {
    case "notFound":
      return {};
    case "destinationsHub":
      return everyLocale("destinations");
    case "occasionsIndex":
      return listingAlternatePaths({
        pageType: "occasionsIndex",
        locale: match.locale,
      });
    case "corridor":
      return corridorAlternatePaths(match.iso2);
    case "countryShopRoot":
      return listingAlternatePaths({
        pageType: "countryShopRoot",
        locale: match.locale,
        countryIso: match.iso2,
      });
    case "categoryHub":
    case "occasionHub": {
      const entityKey = resolveSlug(
        match.locale,
        match.kind === "categoryHub" ? "category" : "occasion",
        match.slug,
      );
      return entityKey === undefined
        ? {}
        : listingAlternatePaths({
            pageType: match.kind,
            locale: match.locale,
            entityKey,
          });
    }
    case "countryCategory": {
      const entityKey = resolveSlug(
        match.locale,
        "category",
        match.categorySlug,
      );
      return entityKey === undefined
        ? {}
        : listingAlternatePaths({
            pageType: "countryCategory",
            locale: match.locale,
            countryIso: match.iso2,
            entityKey,
          });
    }
    case "countryOccasion":
      return listingAlternatePaths({
        pageType: "countryOccasion",
        locale: match.locale,
        countryIso: match.iso2,
        entityKey: match.occasionKey,
      });
    case "infoPage":
      return infoPageAlternatePaths(match.pageId);
    case "product":
      return productAlternatePaths({
        sku: match.sku,
        countryIso: match.iso2,
      });
    // Spec 044 (TASK-322): the locales where the blog page exists now, `en` and `en-gb` only.
    case "blogIndex":
      return blogIndexAlternatePaths(launchLocaleCodes());
    case "blogPost":
      return blogPostAlternatePaths(launchLocaleCodes(), match.slug);
  }
}
