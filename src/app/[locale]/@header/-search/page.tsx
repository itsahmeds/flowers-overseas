import type { ReactElement } from "react";

import { RouteHeader } from "../../route-header";

/**
 * The search results page's header (spec 045 §2.2; TASK-402): out of context, because the slot
 * renders from the route's params and never reads the query, so the `to` of one search cannot be
 * known here (spec 043 AC-4). Next fills the slot from the rewritten `/{locale}/-search`
 * (`src/lib/search-routes.ts`), so the slot mirrors `-search` as it mirrors `-choose`. The
 * language links go to each locale's bare search page (§6), drawn by `@switcher/-search`'s own
 * rule.
 *
 * @purpose The search page's header, out of context
 * @spec 045
 */
export default async function SearchHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return (
    <RouteHeader locale={locale} search segments={[]} switcherSegments={[]} />
  );
}
