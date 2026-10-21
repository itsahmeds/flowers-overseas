import type { ReactElement } from "react";

import { RouteHeader } from "../../../../route-header";

/**
 * The header of the shop root's parameter route, `/{locale}/_query/{segment}/{child}` (spec 043
 * §5.3 A; TASK-288): the visitor's address is `/{locale}/{country}/{shop}?page=…`, so the page is in
 * that country's context like its bare twin. `@switcher` has no mirror here and falls back to its
 * `default.tsx`, the locale homes, so the language links stay exactly that.
 */
export default async function QueryChildHeader({
  params,
}: {
  params: Promise<{ locale: string; segment: string; child: string }>;
}): Promise<ReactElement> {
  const { locale, segment, child } = await params;
  return (
    <RouteHeader
      locale={locale}
      segments={[segment, child]}
      switcherSegments={[]}
    />
  );
}
