import type { ReactElement } from "react";

import { RouteHeader } from "../../../route-header";

/**
 * The header at depth 3, `/{locale}/{segment}/{child}` (spec 043 §5.3 A, AC-1; TASK-288): a
 * country shop root and a destination's guide are in that destination's context, a category or
 * occasion hub is not (`pageDestination()`); the language links are `@switcher/[segment]/[child]`'s.
 */
export default async function ChildHeader({
  params,
}: {
  params: Promise<{ locale: string; segment: string; child: string }>;
}): Promise<ReactElement> {
  const { locale, segment, child } = await params;
  return (
    <RouteHeader
      locale={locale}
      segments={[segment, child]}
      switcherSegments={[segment, child]}
    />
  );
}
