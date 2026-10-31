import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { PRODUCT_QUERY_KEYS } from "@/config/url-keys";
import {
  type ProductQuery,
  type ProductSearchRequest,
  productSearchParams,
} from "@/modules/catalog";

import {
  type ProductRequest,
  type ProductRouteParams,
  productMatch,
  productRouteBody,
  productRouteMetadata,
} from "../../../../../product-route";

/**
 * `/{locale}/_query/-product/{segment}/{child}/{grandchild}` — **the product page's parameter
 * route**: the one route file that reads `?tier=` and `?date=` (spec 009 §5.2, §14 **A10**, AC-15,
 * AC-24; T-15, T-24; TASK-128).
 *
 * Nobody links here and no address shows it. The product page's `GET` form submits to the bare
 * product URL, and `next.config.ts` rewrites a product address carrying `?tier=` or `?date=` to
 * this path with the query intact (`src/lib/product-rewrites.ts`), so the visitor's address stays
 * `/{locale}/{country}/{product}/{slug}?…`. Every other request at that address is the prebuilt
 * product route, which reads no query string. Its own file under `_query`, not the depth-4
 * listing parameter route, so no parameterised listing loads the product island (AC-37).
 *
 * **Rendering: per request.** The head and body are `../../../../../product-route.tsx`'s, the same
 * functions the product route calls; only the request differs: `parameterised: true` (the URL
 * carries a key by construction), so `productView()`'s indexability is `noindex,follow` through
 * the engine's `unparameterised` term, and the canonical is `view.path`, the bare URL. The
 * selection is `productSearchParams()`'s (`ProductSearchParamsSchema`, strict): a valid value
 * re-renders the selection, and an unknown tier, a malformed date, a date outside the window or a
 * date that is not selectable falls back to the default rendering with a 200 (§5.2). The response
 * carries spec 008 §5.4's shared-cache header (`productParameterCacheHeaderRules()`).
 *
 * **Existence** is `resolveLocalePath()`'s, exactly: the rewrite captures the locale and the
 * `product` segment as the visitor wrote them, so `/EN/poland/product/{slug}?tier=x` and
 * `/en/poland/PRODUCT/{slug}?tier=x` are 404s here, as their bare forms are at the router. A
 * request with neither key (typed straight at this path) is a 404 too, so the internal path never
 * serves a second copy of the bare page, and a direct hit carries `X-Robots-Tag: noindex, nofollow`
 * (`parameterRouteHeaderRules()` matches every path under `_query`).
 */
export const dynamic = "force-dynamic";

interface ProductParameterRouteProps {
  params: Promise<ProductRouteParams>;
  searchParams: Promise<ProductQuery>;
}

/**
 * The request's own query, parsed, or a 404 when it carries neither `tier` nor `date`: then it
 * did not come through the rewrite.
 */
async function productQuery(
  searchParams: ProductParameterRouteProps["searchParams"],
): Promise<ProductRequest> {
  const request: ProductSearchRequest = productSearchParams(await searchParams);
  if (
    !request.keys.some((key) =>
      (PRODUCT_QUERY_KEYS as readonly string[]).includes(key),
    )
  )
    notFound();
  return { parameterised: true, selection: request.selection };
}

export async function generateMetadata({
  params,
  searchParams,
}: ProductParameterRouteProps): Promise<Metadata> {
  const match = await productMatch(await params);
  return productRouteMetadata(match, await productQuery(searchParams));
}

export default async function ProductParameterRoute({
  params,
  searchParams,
}: ProductParameterRouteProps): Promise<ReactElement> {
  const match = await productMatch(await params);
  const request = await productQuery(searchParams);
  return productRouteBody(match, request);
}
