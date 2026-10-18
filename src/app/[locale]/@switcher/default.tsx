/**
 * The `@switcher` slot wherever no file below mirrors the page: the locale home, `boom`, `_query`.
 * Asked with no segments, so every link is a locale home (spec 003 §2 L79; TASK-233).
 *
 * @purpose Unmirrored routes' language links (homes)
 * @spec 003
 */
import { setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { PageLocaleSwitcher } from "@/modules/catalog";
import { documentFallbackLocale, routableLocale } from "@/modules/i18n";

export default async function SwitcherDefault({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale: requested } = await params;
  const locale = (routableLocale(requested) ?? documentFallbackLocale()).code;
  setRequestLocale(locale);
  return <PageLocaleSwitcher locale={locale} segments={[]} />;
}
