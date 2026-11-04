/**
 * The search page's language links (spec 045 §6; TASK-402): each launch locale's **bare** search
 * page, never with the query, because the switcher is a set of `<a href>` and no link we render
 * carries `q=`.
 *
 * @purpose Search page language links (bare search paths)
 * @spec 045
 */
import { setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { SearchLocaleSwitcher } from "../../route-header";
import { documentFallbackLocale, routableLocale } from "@/modules/i18n";

export default async function SearchSwitcher({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale: requested } = await params;
  const locale = (routableLocale(requested) ?? documentFallbackLocale()).code;
  setRequestLocale(locale);
  return <SearchLocaleSwitcher locale={locale} />;
}
