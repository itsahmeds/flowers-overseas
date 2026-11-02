import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { isLocaleCode } from "@/config/locales";
import { localePath, routableLocale } from "@/modules/i18n";
import { getTrackingView } from "@/modules/orders";
import { transactionalMetadata } from "@/modules/seo";

import { orderForToken } from "./tracking-routes";
import { TrackingPageView } from "./TrackingPageView";

/**
 * @purpose Buyer tracking page
 * @spec 018
 *
 * `/{locale}/track/{token}`, the buyer's tracking page (spec 018 §5.3, §5.4, §6; AC-3 to AC-7,
 * AC-12; TASK-338). Thin: it resolves the signed token (`tracking.resolve`, TASK-337), reads
 * `getTrackingView()` and renders `TrackingPageView`.
 *
 * Every token failure (invalid, forged, rotated, expired) calls `notFound()`, so the response is a
 * 404 whose body is `./not-found.tsx`, the one not-working page per locale (AC-7). SSR per request
 * (`force-dynamic`); `next.config.ts` adds `X-Robots-Tag: noindex, nofollow`, `private, no-store`
 * and `Referrer-Policy: no-referrer` (`trackHeaderRules()`); the metadata is
 * `transactionalMetadata()`: a title and the robots meta, no canonical, no alternate (AC-12). The
 * title is the same for a working and a failed link, so the head says nothing about the order.
 */
export const dynamic = "force-dynamic";

interface TrackParams {
  params: Promise<{ locale: string; token: string }>;
}

export async function generateMetadata({
  params,
}: TrackParams): Promise<Metadata> {
  const { locale: requested } = await params;
  const locale = routableLocale(requested);
  if (locale === undefined) return {};
  const t = await getTranslations({
    locale: locale.code,
    namespace: "tracking",
  });
  return transactionalMetadata("trackOrder", t("meta.title"));
}

export default async function TrackRoute({
  params,
}: TrackParams): Promise<ReactElement> {
  const { locale: requested, token } = await params;
  const locale = routableLocale(requested)?.code;
  if (locale === undefined || !isLocaleCode(locale)) notFound();
  setRequestLocale(locale);
  const orderId = await orderForToken(token);
  if (orderId === null) notFound();
  const view = await getTrackingView(orderId);
  const base = localePath(locale, "home", "track", token);
  return (
    <TrackingPageView
      calendarHref={`${base}/calendar.ics`}
      locale={locale}
      photoHref={`${base}/photo`}
      view={view}
    />
  );
}
