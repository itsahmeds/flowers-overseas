/**
 * The reviews page's body (spec 022a §5.3 "Reviews page", AC-24, AC-25; TASK-373), from
 * `docs/design/wireframes/reviews-page-desktop` and `-mobile`: the trail, the eyebrow and the H1;
 * on desktop the summary on 4 of 12 columns, sticky at the inline start, with the verification
 * line and the policy link, and the filter, the list and the pages on 8; on the phone the summary
 * first, then the filter chips, the cards and the pages. Newest first, never by rating.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { PAGE_FRAME } from "../primitives/layout.tsx";
import { Breadcrumbs, type Crumb } from "../primitives/Breadcrumbs.tsx";
import { Display, Eyebrow } from "../primitives/typography.tsx";

import {
  RatingSummary,
  type RatingSummaryData,
  type ReviewCardData,
  ReviewList,
} from "./ReviewDisplay.tsx";

export interface ReviewsPageViewProps {
  readonly locale: string;
  readonly crumbs: readonly Crumb[];
  readonly summary: RatingSummaryData;
  readonly reviews: readonly ReviewCardData[];
  /** The bare page URL, `/{locale}/{reviews}`. */
  readonly path: string;
  readonly page: number;
  readonly pages: number;
  readonly stars: number | undefined;
  /** The review policy, where it exists. */
  readonly policyHref?: string | undefined;
}

const FILTERS = [undefined, 5, 4, 3, 2, 1] as const;

/** `?page=` and `?stars=` in one fixed order; page 1 is the bare URL (`?page=1` 301s, §6). */
export function reviewsPageHref(
  path: string,
  page: number,
  stars: number | undefined,
): string {
  const query = [
    ...(stars === undefined ? [] : [`stars=${String(stars)}`]),
    ...(page === 1 ? [] : [`page=${String(page)}`]),
  ];
  return query.length === 0 ? path : `${path}?${query.join("&")}`;
}

const CHIP =
  "bg-card text-ink inline-flex min-h-(--target-min) items-center rounded-full px-[16px] text-sm no-underline shadow-[inset_0_0_0_1.5px_var(--color-rule)] aria-[current]:font-bold aria-[current]:shadow-[inset_0_0_0_2px_var(--color-selected)]";

const PAGE_LINK =
  "text-ink inline-grid min-h-(--target-min) min-w-(--target-min) place-items-center rounded-full px-[12px] no-underline tabular-nums shadow-[inset_0_0_0_1.5px_var(--color-rule)] aria-[current]:bg-ink aria-[current]:text-paper aria-[current]:font-bold aria-[current]:shadow-none";

export function ReviewsPageView({
  locale,
  crumbs,
  summary,
  reviews,
  path,
  page,
  pages,
  stars,
  policyHref,
}: ReviewsPageViewProps): ReactElement {
  const t = useTranslations("reviews");
  const eyebrow = useTranslations("home.reviews");
  const a11y = useTranslations("a11y");
  return (
    <main className={PAGE_FRAME} id="main">
      <Breadcrumbs crumbs={crumbs} label={a11y("breadcrumb")} />
      <div className="grid gap-[12px] pt-[24px]">
        <Eyebrow className="m-0">{eyebrow("eyebrow")}</Eyebrow>
        <Display as="h1" size="title">
          {t("page.h1")}
        </Display>
      </div>
      <div
        className="grid items-start gap-[32px] pt-[24px] pb-[56px] lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-[72px] lg:pt-[40px] lg:pb-[96px]"
        data-fo-reviews=""
      >
        <div className="grid min-w-0 content-start gap-[18px] lg:sticky lg:top-[24px]">
          <RatingSummary
            currentStars={stars}
            locale={locale}
            starsHref={(n) => reviewsPageHref(path, 1, n)}
            summary={summary}
          />
          <p className="text-ui text-ink-2 m-0 max-w-[46ch] leading-(--line-height-tight)">
            {t("page.verify")}{" "}
            {policyHref === undefined ? null : (
              <a className="text-link underline underline-offset-4" href={policyHref}>
                {t("policyLink")}
              </a>
            )}
          </p>
        </div>
        <div className="grid min-w-0 gap-[20px]">
          <nav aria-label={t("filter.label")}>
            <ul className="m-0 flex list-none flex-wrap gap-[8px] p-0">
              {FILTERS.map((value) => (
                <li key={value ?? 0}>
                  <a
                    aria-current={value === stars ? "page" : undefined}
                    className={CHIP}
                    href={reviewsPageHref(path, 1, value)}
                  >
                    {value === undefined
                      ? t("filter.all")
                      : t("stars", { count: value })}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <ReviewList locale={locale} reviews={reviews} />
          {pages <= 1 ? null : (
            <nav aria-label={t("pages.label")} className="mt-[28px]">
              <ul className="m-0 flex list-none flex-wrap gap-[6px] p-0">
                {page > 1 ? (
                  <li>
                    <a
                      className={PAGE_LINK}
                      href={reviewsPageHref(path, page - 1, stars)}
                      rel="prev"
                    >
                      {t("pages.previous")}
                    </a>
                  </li>
                ) : null}
                {Array.from({ length: pages }, (_, index) => index + 1).map(
                  (n) => (
                    <li key={n}>
                      <a
                        aria-current={n === page ? "page" : undefined}
                        aria-label={t("pages.page", { n })}
                        className={PAGE_LINK}
                        href={reviewsPageHref(path, n, stars)}
                      >
                        {n}
                      </a>
                    </li>
                  ),
                )}
                {page < pages ? (
                  <li>
                    <a
                      className={PAGE_LINK}
                      href={reviewsPageHref(path, page + 1, stars)}
                      rel="next"
                    >
                      {t("pages.next")}
                    </a>
                  </li>
                ) : null}
              </ul>
            </nav>
          )}
        </div>
      </div>
    </main>
  );
}
