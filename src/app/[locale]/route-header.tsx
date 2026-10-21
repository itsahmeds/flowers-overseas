import type { ReactElement } from "react";
import { setRequestLocale } from "next-intl/server";

import { isLocaleCode } from "@/config/locales";
import {
  PageLocaleSwitcher,
  destinationShopLinks,
  listingAlternatePaths,
  pageDestination,
} from "@/modules/catalog";
import { documentFallbackLocale, routableLocale } from "@/modules/i18n";
import {
  type HeaderListingHrefs,
  NoticePriceClaim,
  SiteHeader,
  headerListingTargets,
  inContextListingHrefs,
} from "@/modules/ui";

/**
 * The commerce header **as one route draws it** (spec 043 §2 A, §5.3 A, §5.4, AC-1 to AC-4;
 * TASK-288), rendered by the `@header` parallel-route slot, one file per route under `[locale]`.
 *
 * Why a slot: on a page whose URL names a destination with a shop (its shop root, a country
 * category or occasion, a product page, its guide), the header's shop items link to that
 * destination's own priced pages; everywhere else they link exactly where they did. The layout
 * cannot know the route without reading the request, which would make every page dynamic, so the
 * route decides, the way `@switcher` already does: each slot page receives its route's params,
 * renders at build and revalidation like the page under it, and reads no header, cookie or search
 * parameter. No `Vary`, no `Set-Cookie`, no client JavaScript (AC-4).
 *
 * **No stale row on a client navigation** (§5.3 A, AC-3): Next keeps an unmatched slot's previous
 * content on a soft navigation and uses `default.tsx` only on a full load, so the slot has a page
 * for **every** route under `[locale]` (`tests/unit/header-slot.test.tsx` diffs the two trees).
 *
 * The whole header is the slot's, not just its links, because the row and the phone Menu draw the
 * same entries in two places and a slot is one node. So the two things the layout used to hand the
 * header are decided here too, exactly as their own slots decide them: the price claim, on every
 * page but the locale home (the `@notice` slot this replaces; founder, 2026-10-04), and the
 * language links, with this page's own segments wherever `@switcher` mirrors the route and the
 * locale homes where it falls back to its `default.tsx` (`switcherSegments`).
 *
 * `segments` are the path after the locale as the route's params spell it; they decide the
 * destination context (`pageDestination()`), and nothing else does.
 */
export async function RouteHeader({
  locale: requested,
  segments,
  switcherSegments,
  home = false,
}: {
  readonly locale: string;
  readonly segments: readonly string[];
  readonly switcherSegments: readonly string[];
  /** The locale home: no price claim in the notice bar. */
  readonly home?: boolean;
}): Promise<ReactElement> {
  const locale = (routableLocale(requested) ?? documentFallbackLocale()).code;
  setRequestLocale(locale);
  const outOfContext = await headerListingHrefs(locale);
  const destination = await pageDestination(locale, segments);
  const shopLinks =
    destination === undefined
      ? undefined
      : await destinationShopLinks(locale, destination);
  return (
    <SiteHeader
      locale={locale}
      listingHrefs={
        shopLinks === undefined
          ? outOfContext
          : inContextListingHrefs(outOfContext, shopLinks)
      }
      priceClaim={home ? null : <NoticePriceClaim />}
      switcher={
        <PageLocaleSwitcher locale={locale} segments={switcherSegments} />
      }
    />
  );
}

/**
 * The header's listing-page links that **exist** in this locale (spec 008 §14 A14, spec 004 §14
 * A20; TASK-173): each identity the header names, asked of the catalogue's one existence rule
 * through `listingAlternatePaths()`, and kept only where it answers with a path here. Composed in
 * `app/` because `src/modules/ui` may not read the catalogue. A pseudo-locale has no listing page,
 * so it gets none. Moved here from the `[locale]` layout by TASK-288, unchanged.
 */
async function headerListingHrefs(locale: string): Promise<HeaderListingHrefs> {
  if (!isLocaleCode(locale)) return {};
  const resolved = await Promise.all(
    headerListingTargets().map(
      async ({ id, identity }) =>
        [
          id,
          (await listingAlternatePaths({ ...identity, locale }))[locale],
        ] as const,
    ),
  );
  return Object.fromEntries(resolved.filter(([, path]) => path !== undefined));
}
