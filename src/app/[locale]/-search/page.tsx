/**
 * `/{locale}/{searchSegment}`: the search results page (spec 045 §2.2, §2.7, §5.2, §5.4, §6;
 * AC-3, AC-4, AC-5, AC-10, AC-12, AC-13, AC-15, AC-37; TASK-402). Served here through
 * `next.config.ts`'s `beforeFiles` rewrite (`src/lib/search-routes.ts`); its headers
 * (`noindex, follow`, `private, no-store`, `Referrer-Policy: strict-origin`) come from the same
 * file's header rules.
 *
 * Thin: the parameters, the search and the view are `searchPage()`'s (`src/modules/search`); a
 * bad `page` or a page past the last is spec 008's 404. Rendered on every request: it reads the
 * query string. It reads no header, cookie or IP (ADR-0006), sets no cookie, and its metadata is
 * `noindex,follow` with the bare search path as the canonical, no hreflang and no JSON-LD (§6).
 * The `<title>` is `search.meta.title`, never the query.
 *
 * @purpose The search results page (SSR, noindex)
 * @spec 045
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { launchLocaleCodes, routableLocale } from "@/modules/i18n";
import { SearchResultsPage, searchPage, searchPath } from "@/modules/search";
import {
  NOINDEX_FOLLOW,
  canonicalFor,
  deploymentDescriptor,
  robotsMeta,
} from "@/modules/seo";

/** Per request: the page reads `q`, `to`, `date` and `page`, and nothing of it is ever stored. */
export const dynamic = "force-dynamic";

interface SearchRouteProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** A launch locale, or spec 008's 404 (the index is built for the launch locales only). */
function searchLocale(requested: string): LocaleCode {
  const locale = routableLocale(requested);
  if (
    locale === undefined ||
    !isLocaleCode(locale.code) ||
    !launchLocaleCodes().includes(locale.code)
  ) {
    notFound();
  }
  return locale.code;
}

export async function generateMetadata({
  params,
}: SearchRouteProps): Promise<Metadata> {
  const locale = searchLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "search" });
  const deployment = deploymentDescriptor(process.env);
  return {
    title: t("meta.title"),
    description: null,
    robots: robotsMeta(NOINDEX_FOLLOW),
    alternates: {
      canonical: canonicalFor(locale, searchPath(locale), {
        baseUrl: deployment.siteUrl,
      }),
    },
  };
}

export default async function SearchRoute({
  params,
  searchParams,
}: SearchRouteProps): Promise<ReactElement> {
  const locale = searchLocale((await params).locale);
  setRequestLocale(locale);
  const outcome = await searchPage(locale, await searchParams);
  if (outcome.kind === "notFound") notFound();
  return <SearchResultsPage view={outcome.view} />;
}
