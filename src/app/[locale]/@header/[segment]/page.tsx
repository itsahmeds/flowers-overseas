import type { ReactElement } from "react";

import { RouteHeader } from "../../route-header";

/**
 * The header at depth 2, `/{locale}/{segment}` (spec 043 §5.3 A; TASK-288): the destinations hub,
 * the occasions index and the info pages, none of them in a destination's context; the language
 * links are this page's own, as `@switcher/[segment]` gives them.
 */
export default async function SegmentHeader({
  params,
}: {
  params: Promise<{ locale: string; segment: string }>;
}): Promise<ReactElement> {
  const { locale, segment } = await params;
  return (
    <RouteHeader
      locale={locale}
      segments={[segment]}
      switcherSegments={[segment]}
    />
  );
}
