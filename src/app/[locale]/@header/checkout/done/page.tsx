import type { ReactElement } from "react";

import { RouteHeader } from "../../../route-header";

/**
 * The checkout's header (spec 010 §5.3; TASK-204): the site header with no destination context,
 * the same as the locale home's minus its home-only rules, so the `[segment]` slot never reads
 * `checkout` as a listing address.
 */
export default async function CheckoutHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return <RouteHeader locale={locale} segments={[]} switcherSegments={[]} />;
}
