/**
 * An info page's `<head>` and its JSON-LD, as pure functions of the page, the locale and the
 * deployment (spec 041 §6, AC-17, AC-18, AC-19; TASK-182; `/review 270` required changes 2 and 3).
 *
 * The route (`src/app/[locale]/[segment]/page.tsx`) only calls these two, so `app/` stays thin and
 * the unit suite reads exactly what the page serves: the content file's own title and
 * description, a self-canonical, hreflang among the locales where the page exists (and that the
 * engine admits), the engine's directive, and the schema built from the same view model the page
 * renders: a `BreadcrumbList` on every page, `FAQPage` on help (its questions character for
 * character), and on about an `Organization` with only the fields we have. Nothing else is ever
 * emitted.
 */
import type { Metadata } from "next";

import { COMPANY } from "@/config/company";
import type { InfoPageId } from "@/config/info-pages";

import {
  infoPageHreflangPaths,
  infoPageHeadView,
  infoPageView,
} from "../content/index.ts";
import { alternatesFor } from "../i18n/index.ts";
import { canonicalFor } from "./canonical.ts";
import type { DeploymentDescriptor } from "./environment.ts";
import { pageIndexability } from "./indexability.ts";
import { pageMetadata } from "./metadata.ts";
import {
  type BreadcrumbLabel,
  breadcrumbList,
} from "./schema/breadcrumbList.ts";
import { faqPage } from "./schema/faqPage.ts";
import { type JsonLdNode, schemaOptions } from "./schema/JsonLd.tsx";
import { organization } from "./schema/organization.ts";

/**
 * The page's `Metadata`, or `undefined` where the page does not exist in this locale (the route
 * answers 404). `index,follow` only when the page exists, its content is reviewed, its locale is
 * indexable and this is the indexing environment. A non-`https` origin emits no hreflang rather
 * than an invalid one (the corridor route documents the rule).
 */
export function infoPageMetadata(
  pageId: InfoPageId,
  locale: string,
  deployment: DeploymentDescriptor,
): Metadata | undefined {
  // Either family: a legal page's `reviewed` is `reviewed && lawyerReviewed` (AC-17).
  const view = infoPageHeadView(pageId, locale);
  if (view === undefined) return undefined;
  const verdict = pageIndexability(
    { pageType: pageId, locale, exists: true, reviewed: view.reviewed },
    deployment,
  );
  const cluster = deployment.siteUrl.startsWith("https:")
    ? alternatesFor(
        { pathByLocale: infoPageHreflangPaths(pageId) },
        { baseUrl: deployment.siteUrl },
      ).find((page) => page.url.endsWith(view.path))?.alternates
    : undefined;
  return pageMetadata({
    title: view.seoTitle,
    description: view.seoDescription,
    directive: verdict.directive,
    canonical: canonicalFor(locale, view.path, { baseUrl: deployment.siteUrl }),
    ...(cluster === undefined ? {} : { alternates: cluster }),
  });
}

/**
 * The page's JSON-LD nodes (AC-19): empty where the page does not exist or the origin is not a
 * URL. `label` resolves the breadcrumb's registry keys with the route's own translator, so the
 * schema's labels and the visible trail are one message.
 */
export function infoPageJsonLd(
  pageId: InfoPageId,
  locale: string,
  deployment: DeploymentDescriptor,
  label: BreadcrumbLabel,
): readonly JsonLdNode[] {
  const head = infoPageHeadView(pageId, locale);
  const options = schemaOptions(deployment.siteUrl);
  if (head === undefined || options === undefined) return [];
  const view = infoPageView(pageId, locale);
  return [
    breadcrumbList(head.breadcrumb, label, options),
    pageId === "help" && view !== undefined ? faqPage(view.faq) : undefined,
    pageId === "about" ? organization(COMPANY, options) : undefined,
  ].filter((node) => node !== undefined);
}
