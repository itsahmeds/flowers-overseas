import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactElement } from "react";

import { infoPageExists, infoPagePath } from "@/modules/content";
import {
  LanguageAlternates,
  alternatesFor,
  localePath,
  messagesReviewedFor,
  routableLocaleCodes,
} from "@/modules/i18n";
import {
  type ReviewStars,
  reviewPolicyLive,
  reviewsPageDisplay,
  reviewsPageMeetsIndexMinimum,
} from "@/modules/reviews/display";
import type { PublicReview } from "@/modules/reviews/public";
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
import type { ReviewCardData } from "@/modules/ui/reviews/ReviewDisplay";
import {
  ReviewsPageView,
  reviewsPageHref,
} from "@/modules/ui/reviews/ReviewsPageView";

/**
 * The reviews page's head and body, **once**, for its two route files (spec 022a §2 "Reviews
 * page", §5.3, §5.4, §6; AC-24, AC-25, AC-27; TASK-373), as `./product-route.tsx` is for the PDP:
 *
 * ```
 * /{locale}/{reviews}                   -reviews/page.tsx              prebuilt (ISR 3600)
 * /{locale}/{reviews}?page=N&stars=n    %5Fquery/-reviews/page.tsx     per request
 * /{locale}/{reviews}?page=1            %5Fquery/-reviews/first        301 to the bare URL
 * ```
 *
 * `next.config.ts` rewrites the localised address to these (`src/lib/reviews-routes.ts`), so the
 * bare page reads no query string and stays prebuilt.
 *
 * - **Exists** (200) with at least one published review, else 404 (`plan/02` §6).
 * - **Robots**: `pageIndexability()` over `reviewsPage`, whose `reviewed` term is the page's own
 *   copy reviewed in this locale **and** ten published reviews with visible text (§13 Q5); a
 *   `?stars=n` URL states `unparameterised: false`, so it is `noindex,follow` whatever the rest,
 *   canonical to the bare URL. `?page=N` inherits the base page's directive and is self-canonical.
 * - **JSON-LD**: `BreadcrumbList` only. Never `aggregateRating`, `Review` or an `Organization`
 *   carrying either (Google: self-serving reviews are ineligible; AC-27).
 */

/** The locales the page may render in: every routable one (the set is the same in each). */
export function reviewsLocales(): string[] {
  return [...routableLocaleCodes()];
}

/** The page's own address in `locale`: `/{locale}/{reviews}`. */
export function reviewsPath(locale: string): string {
  return localePath(locale, "reviews");
}

export interface ReviewsRequest {
  readonly page: number;
  readonly stars: ReviewStars | undefined;
}

function crumbs(locale: string) {
  return [
    { labelKey: "common.homeLink", href: `/${locale}`, current: false },
    { labelKey: "reviews.page.crumb", current: true },
  ] as const;
}

/** A published review as the card reads it. */
export function cardOf(review: PublicReview): ReviewCardData {
  return {
    id: review.id,
    rating: review.rating,
    text: review.text,
    displayName: review.display_name,
    localeCode: review.locale_code,
    deliveredMonth: review.delivered_month,
    countryIso2: review.iso2,
    responseText: review.response_text,
    withheldReason: review.withheld_reason,
  };
}

/** The review policy's path where it exists now, else `undefined`. */
export async function reviewPolicyHref(
  locale: string,
): Promise<string | undefined> {
  if (!infoPageExists("review-policy", locale)) return undefined;
  if (!(await reviewPolicyLive())) return undefined;
  return infoPagePath("review-policy", locale);
}

async function displayOr404(locale: string, request: ReviewsRequest) {
  if (!reviewsLocales().includes(locale)) notFound();
  const display = await reviewsPageDisplay(request.page, request.stars);
  if (display === undefined) notFound();
  return display;
}

/** The page's `<head>`. */
export async function reviewsRouteMetadata(
  locale: string,
  request: ReviewsRequest,
): Promise<Metadata> {
  const display = await displayOr404(locale, request);
  const deployment = deploymentDescriptor(process.env);
  const t = await getTranslations({ locale, namespace: "reviews" });
  const verdict = pageIndexability(
    {
      pageType: "reviewsPage",
      locale,
      exists: true,
      reviewed:
        messagesReviewedFor(locale, "reviews.page") &&
        reviewsPageMeetsIndexMinimum(display.summary),
      unparameterised: request.stars === undefined,
    },
    deployment,
  );
  const bare = reviewsPath(locale);
  const own =
    request.stars === undefined
      ? reviewsPageHref(bare, request.page, undefined)
      : bare;
  const cluster =
    request.page === 1 &&
    request.stars === undefined &&
    deployment.siteUrl.startsWith("https:")
      ? alternatesFor(
          { pageType: "reviews" },
          { baseUrl: deployment.siteUrl },
        ).find((page) => page.url.endsWith(bare))?.alternates
      : undefined;
  return pageMetadata({
    title: t("page.title"),
    description: t("page.verify"),
    directive: verdict.directive,
    canonical: canonicalFor(locale, own, { baseUrl: deployment.siteUrl }),
    ...(cluster === undefined ? {} : { alternates: cluster }),
  });
}

/** The page's body, its language links and its `BreadcrumbList`. */
export async function reviewsRouteBody(
  locale: string,
  request: ReviewsRequest,
): Promise<ReactElement> {
  const display = await displayOr404(locale, request);
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const label = t as unknown as BreadcrumbLabel;
  const options = schemaOptions(deploymentDescriptor(process.env).siteUrl);
  const trail = crumbs(locale);
  return (
    <>
      <ReviewsPageView
        crumbs={trail.map((crumb) => ({
          key: crumb.labelKey,
          label: label(crumb.labelKey),
          ...("href" in crumb ? { href: crumb.href } : {}),
          current: crumb.current,
        }))}
        locale={locale}
        page={request.page}
        pages={display.pages}
        path={reviewsPath(locale)}
        policyHref={await reviewPolicyHref(locale)}
        reviews={display.reviews.map(cardOf)}
        stars={request.stars}
        summary={display.summary}
      />
      <LanguageAlternates
        paths={Object.fromEntries(
          reviewsLocales().map((code) => [code, reviewsPath(code)]),
        )}
      />
      <JsonLd
        nodes={
          options === undefined ? [] : [breadcrumbList(trail, label, options)]
        }
      />
    </>
  );
}
