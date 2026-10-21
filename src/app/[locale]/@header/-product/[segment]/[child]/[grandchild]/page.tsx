import type { ReactElement } from "react";

import { RouteHeader } from "../../../../../route-header";

/**
 * The product page's header (spec 043 §5.3 A, AC-1; TASK-288). Next fills a slot from the mirror of
 * the path the router serves, which for a product address is the rewritten `/{locale}/-product/…`
 * (`src/lib/product-rewrites.ts`), so the slot mirrors `-product` as `@switcher` does. The segments
 * are the bare product URL's, `{country}/{product}/{slug}`: the page is in that country's context.
 */
export default async function ProductHeader({
  params,
}: {
  params: Promise<{
    locale: string;
    segment: string;
    child: string;
    grandchild: string;
  }>;
}): Promise<ReactElement> {
  const { locale, segment, child, grandchild } = await params;
  return (
    <RouteHeader
      locale={locale}
      segments={[segment, child, grandchild]}
      switcherSegments={[segment, child, grandchild]}
    />
  );
}
