import type { ReactElement } from "react";

import { RouteHeader } from "../../../route-header";

/**
 * @purpose Account header
 * @spec 018
 *
 * The header of `/{locale}/account` (spec 018 §14 C.13; `account-*` "Shell"; spec 043 §5.3 A;
 * TASK-344): out of context, with the language links to the locale homes, as the basket's. A page
 * here rather than `default.tsx` so a soft navigation never keeps another route's row.
 */
export default async function AccountHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return <RouteHeader locale={locale} segments={[]} switcherSegments={[]} />;
}
