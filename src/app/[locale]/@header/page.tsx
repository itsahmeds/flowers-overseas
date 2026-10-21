import type { ReactElement } from "react";

import { RouteHeader } from "../route-header";

/**
 * The locale home's header (spec 043 §5.3 A; TASK-288): out of context, and with no price claim in
 * the notice bar (founder, 2026-10-04: "Every price includes VAT and delivery. dont write this on
 * home"; TASK-176, formerly the `@notice` slot's `page.tsx`).
 */
export default async function HomeHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return (
    <RouteHeader locale={locale} segments={[]} switcherSegments={[]} home />
  );
}
