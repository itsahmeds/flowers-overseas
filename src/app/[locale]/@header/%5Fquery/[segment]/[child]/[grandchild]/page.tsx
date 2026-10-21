import type { ReactElement } from "react";

import { RouteHeader } from "../../../../../route-header";

/**
 * The header of the depth-4 parameter route, `/{locale}/_query/{segment}/{child}/{grandchild}`
 * (spec 043 §5.3 A; TASK-288): a country category or occasion with `?page=` or `?sort=`, in its
 * country's context. `@switcher` has no mirror here, so the language links stay the locale homes.
 */
export default async function QueryGrandchildHeader({
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
