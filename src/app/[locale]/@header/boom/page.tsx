import type { ReactElement } from "react";

import { RouteHeader } from "../../route-header";

/**
 * The header of the `boom` test route (spec 043 §5.3 A; TASK-288): out of context. A page here
 * rather than `default.tsx` so that a soft navigation to it never keeps another route's row.
 */
export default async function BoomHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return <RouteHeader locale={locale} segments={[]} switcherSegments={[]} />;
}
