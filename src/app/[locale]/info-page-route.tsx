import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import type { InfoPageId } from "@/config/info-pages";

import {
  InfoPage,
  LegalDocumentPage,
  infoPageAlternatePaths,
  infoPageView,
  legalDocumentView,
} from "@/modules/content";
import { LanguageAlternates } from "@/modules/i18n";
import { reviewPolicyLive } from "@/modules/reviews/display";
import {
  type BreadcrumbLabel,
  JsonLd,
  deploymentDescriptor,
  infoPageJsonLd,
  infoPageMetadata,
} from "@/modules/seo";

/**
 * One spec 041 info page's head and body, **once**, for the two route files that serve them (spec
 * 041 §2 "Rendering", §5.4; TASK-182, TASK-183):
 *
 * ```
 * /{locale}/{help|guarantee|…|imprint}   [segment]/page.tsx           trust pages and the imprint
 * /{locale}/{legal}/{leaf}               [segment]/[child]/page.tsx   the four legal documents
 * ```
 *
 * `app/` stays thin: the view models are `src/modules/content`'s (`infoPageView()` for a trust
 * page, `legalDocumentView()` for a legal one), and the `<head>` and the JSON-LD are
 * `src/modules/seo`'s, built from the same view models the page renders (AC-17 to AC-19). Nothing
 * here reads a cookie or a header, so every visitor gets one byte-identical document (AC-24).
 */
export async function infoPageRouteMetadata(
  pageId: InfoPageId,
  locale: string,
): Promise<Metadata> {
  await requireLiveReviewPolicy(pageId);
  return (
    infoPageMetadata(pageId, locale, deploymentDescriptor(process.env)) ??
    notFound()
  );
}

/**
 * Spec 022a's review policy exists only once `reviews.invite` is on or a review is published
 * (AC-23; TASK-373): its content file is committed in every locale, so the data condition is the
 * one gate the content module cannot answer. Every other page is unaffected.
 */
async function requireLiveReviewPolicy(pageId: InfoPageId): Promise<void> {
  if (pageId === "review-policy" && !(await reviewPolicyLive())) notFound();
}

/** The breadcrumb's labels, with the route's own translator; values pass through (AC-19). */
async function crumbLabels(locale: string): Promise<BreadcrumbLabel> {
  const t = await getTranslations({ locale });
  return (key, values) => (t as unknown as BreadcrumbLabel)(key, values);
}

export async function InfoPageRoute({
  pageId,
  locale,
}: {
  readonly pageId: InfoPageId;
  readonly locale: string;
}) {
  setRequestLocale(locale);
  await requireLiveReviewPolicy(pageId);
  const legal = legalDocumentView(pageId, locale);
  const trust = legal === undefined ? infoPageView(pageId, locale) : undefined;
  if (legal === undefined && trust === undefined) notFound();
  const nodes = infoPageJsonLd(
    pageId,
    locale,
    deploymentDescriptor(process.env),
    await crumbLabels(locale),
  );
  return (
    <>
      {legal === undefined ? (
        <InfoPage pageId={pageId} locale={locale} />
      ) : (
        <LegalDocumentPage view={legal} />
      )}
      <LanguageAlternates paths={infoPageAlternatePaths(pageId)} />
      <JsonLd nodes={nodes} />
    </>
  );
}
