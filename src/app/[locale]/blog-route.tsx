import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BlogIndexPage } from "@/modules/content/blog/ui/BlogIndexPage";
import { BlogPostPage } from "@/modules/content/blog/ui/BlogPostPage";
import {
  blogIndexPageView,
  blogPostPageView,
} from "@/modules/content/blog/view";
import { LanguageAlternates, launchLocaleCodes } from "@/modules/i18n";
import {
  type BreadcrumbLabel,
  JsonLd,
  blogIndexJsonLd,
  blogPageMetadata,
  blogPostJsonLd,
  deploymentDescriptor,
} from "@/modules/seo";

/**
 * Spec 044's two public blog pages, head and body, **once**, for the two route files that serve
 * them (§2.7, §5.4; TASK-322):
 *
 * ```
 * /{locale}/blog          [segment]/page.tsx          the index
 * /{locale}/blog/{slug}   [segment]/[child]/page.tsx  a post
 * ```
 *
 * `app/` stays thin: the view models are `src/modules/content/blog/view.ts`'s, the templates are
 * the blog's server components (zero client islands, AC-14), and the `<head>` and JSON-LD are
 * `src/modules/seo`'s, built from the same view the page renders (AC-11). The route files' ISR
 * (`revalidate` 3600, `dynamicParams = false`) is the rendering of §5.4; nothing here reads a
 * cookie or a header, so every visitor gets one byte-identical document.
 */

/** The breadcrumb's labels, with the route's own translator; values pass through. */
async function crumbLabels(locale: string): Promise<BreadcrumbLabel> {
  const t = await getTranslations({ locale });
  return (key, values) => (t as unknown as BreadcrumbLabel)(key, values);
}

export async function blogIndexMetadata(locale: string): Promise<Metadata> {
  const view = await blogIndexPageView(locale, launchLocaleCodes());
  if (view === undefined) notFound();
  const t = await getTranslations({ locale, namespace: "blog.index" });
  return blogPageMetadata(
    {
      pageType: "blogIndex",
      locale,
      path: view.path,
      // Appendix A's head-only pair: the `<title>` and the meta description, never the body.
      title: t("seoTitle"),
      description: t("seoDescription"),
      reviewed: view.anyReviewed,
      alternatePaths: view.alternatePaths,
    },
    deploymentDescriptor(process.env),
  );
}

export async function BlogIndexRoute({ locale }: { readonly locale: string }) {
  setRequestLocale(locale);
  const view = await blogIndexPageView(locale, launchLocaleCodes());
  if (view === undefined) notFound();
  return (
    <>
      <BlogIndexPage view={view} />
      <LanguageAlternates paths={view.alternatePaths} />
      <JsonLd
        nodes={blogIndexJsonLd(
          view.breadcrumb,
          await crumbLabels(locale),
          deploymentDescriptor(process.env),
        )}
      />
    </>
  );
}

export async function blogPostMetadata(
  locale: string,
  slug: string,
): Promise<Metadata> {
  const view = await blogPostPageView(locale, slug, launchLocaleCodes());
  if (view === undefined) notFound();
  return blogPageMetadata(
    {
      pageType: "blogPost",
      locale,
      path: view.path,
      title: view.seoTitle,
      description: view.seoDescription,
      reviewed: view.reviewed,
      alternatePaths: view.alternatePaths,
    },
    deploymentDescriptor(process.env),
  );
}

export async function BlogPostRoute({
  locale,
  slug,
}: {
  readonly locale: string;
  readonly slug: string;
}) {
  setRequestLocale(locale);
  const view = await blogPostPageView(locale, slug, launchLocaleCodes());
  if (view === undefined) notFound();
  return (
    <>
      <BlogPostPage view={view} />
      <LanguageAlternates paths={view.alternatePaths} />
      <JsonLd
        nodes={blogPostJsonLd(
          view,
          await crumbLabels(locale),
          deploymentDescriptor(process.env),
        )}
      />
    </>
  );
}
