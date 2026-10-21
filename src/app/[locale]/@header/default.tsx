import type { ReactElement } from "react";

import { RouteHeader } from "../route-header";

/**
 * The `@header` slot's fallback (spec 043 §5.3 A; TASK-288): the out-of-context header, with the
 * price claim and the locale homes' language links. Next renders it only on a full load of a route
 * the slot has no page for, and `tests/unit/header-slot.test.tsx` keeps that set empty; it exists so
 * that a route added without its slot page still gets a header rather than none.
 */
export default async function HeaderDefault({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return <RouteHeader locale={locale} segments={[]} switcherSegments={[]} />;
}
