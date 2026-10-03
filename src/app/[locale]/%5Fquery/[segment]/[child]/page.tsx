import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LISTING_REWRITE_KEYS } from "@/lib/listing-rewrites";
import {
  type ListingRequest,
  listingRequest,
  resolveLocalePath,
} from "@/modules/catalog";

import {
  CountryShopRoot,
  countryShopRootMetadata,
} from "../../../country-shop-root";

/**
 * `/{locale}/_query/{segment}/{child}` — the **parameter route**: the one route file that reads the
 * query string (spec 008 §2 "Sort, filters, pagination", §5.4, AC-9/AC-10/AC-15/AC-16, AC-22;
 * TASK-114's reading, moved here by TASK-170).
 *
 * Nobody links here and no address shows it. `next.config.ts` rewrites a country shop root request
 * that carries a parameter the listing honours (`?page=`, `?sort=`, a facet name;
 * `src/lib/listing-rewrites.ts`) to this path, with the query string intact, so the visitor's
 * address stays `/{locale}/{country}/{shopCategory}?…`. Every other request at that address is
 * the prebuilt depth-3 route, which reads no query string and therefore keeps the router's
 * `dynamicParams = false` gate (TASK-170 E-1: a route that reads `searchParams` is rendered per
 * request and loses that gate, and its unknown paths got Next's error shell with no `lang`).
 *
 * **Rendering: per request**, because the answer depends on the query — spec 008 §13 Q2 as the
 * founder resolved it, cached at the edge by full URL through `src/lib/listing-cache-headers.ts`.
 * The head and body are `../../../country-shop-root.tsx`'s, the same functions the depth-3 route
 * calls with an empty query, so the two cannot drift; only the `ListingRequest` differs.
 *
 * **Existence** is `resolveLocalePath()`'s, as in the depth-3 route. An unknown country with a
 * known parameter (`/en/atlantis/flowers?page=2`) resolves to nothing here and is a request-time
 * `notFound()`: status 404, inside Next's error shell rather than the localised document. That
 * residual is recorded in TASK-170's brief and pinned by the e2e: nothing links to it, and its
 * status is right. A request that reaches this path **without** any rewrite key (typed by hand)
 * is a 404 too, so the internal path never serves a second copy of the bare page.
 */
export const dynamic = "force-dynamic";

interface ParameterRouteProps {
  params: Promise<{ locale: string; segment: string; child: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The request's own query, parsed by the one policy (`listingRequest()`), once per render pass —
 * or a 404 when it carries none of the keys the rewrite is keyed on, because then the request
 * did not come through the rewrite and the bare page is the depth-3 route's to serve.
 */
async function listingQuery(
  searchParams: ParameterRouteProps["searchParams"],
): Promise<ListingRequest> {
  const query = await searchParams;
  if (!LISTING_REWRITE_KEYS.some((key) => key in query)) notFound();
  return listingRequest(query);
}

export async function generateMetadata({
  params,
  searchParams,
}: ParameterRouteProps): Promise<Metadata> {
  const { locale, segment, child } = await params;
  const match = await resolveLocalePath(locale, [segment, child]);
  if (match.kind !== "countryShopRoot") notFound();
  const request = await listingQuery(searchParams);
  return countryShopRootMetadata(match, request);
}

export default async function ParameterRoute({
  params,
  searchParams,
}: ParameterRouteProps) {
  const { locale, segment, child } = await params;
  const match = await resolveLocalePath(locale, [segment, child]);
  if (match.kind !== "countryShopRoot") notFound();
  const request = await listingQuery(searchParams);
  return <CountryShopRoot match={match} request={request} />;
}
