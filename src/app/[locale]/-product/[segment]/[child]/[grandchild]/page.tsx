import type { Metadata } from "next";
import type { ReactElement } from "react";

import {
  localeProductParams,
  writeProductExistenceSummary,
} from "@/modules/catalog";

import {
  type ProductRouteParams,
  productMatch,
  productRouteBody,
  productRouteMetadata,
} from "../../../../product-route";

/**
 * `/{locale}/-product/{segment}/{child}/{grandchild}` — **the product page's own route file**
 * (spec 009 §2, §5.4; §14 A-founder-2026-10-18a, AC-37; TASK-127, TASK-228).
 *
 * Nobody links here and no address shows it. `next.config.ts` rewrites every product address,
 * `/{locale}/{countrySlug}/{product}/{productSlug}`, to this path (`src/lib/product-rewrites.ts`),
 * so the visitor's address, the canonical and the hreflang set stay the bare product URL. The
 * country category and the country occasion stay in `../../../[segment]/[child]/[grandchild]`,
 * which no longer reaches `ProductPage`: that is what keeps the product island's chunk off the
 * listings (Turbopack puts every client module a route file reaches into the route's script set).
 * A direct request to this path carries `X-Robots-Tag: noindex, nofollow`.
 *
 * **Its params are its existence set** (spec 009 §14 **A6**, AC-3; TASK-127 E-1): every product
 * page per (locale, published destination), in the same `{ segment, child, grandchild }` shape the
 * shared route emitted. The `[locale]` layout exports `dynamicParams = false` (spec 003's locale
 * gate) and Next computes a route's `dynamicParams` as `every` segment's, so a path this build did
 * not emit is a router 404, rendered as the x-default `not-found.tsx` document with its `lang`.
 * `dynamicParams = true` below is therefore **inert** while the layout's is `false`; it is kept so
 * that, if the gate ever moves (spec 003 §14 A3's Cache Components tripwire), the route resolves on
 * demand through `productPageExists()` rather than silently refusing.
 *
 * **The existence summary** (spec 009 AC-3, §11) is written here, by the `generateStaticParams`
 * that emits the product params it counts, once per process (`/review 96`'s carry-forward to
 * TASK-127); its "Prebuilt" column equals its "PDPs" column since A6.
 *
 * **Rendering: ISR, `revalidate` 3600 s**, `productCachePolicy()`'s answer for every destination
 * that is not live (`src/lib/cache.ts`, spec 009 §5.4, §14 A10; a segment config must be a
 * literal, so `tests/unit/product-params.test.ts` holds the two equal). It renders the bare URL
 * and **reads no search parameter** (A10): `?tier=` / `?date=` are rewritten to the parameter
 * route `../../../../%5Fquery/-product/[segment]/[child]/[grandchild]/page.tsx`, so this file
 * stays prebuilt and its `dynamicParams` gate holds. Reading `searchParams` here would make the
 * build list this route as per-request (T-15). Nothing here reads a cookie or a request header.
 *
 * The head and body are `../../../../product-route.tsx`'s, the same functions the parameter route
 * calls, with `parameterised: false` and no selection: one `productView()`, one `ProductPage`
 * (with spec 008's breadcrumb as its slot), the language alternates and `productJsonLd()` (spec 009
 * AC-18; TASK-130). The PDP mounts no delivery-facts block (spec 009 §14 A-founder-2026-10-14d,
 * AC-35).
 */
export const revalidate = 3600;
export const dynamicParams = true;

/**
 * Next calls `generateStaticParams` more than once per build (the collection pass and the render
 * pass), and the counts describe the build rather than the call: one process, one table.
 */
let productSummaryWritten = false;

export async function generateStaticParams(): Promise<
  { locale: string; segment: string; child: string; grandchild: string }[]
> {
  const params = [...(await localeProductParams())];
  // The product counts of the set just emitted, where CI reads them (spec 009 AC-3).
  if (!productSummaryWritten) {
    productSummaryWritten = true;
    await writeProductExistenceSummary();
  }
  return params;
}

interface ProductParams {
  params: Promise<ProductRouteParams>;
}

/** The bare URL: no parameter, the default selection (spec 009 §14 A10). */
const BARE = { parameterised: false } as const;

export async function generateMetadata({
  params,
}: ProductParams): Promise<Metadata> {
  return productRouteMetadata(await productMatch(await params), BARE);
}

export default async function LocaleProductRoute({
  params,
}: ProductParams): Promise<ReactElement> {
  const match = await productMatch(await params);
  return productRouteBody(match, BARE);
}
