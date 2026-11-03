import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { isLocaleCode } from "@/config/locales";
import { routableLocale } from "@/modules/i18n";
import { transactionalMetadata } from "@/modules/seo";

import { SENT_PARAM } from "./lookup";
import { LookupPageView } from "./LookupForm";

/**
 * @purpose Tracking lookup page
 * @spec 018
 *
 * `/{locale}/track`, the lookup (spec 018 §5.3 `track`, §6; AC-8, AC-12; TASK-339): a buyer
 * without the link types the order reference and the email, and the order's own address gets
 * T16. Thin: it renders `LookupPageView`, with the sent message when `?sent=1` is present, which
 * is where `lookupTrackingAction` sends every submission (`./actions.ts`). The page reads nothing
 * else, so it cannot differ by what the lookup found (AC-8).
 *
 * Kept out of Google but crawlable (founder Q2): `next.config.ts` adds `X-Robots-Tag: noindex,
 * nofollow` and `private, no-store` (`trackHeaderRules()`), the metadata is
 * `transactionalMetadata()`: a title and the robots meta, no canonical, no alternate (AC-12).
 */
export const dynamic = "force-dynamic";

interface LookupParams {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: LookupParams): Promise<Metadata> {
  const { locale: requested } = await params;
  const locale = routableLocale(requested);
  if (locale === undefined) return {};
  const t = await getTranslations({
    locale: locale.code,
    namespace: "trackLookup",
  });
  return transactionalMetadata("trackOrder", t("meta.title"));
}

export default async function TrackLookupRoute({
  params,
  searchParams,
}: LookupParams): Promise<ReactElement> {
  const { locale: requested } = await params;
  const locale = routableLocale(requested)?.code;
  if (locale === undefined || !isLocaleCode(locale)) notFound();
  setRequestLocale(locale);
  const sent = (await searchParams)[SENT_PARAM] === "1";
  return <LookupPageView locale={locale} sent={sent} />;
}
