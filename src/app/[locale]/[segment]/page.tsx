import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { resolveLocalePath, localeSegmentParams } from "@/modules/catalog";
import { DestinationsHubPage, hubView } from "@/modules/geo";
import { alternatesFor } from "@/modules/i18n";
import {
  type BreadcrumbLabel,
  JsonLd,
  breadcrumbList,
  canonicalFor,
  deploymentDescriptor,
  pageIndexability,
  pageMetadata,
  schemaOptions,
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
 *
 * **JSON-LD** — the hub's `BreadcrumbList`, from the same `hubView()` the page renders, mounted
 * below as one `<script type="application/ld+json">` (spec 007 AC-15, TASK-093). Its second crumb
 * is the page itself and renders as text, so it announces no `item`: the markup says exactly what
 * the `<nav>` says. No `ItemList` of destinations — this page lists countries we have a guide for,
 * not products (AC-16); spec 008's listing schema is TASK-115's.
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

/**
 * The one cast this route makes, for `src/modules/geo/ui/labels.ts`'s reason: the breadcrumb's
 * labels are **registry data** (`countries.ts`'s `nameKey`, `site-links.ts`'s keys), and next-intl
 * types `t()` against the literal key union of the catalogue, which a dotted string held as data is
 * not. Resolving them here — with the same translator the components use — is what keeps the
 * JSON-LD label and the visible label one message in one catalogue.
 */
async function registryLabels(locale: string): Promise<BreadcrumbLabel> {
  const t = await getTranslations({ locale });
  return (key: string): string => (t as unknown as BreadcrumbLabel)(key);
}

export default async function LocaleSegmentRoute({ params }: SegmentParams) {
  const { locale, segment } = await params;
  const match = await resolveLocalePath(locale, [segment]);
  if (match.kind !== "destinationsHub") notFound();
  setRequestLocale(match.locale);

  const options = schemaOptions(deploymentDescriptor(process.env).siteUrl);
  const label = await registryLabels(match.locale);

  return (
    <>
      <DestinationsHubPage locale={match.locale} />
      <JsonLd
        nodes={
          options === undefined
            ? []
            : [breadcrumbList(hubView(match.locale).breadcrumb, label, options)]
        }
      />
    </>
  );
}
