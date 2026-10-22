import type { ReactElement } from "react";

import { RouteHeader } from "../../../route-header";

/**
 * The header of `/{locale}/dla-kwiaciarni/zglos-sie` (spec 043 §5.3 A; spec 011, TASK-210): out of any
 * destination's context, as every florists page is.
 */
export default async function FloristFormHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  return (
    <RouteHeader
      locale={locale}
      segments={["dla-kwiaciarni", "zglos-sie"]}
      switcherSegments={["dla-kwiaciarni", "zglos-sie"]}
    />
  );
}
