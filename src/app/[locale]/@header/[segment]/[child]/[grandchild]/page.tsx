import type { ReactElement } from "react";

import { RouteHeader } from "../../../../route-header";

/**
 * The header at depth 4, `/{locale}/{segment}/{child}/{grandchild}` (spec 043 §5.3 A, AC-1;
 * TASK-288): a country category or a country occasion, both in their destination's context; the
 * language links are `@switcher/[segment]/[child]/[grandchild]`'s.
 */
export default async function GrandchildHeader({
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
