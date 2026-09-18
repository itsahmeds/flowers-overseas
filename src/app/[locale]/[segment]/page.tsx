import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { resolveLocalePath, localeSegmentParams } from "@/modules/catalog";
import { DestinationsHubPage, hubView } from "@/modules/geo";
import { alternatesFor } from "@/modules/i18n";
import {
  canonicalFor,
  deploymentDescriptor,
  pageIndexability,
  pageMetadata,
} from "@/modules/seo";

/**
 * `/{locale}/{segment}` — **one route file for one URL depth** (spec 008 §14 **A5**, spec 007 §14
 * **A8**; TASK-109).
 *
 * Next.js allows exactly one dynamic slug **name** per (depth, position) across the whole `app/`
 * tree, route groups included, so spec 007's all-destinations hub (`/{locale}/{destinations}`) and
 * spec 008's occasions index (`/{locale}/{occasions}`) cannot each own a file: they share this
 * one, and which page a path names is `resolveLocalePath()`'s single answer, built from the same
 * existence predicates the sitemap and the crawl read.
 *
 * Today the union is the hub alone; TASK-113 adds the occasions index to the resolver and one
 * branch to the component below, with no change to the routing shape.
 *
 * `app/` stays thin: this file resolves, mounts one module page component, and decides nothing.
 *
 * **Rendering: ISR, `revalidate` 3600 s** (spec 007 §14 A8 lowers the corridor and hub from
 * 86 400, because a segment export cannot vary per param and this file is now shared with spec
 * 008's 3 600; the tags are unchanged and live in `src/lib/cache.ts` beside the invalidation
 * seam). `generateStaticParams` + `dynamicParams = false` make every other segment, casing variant
 * and unknown locale a hard **404 answered by the router**; a trailing slash is Next's own
 * permanent redirect to the bare URL (spec 007 §14 A6, spec 008 §14 A7). Nothing here reads a
 * cookie or a header, so the response carries no `Vary` and is byte-identical for every visitor.
 */
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams(): { locale: string; segment: string }[] {
  return [...localeSegmentParams()];
}

interface SegmentParams {
  params: Promise<{ locale: string; segment: string }>;
}

export async function generateMetadata({
  params,
}: SegmentParams): Promise<Metadata> {
  const { locale, segment } = await params;
  const match = await resolveLocalePath(locale, [segment]);
  if (match.kind !== "destinationsHub") notFound();

  const t = await getTranslations({
    locale: match.locale,
    namespace: "destinationsHub",
  });
  const view = hubView(match.locale);
  const deployment = deploymentDescriptor(process.env);
  const verdict = pageIndexability(
    {
      pageType: "destinationsHub",
      locale: match.locale,
      exists: true,
      // Spec 007 §6: "the hub is indexable when at least one corridor in that locale is".
      reviewed: view.anyReviewed,
    },
    deployment,
  );

  // `alternatesFor()` refuses a non-`https` origin: a development deployment emits **no** hreflang
  // rather than an invalid one (the corridor route documents the rule in full).
  const cluster = deployment.siteUrl.startsWith("https:")
    ? alternatesFor(
        { pageType: "destinations" },
        { baseUrl: deployment.siteUrl },
      ).find((page) => page.url.endsWith(view.path))?.alternates
    : undefined;

  return pageMetadata({
    title: t("seoTitle"),
    description: t("seoDescription"),
    directive: verdict.directive,
    canonical: canonicalFor(match.locale, view.path, {
      baseUrl: deployment.siteUrl,
    }),
    ...(cluster === undefined ? {} : { alternates: cluster }),
  });
}

export default async function LocaleSegmentRoute({ params }: SegmentParams) {
  const { locale, segment } = await params;
  const match = await resolveLocalePath(locale, [segment]);
  if (match.kind !== "destinationsHub") notFound();
  setRequestLocale(match.locale);

  return <DestinationsHubPage locale={match.locale} />;
}
