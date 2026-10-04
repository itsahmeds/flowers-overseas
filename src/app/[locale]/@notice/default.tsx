/**
 * The notice bar's price claim on every localised page except the home (spec 004 §14 A21;
 * TASK-176; founder, 2026-10-04: "Every price includes VAT and delivery. dont write this on
 * home").
 *
 * `@notice` is a parallel-route slot of the locale layout: a URL that `./page.tsx` does not match
 * (everything below `/{locale}`) renders this file, so "Prices include delivery and VAT" stands
 * beside every page that can show a price — the shop, listing and product pages, as
 * price-indication law (e.g. Germany's PAngV) asks. The route decides; nothing reads a path in
 * the browser, and the document stays static.
 */
import { setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { documentFallbackLocale, routableLocale } from "@/modules/i18n";
import { NoticePriceClaim } from "@/modules/ui";

export default async function NoticeDefault({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale: requested } = await params;
  setRequestLocale(
    (routableLocale(requested) ?? documentFallbackLocale()).code,
  );
  return <NoticePriceClaim />;
}
