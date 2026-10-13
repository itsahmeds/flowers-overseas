import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LISTING_REWRITE_KEYS } from "@/lib/listing-rewrites";
import {
  type ListingRequest,
  type LocalePathResolution,
  listingRequest,
  resolveLocalePath,
} from "@/modules/catalog";

import {
  CountryListing,
  type CountryListingMatch,
  countryListingMetadata,
} from "../../../../country-listing";

/**
 * `/{locale}/_query/{segment}/{child}/{grandchild}` — the **depth-4 parameter route**: the one
 * route file at depth 4 that reads the query string (spec 008 §14 **A15 (a)**, A13, AC-10, AC-15,
 * AC-29; TASK-146, TASK-187). It mirrors the depth-3 parameter route one level down.
 *
 * Nobody links here and no address shows it. `next.config.ts` rewrites a country category or
 * country occasion request carrying a listing key (`?page=`, `?sort=`, a facet name;
 * `src/lib/listing-rewrites.ts`) to this path with the query string intact, so the visitor's
 * address stays `/{locale}/{country}/{shopCategory|occasions}/{entity}?…`. Every other request at
 * that address is the prebuilt depth-4 route, which reads no query string and keeps the router's
 * `dynamicParams = false` gate.
 *
 * **Rendering: per request**, cached at the edge by full URL (`src/lib/listing-cache-headers.ts`).
 * The head and body are `../../../../country-listing.tsx`'s, the same functions the prebuilt route
 * calls with an empty query, so the two cannot drift; only the `ListingRequest` differs.
 *
 * **Existence** is `resolveLocalePath()`'s: only the two listing kinds resolve here, so a product
 * URL (which no rewrite sends here anyway), an unknown slug, or a path that is not the canonical
 * lowercase one is a request-time 404 (A13's accepted residual, now at depth 4). A request with no
 * listing key (typed by hand) is a 404 too, so the internal path never serves a second copy of the
 * bare page, and a direct hit carries `X-Robots-Tag: noindex, nofollow` (`parameterRouteHeaderRules()`
 * matches every path under `_query`).
 */
export const dynamic = "force-dynamic";

interface ParameterRouteProps {
  params: Promise<{
    locale: string;
    segment: string;
    child: string;
    grandchild: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The two listing kinds of depth 4; a product or anything else is not this route's. */
function listingMatch(match: LocalePathResolution): CountryListingMatch {
  if (match.kind !== "countryCategory" && match.kind !== "countryOccasion")
    notFound();
  return match;
}

/**
 * The request's own query, parsed by the one policy (`listingRequest()`), or a 404 when it carries
 * none of the keys the rewrite is keyed on: then it did not come through the rewrite.
 */
async function listingQuery(
  searchParams: ParameterRouteProps["searchParams"],
): Promise<ListingRequest> {
  const request = listingRequest(await searchParams);
  if (!request.keys.some((key) => LISTING_REWRITE_KEYS.includes(key)))
    notFound();
  return request;
}

export async function generateMetadata({
  params,
  searchParams,
}: ParameterRouteProps): Promise<Metadata> {
  const { locale, segment, child, grandchild } = await params;
  const match = listingMatch(
    await resolveLocalePath(locale, [segment, child, grandchild]),
  );
  const request = await listingQuery(searchParams);
  return countryListingMetadata(match, request);
}

export default async function ParameterRoute({
  params,
  searchParams,
}: ParameterRouteProps) {
  const { locale, segment, child, grandchild } = await params;
  const match = listingMatch(
    await resolveLocalePath(locale, [segment, child, grandchild]),
  );
  const request = await listingQuery(searchParams);
  return <CountryListing match={match} request={request} />;
}
