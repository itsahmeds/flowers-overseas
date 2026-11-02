import type { ReactElement } from "react";

import { RouteHeader } from "../../../../../../route-header";

/**
 * The header of the product parameter route, `/{locale}/_query/-product/{segment}/{child}/
 * {grandchild}` (spec 043 §5.3 A; spec 009 §14 A10; TASK-128): a product page with `?tier=` or
 * `?date=`, in its country's context, as the product page's own header is. `@switcher` has no
 * mirror under `_query`, so the language links stay the locale homes, as on the listing parameter
 * routes.
 */
export default async function QueryProductHeader({
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
      switcherSegments={[]}
    />
  );
}
