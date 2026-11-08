import type { ReactElement } from "react";

import { headerSearchValue } from "@/modules/search";

import { searchLocale } from "../../-search/search-locale";
import { RouteHeader } from "../../route-header";

/**
 * The search results page's header (spec 045 §2.2, §14 A-founder-2026-11-08a item 2, AC-43;
 * TASK-402, TASK-520). Its field holds the words the page searched (`value`) and the `to` it
 * searched, read from the same query string through the page's own parameter rule; the route is
 * dynamic, so the prebuilt pages' header stays query-free. The mega menu stays out of context.
 * Next fills the slot from the rewritten `/{locale}/-search` (`src/lib/search-routes.ts`), so the
 * slot mirrors `-search` as it mirrors `-choose`. The language links go to each locale's bare
 * search page (§6), drawn by `@switcher/-search`'s own rule.
 *
 * @purpose The search page's header, holding the searched words
 * @spec 045
 */
export default async function SearchHeader({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { locale } = await params;
  const searchValue = await headerSearchValue(
    searchLocale(locale),
    await searchParams,
  );
  return (
    <RouteHeader
      locale={locale}
      search
      searchValue={searchValue}
      segments={[]}
      switcherSegments={[]}
    />
  );
}
