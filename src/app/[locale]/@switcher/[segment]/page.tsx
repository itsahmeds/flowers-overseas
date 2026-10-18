/**
 * Depth 2's language links: this page in each locale (TASK-233; `PageLocaleSwitcher`).
 *
 * @purpose Depth-2 language links
 * @spec 003
 */
import { setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { PageLocaleSwitcher } from "@/modules/catalog";
import { documentFallbackLocale, routableLocale } from "@/modules/i18n";

export default async function SegmentSwitcher({
  params,
}: {
  params: Promise<{ locale: string; segment: string }>;
}): Promise<ReactElement> {
  const { locale: requested, segment } = await params;
  const locale = (routableLocale(requested) ?? documentFallbackLocale()).code;
  setRequestLocale(locale);
  return <PageLocaleSwitcher locale={locale} segments={[segment]} />;
}
