import type { ReactElement } from "react";

import { RouteHeader } from "../../../route-header";

/**
 * The country chooser's header (spec 004 §14 A-founder-2026-10-24a item 3; TASK-385): out of
 * context, as the board draws it. Next fills the slot from the rewritten `/{locale}/-choose/…`
 * (`src/lib/chooser-routes.ts`), so the slot mirrors `-choose` as it mirrors `-product`. The
 * language links go to the locale homes (the chooser is `noindex` and has no alternates).
 *
 * @purpose The chooser page's header, out of context
 * @spec 004
 */
export default async function ChooserHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return <RouteHeader locale={locale} segments={[]} switcherSegments={[]} />;
}
