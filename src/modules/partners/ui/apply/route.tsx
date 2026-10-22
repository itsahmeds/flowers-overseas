/**
 * The application and sent pages' route logic (spec 011 §2, §5.4, §6, AC-1, AC-5, AC-6, AC-10;
 * TASK-210), shared by their route files.
 *
 * **Why these two pages have route files of their own.** Spec 011 §5.4 serves its pages through
 * the one-route-per-depth files and `resolveLocalePath()`, and the landing and the walkthrough are.
 * The application and its sent page are not, because spec 003 §14 A17 (clause 2, check 11) keeps
 * `forFlorists.apply.*` and `forFlorists.sent.*` out of the unreviewed share only when **no
 * indexable page imports a file that reads them**: the shared depth-3 and depth-4 files render
 * the corridors, the walkthrough and the product pages, so an apply branch in them would put
 * fifty unreviewed keys in the share and turn English `noindex`. A static folder per spelling of
 * the `forFlorists` segment (`for-florists/apply`, `fuer-floristen/bewerben`,
 * `dla-kwiaciarni/zglos-sie`, each with its `sent` leaf) holds a two-line route file that calls
 * this one; the registry still owns every slug, and a route answers 404 for any locale whose path
 * is not its own (`/de/for-florists/apply`).
 *
 * Both pages: ISR 3600 (the `GET` holds nothing personal), `noindex,follow` by policy in every
 * combination (`PAGE_TYPE_POLICY`), self-canonical, no hreflang, never in a sitemap; the apply page
 * carries `BreadcrumbList` (AC-6).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { COMPANY } from "@/config/company";
import { FLORISTS } from "@/config/florists";
import {
  infoPageAlternatePaths,
  infoPageExists,
  infoPagePath,
} from "@/modules/content";
import { LanguageAlternates, routableLocaleCodes } from "@/modules/i18n";
import {
  type BreadcrumbLabel,
  JsonLd,
  type JsonLdNode,
  breadcrumbList,
  canonicalFor,
  deploymentDescriptor,
  pageIndexability,
  pageMetadata,
  schemaOptions,
} from "@/modules/seo";

import { label } from "../inbox/format.ts";

import { ApplyPage } from "./ApplyPage.tsx";
import { SentPage } from "./SentPage.tsx";

export type FloristFormPage = "florist-apply" | "florist-apply-sent";

interface LocaleParams {
  readonly params: Promise<{ locale: string }>;
}

export interface FloristFormRoute {
  readonly generateStaticParams: () => { locale: string }[];
  readonly generateMetadata: (props: LocaleParams) => Promise<Metadata>;
  readonly Page: (props: LocaleParams) => Promise<ReactElement>;
}

/** The breadcrumb of the apply page: Home › For florists › Apply, as the artboard draws it. */
function applyCrumbs(locale: string) {
  return [
    { labelKey: "common.homeLink", href: `/${locale}`, current: false },
    {
      labelKey: "nav.forFlorists",
      href: infoPagePath("for-florists", locale),
      current: false,
    },
    { labelKey: "forFlorists.apply.crumb", current: true },
  ] as const;
}

/**
 * The apply page's JSON-LD (AC-6): its `BreadcrumbList`, the trail the page draws. The sent page
 * carries none: it has no trail. `label` resolves the keys with the page's own translator.
 */
export function floristApplyJsonLd(
  locale: string,
  label: BreadcrumbLabel,
  options: { readonly baseUrl: string } | undefined,
): readonly JsonLdNode[] {
  if (options === undefined) return [];
  return [breadcrumbList(applyCrumbs(locale), label, options)].filter(
    (node) => node !== undefined,
  );
}

/**
 * One route file's logic. `segments` is the folder path below `/{locale}` the file sits at; the
 * route owns a locale exactly when the registry's path for the page there is that path.
 */
export function floristFormRoute(
  page: FloristFormPage,
  segments: readonly string[],
): FloristFormRoute {
  const owns = (locale: string): boolean =>
    infoPageExists(page, locale) &&
    infoPagePath(page, locale) === `/${[locale, ...segments].join("/")}`;

  return {
    generateStaticParams: () =>
      routableLocaleCodes()
        .filter(owns)
        .map((locale) => ({ locale })),

    async generateMetadata({ params }) {
      const { locale } = await params;
      if (!owns(locale)) notFound();
      const t = await getTranslations({ locale });
      const deployment = deploymentDescriptor(process.env);
      const verdict = pageIndexability(
        { pageType: page, locale, exists: true, reviewed: false },
        deployment,
      );
      const path = infoPagePath(page, locale);
      return pageMetadata({
        title:
          page === "florist-apply"
            ? t("forFlorists.apply.title")
            : t("forFlorists.sent.title"),
        description:
          page === "florist-apply"
            ? t("forFlorists.apply.intro")
            : t("forFlorists.sent.h1"),
        directive: verdict.directive,
        canonical: canonicalFor(locale, path, { baseUrl: deployment.siteUrl }),
      });
    },

    async Page({ params }) {
      const { locale } = await params;
      if (!owns(locale)) notFound();
      setRequestLocale(locale);
      const options = schemaOptions(deploymentDescriptor(process.env).siteUrl);
      const t = await getTranslations({ locale });
      const crumbLabel: BreadcrumbLabel = (key, values) =>
        label(t as never, key, values);
      const nodes =
        page === "florist-apply"
          ? floristApplyJsonLd(locale, crumbLabel, options)
          : [];
      return (
        <>
          {page === "florist-apply" ? (
            <ApplyPage
              locale={locale}
              form={FLORISTS.applicationForm}
              company={COMPANY}
            />
          ) : (
            <SentPage locale={locale} company={COMPANY} />
          )}
          <LanguageAlternates paths={infoPageAlternatePaths(page)} />
          <JsonLd nodes={nodes} />
        </>
      );
    },
  };
}
