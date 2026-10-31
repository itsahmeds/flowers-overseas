import type { ReactElement } from "react";

import { RouteHeader } from "../../../route-header";

/**
 * The header of `/{locale}/basket` (spec 010 §14 A-founder-2026-10-22 D10; spec 043 §5.3 A;
 * TASK-349): out of context, with the Basket link marked as the current page (the `chrome-*`
 * "Basket current" state). A page here rather than `default.tsx` so a soft navigation to the
 * basket never keeps another route's row.
 */
export default async function BasketHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return (
    <RouteHeader
      basketCurrent
      locale={locale}
      segments={[]}
      switcherSegments={[]}
    />
  );
}
