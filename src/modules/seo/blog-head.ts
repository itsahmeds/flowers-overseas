/**
 * The `<head>` and JSON-LD of spec 044's two blog pages (§6, AC-9 to AC-11; TASK-322), built by
 * this module's engine from what the page renders: the robots directive is `pageIndexability()`'s
 * one verdict (the same call the editorial sitemap makes, so the two cannot disagree), the
 * canonical is `canonicalFor()`'s, and the hreflang cluster is one `alternatesFor()` call over the
 * locales where the page exists now (`en` and its aliases, `en-GB`, `x-default`; never `de` or
 * `pl` in slice A).
 *
 * The inputs are plain data shaped like the blog's view models (`src/modules/content/blog/view.ts`),
 * so this module reads no blog source of its own: the route hands in the view it renders.
 */
import type { Metadata } from "next";

import { COMPANY } from "../../config/company.ts";
import { alternatesFor, routableLocale } from "../i18n/index.ts";

import { absoluteUrl, canonicalFor } from "./canonical.ts";
import type { DeploymentDescriptor } from "./environment.ts";
import { type IndexabilityVerdict, pageIndexability } from "./indexability.ts";
import { pageMetadata } from "./metadata.ts";
import {
  type BreadcrumbCrumb,
  type BreadcrumbLabel,
  breadcrumbList,
} from "./schema/breadcrumbList.ts";
import { blogPosting } from "./schema/blogPosting.ts";
import { type JsonLdNode, schemaOptions } from "./schema/JsonLd.tsx";

/** One blog page as its head reads it. */
export interface BlogHeadInput {
  readonly pageType: "blogIndex" | "blogPost";
  readonly locale: string;
  readonly path: string;
  /** `<title>`: the post's SEO title, or `blog.index.seoTitle`. */
  readonly title: string;
  /** Meta description: the post's SEO description, or `blog.index.seoDescription`. */
  readonly description: string;
  /** §6's `reviewed` term (the served revision's approval still covers it). */
  readonly reviewed: boolean;
  /** The page in every locale where it exists now. */
  readonly alternatePaths: Readonly<Record<string, string>>;
}

/** The one verdict for a blog page: the head's robots and the sitemap's membership. */
export function blogPageVerdict(
  page: Pick<BlogHeadInput, "pageType" | "locale" | "reviewed">,
  deployment: DeploymentDescriptor,
): IndexabilityVerdict {
  return pageIndexability(
    {
      pageType: page.pageType,
      locale: page.locale,
      // The page is being rendered or listed: the blog's existence rule already said yes.
      exists: true,
      reviewed: page.reviewed,
    },
    deployment,
  );
}

/** The page's hreflang cluster, or `undefined` off `https` (no invalid hreflang is emitted). */
export function blogAlternates(
  path: string,
  pathByLocale: Readonly<Record<string, string>>,
  deployment: DeploymentDescriptor,
) {
  if (!deployment.siteUrl.startsWith("https:")) return undefined;
  return alternatesFor(
    { pathByLocale: { ...pathByLocale } },
    { baseUrl: deployment.siteUrl },
  ).find((page) => page.url.endsWith(path))?.alternates;
}

/** `generateMetadata` for a blog page. */
export function blogPageMetadata(
  page: BlogHeadInput,
  deployment: DeploymentDescriptor,
): Metadata {
  const cluster = blogAlternates(page.path, page.alternatePaths, deployment);
  return pageMetadata({
    title: page.title,
    description: page.description,
    directive: blogPageVerdict(page, deployment).directive,
    canonical: canonicalFor(page.locale, page.path, {
      baseUrl: deployment.siteUrl,
    }),
    ...(cluster === undefined ? {} : { alternates: cluster }),
  });
}

/** What a post's JSON-LD reads from its view. */
export interface BlogPostSchemaInput {
  readonly locale: string;
  readonly path: string;
  readonly title: string;
  readonly excerpt: string;
  readonly authorName: string;
  readonly published: { readonly iso: string };
  readonly updated: { readonly iso: string } | undefined;
  readonly breadcrumb: readonly BreadcrumbCrumb[];
  /** The rendered cover's path or URL, only when a cover renders. */
  readonly coverUrl?: string | undefined;
}

/** `BlogPosting` and `BreadcrumbList` for a post (AC-11). Nothing off a parseable origin. */
export function blogPostJsonLd(
  view: BlogPostSchemaInput,
  label: BreadcrumbLabel,
  deployment: DeploymentDescriptor,
): readonly (JsonLdNode | undefined)[] {
  const options = schemaOptions(deployment.siteUrl);
  if (options === undefined) return [];
  const lang = routableLocale(view.locale)?.bcp47 ?? view.locale;
  return [
    blogPosting(
      {
        headline: view.title,
        description: view.excerpt,
        authorName: view.authorName,
        datePublished: view.published.iso,
        dateModified: (view.updated ?? view.published).iso,
        inLanguage: lang,
        canonical: canonicalFor(view.locale, view.path, options),
        image:
          view.coverUrl === undefined
            ? undefined
            : absoluteUrl(view.coverUrl, options),
      },
      COMPANY,
      options,
    ),
    breadcrumbList(view.breadcrumb, label, options),
  ];
}

/** `BreadcrumbList` for the index (it mirrors the visible trail; no `ItemList`, §6). */
export function blogIndexJsonLd(
  breadcrumb: readonly BreadcrumbCrumb[],
  label: BreadcrumbLabel,
  deployment: DeploymentDescriptor,
): readonly (JsonLdNode | undefined)[] {
  const options = schemaOptions(deployment.siteUrl);
  return options === undefined
    ? []
    : [breadcrumbList(breadcrumb, label, options)];
}
