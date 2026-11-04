/**
 * `/{locale}/-search/limited`: the search results page in its "rate limited" state (spec 045 §2.7,
 * §2.8, AC-26; TASK-403; the board's "Rate limited · HTTP 429" frame). Reached only through the
 * proxy's rewrite of a refused search address (`src/proxy.ts`), which sets the status (429 or
 * 503), `Retry-After` and the search headers; the browser's address stays the search address. The
 * same `noindex,follow` metadata and canonical as the results page.
 *
 * Searches nothing: the words and the destination fill the form, and the page renders
 * `search.rateLimited`. It reads no header, cookie or IP (ADR-0006) and sets no cookie.
 *
 * @purpose The search page's rate-limited state (429/503)
 * @spec 045
 */
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { SearchResultsPage, searchRoutePage } from "@/modules/search";

import { searchLocale } from "../search-locale";

export { generateMetadata } from "../page";

/** Per request, like the results page: it reads the query string. */
export const dynamic = "force-dynamic";

export default async function RateLimitedSearchRoute({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const locale = searchLocale((await params).locale);
  setRequestLocale(locale);
  const outcome = await searchRoutePage(locale, await searchParams, {
    refused: true,
  });
  if (outcome.kind === "notFound") notFound();
  return <SearchResultsPage rateLimited view={outcome.view} />;
}
