/**
 * The review display components (spec 022a §5.3, §7, §8 "Accessibility"; AC-25, AC-26; TASK-373),
 * built from `docs/design/wireframes/reviews-page-*`, `product-*` and `corridor-country-*` and the
 * "Reviews" sheet of `system/components.dc.html` (`.rv-*`):
 *
 *  - `RatingSummary`: the average to one decimal, the stars, the count, and five bars, 5 to 1,
 *    each a link to its `?stars=n` filter, whose counts sum to the count (the 1-star bar included).
 *  - `ReviewCard`: the stars and their text alternative, the buyer's words in their own `lang` and
 *    `dir="auto"` (never translated) or the withheld line, our reply under its label, the first
 *    name or "Verified buyer", the verified badge, "Delivered {month year} · {country}" and the
 *    "Report" link (§13 Q8).
 *  - `ReviewsBlock`: the PDP and corridor block; `ReviewsTitleLine`: the PDP's line by the title.
 *
 * Every region that carries review words is marked `data-fo-reviews`, the only place the honesty
 * gates admit them (AC-28). Server-rendered, inline SVG in fixed boxes, no script.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { COMPANY, whatsappHref } from "@/config/company";
import type { LocaleCode } from "@/config/locales";
import { ratingValueOf } from "@/config/review-rating";

import { formatDate, formatNumber, formatRegionName } from "../../i18n";
import { Display, Eyebrow } from "../primitives/typography.tsx";

import { RatingStars } from "./RatingStars.tsx";

/** The reasons a comment can be withheld for (spec 022a §5.1); each has its own label. */
export type WithheldReason = "personal_data" | "abuse" | "illegal";

const WITHHELD_KEY = {
  personal_data: "card.withheldReason.personalData",
  abuse: "card.withheldReason.abuse",
  illegal: "card.withheldReason.illegal",
} as const satisfies Readonly<Record<WithheldReason, string>>;

/** One published review as a card shows it: `public_review`'s columns, nothing private. */
export interface ReviewCardData {
  readonly id: string;
  readonly rating: number;
  readonly text: string | null;
  readonly displayName: string | null;
  readonly localeCode: string | null;
  readonly deliveredMonth: Date | null;
  readonly countryIso2: string | null;
  readonly responseText: string | null;
  readonly withheldReason: WithheldReason | null;
}

/** A scope's summary: the published set's average, count and per-star counts. */
export interface RatingSummaryData {
  readonly average: number | null;
  readonly count: number;
  readonly distribution: Readonly<Record<1 | 2 | 3 | 4 | 5, number>>;
}

const STARS = [5, 4, 3, 2, 1] as const;

/** The visible average: one decimal, from the same rounding the JSON-LD uses (AC-27). */
export function visibleAverage(average: number, locale: string): string {
  return formatNumber(ratingValueOf(average), locale as LocaleCode, {
    fractionDigits: 1,
  });
}

export interface RatingSummaryProps {
  readonly locale: string;
  readonly summary: RatingSummaryData;
  /** The `?stars=n` filter URL of each bar. */
  readonly starsHref: (stars: number) => string;
  /** The filter in force on the reviews page, marked `aria-current` on its bar. */
  readonly currentStars?: number | undefined;
}

export function RatingSummary({
  locale,
  summary,
  starsHref,
  currentStars,
}: RatingSummaryProps): ReactElement {
  const t = useTranslations("reviews");
  const average = summary.average ?? 0;
  const shown = visibleAverage(average, locale);
  return (
    <div className="grid min-w-0 content-start gap-[18px]" data-fo-rating-summary="">
      <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[10px]">
        <span
          className="display num text-ink text-[64px] leading-[0.95]"
          data-fo-review-average={shown}
        >
          {shown}
        </span>
        <div className="grid gap-[6px]">
          <RatingStars
            label={t("summary.rated", { average: shown })}
            size={24}
            value={average}
          />
          <span className="text-ui text-ink-2" data-fo-review-count={summary.count}>
            {t("count", { count: summary.count })}
          </span>
        </div>
      </div>
      <ul className="m-0 grid list-none gap-[4px] p-0">
        {STARS.map((stars) => {
          const count = summary.distribution[stars];
          const share = summary.count === 0 ? 0 : (count / summary.count) * 100;
          return (
            <li key={stars}>
              <a
                aria-current={currentStars === stars ? "page" : undefined}
                aria-label={t("summary.bar", { stars, count })}
                className="group text-ink-2 aria-[current]:text-ink grid min-h-[32px] grid-cols-[60px_minmax(0,1fr)_44px] items-center gap-[12px] text-sm no-underline aria-[current]:font-bold"
                data-fo-review-bar={stars}
                href={starsHref(stars)}
              >
                <span className="group-hover:underline">
                  {t("stars", { count: stars })}
                </span>
                <span className="bg-paper-3 block h-[8px] overflow-hidden rounded-full shadow-[inset_0_0_0_1px_var(--color-rule)]">
                  <i
                    className="bg-ink-2 block h-full rounded-[inherit]"
                    style={{ inlineSize: `${String(share)}%` }}
                  />
                </span>
                <span className="num text-end" data-fo-review-bar-count={count}>
                  {formatNumber(count, locale as LocaleCode)}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The verified badge's tick (stem green), from the sheet. */
function Tick(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="size-[15px] shrink-0"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.2}
      viewBox="0 0 24 24"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export interface ReviewCardProps {
  readonly locale: string;
  readonly review: ReviewCardData;
}

/** The DSA report link (§13 Q8): our WhatsApp, the review's number prefilled, nothing else. */
export function reportHref(message: string): string {
  return `${whatsappHref(COMPANY.contact)}?text=${encodeURIComponent(message)}`;
}

export function ReviewCard({ locale, review }: ReviewCardProps): ReactElement {
  const t = useTranslations("reviews");
  const home = useTranslations("home.reviews.verified");
  const code = locale as LocaleCode;
  const month =
    review.deliveredMonth === null
      ? undefined
      : formatDate(review.deliveredMonth, code, "monthYear", "UTC");
  const country =
    review.countryIso2 === null
      ? undefined
      : formatRegionName(review.countryIso2, code);
  let delivered: string | undefined;
  if (month !== undefined) {
    delivered =
      country === undefined
        ? t("card.deliveredMonth", { month })
        : t("card.delivered", { month, country });
  }
  return (
    <article
      className="border-rule grid min-w-0 gap-[12px] border-t py-[24px] last:border-b"
      data-fo-review-card={review.id}
    >
      <RatingStars
        label={t("card.rated", { n: review.rating })}
        value={review.rating}
      />
      {review.text === null ? null : (
        <p
          className="text-body text-ink m-0 max-w-(--measure) leading-(--line-height-body) whitespace-pre-line"
          dir="auto"
          lang={review.localeCode ?? undefined}
        >
          {review.text}
        </p>
      )}
      {review.withheldReason === null ? null : (
        <p className="text-ui text-ink-2 m-0 italic" data-fo-review-withheld="">
          {t("card.withheld", {
            reason: t(WITHHELD_KEY[review.withheldReason]),
          })}
        </p>
      )}
      {review.responseText === null ? null : (
        <div className="bg-paper-2 border-sky grid max-w-(--measure) gap-[6px] rounded-(--radius-field) border-s-[3px] px-[18px] py-[14px]">
          <h3 className="font-body text-ink-2 m-0 text-xs font-bold tracking-(--tracking-label) uppercase">
            {t("card.reply")}
          </h3>
          <p className="text-ui text-ink m-0 whitespace-pre-line">
            {review.responseText}
          </p>
        </div>
      )}
      <div className="text-ink-3 flex flex-wrap justify-between gap-x-[16px] gap-y-[6px] text-sm">
        <span className="text-ink-2 flex flex-wrap items-baseline gap-x-[12px] gap-y-[4px] text-sm">
          <b className="text-ink text-ui">
            {review.displayName === null ? (
              t("card.verifiedBuyer")
            ) : (
              <bdi>{review.displayName}</bdi>
            )}
          </b>
          <span className="text-stem inline-flex items-center gap-[5px] text-sm font-bold">
            <Tick />
            {home("order")}
          </span>
          {delivered === undefined ? null : <span>{delivered}</span>}
        </span>
        <a
          className="text-ink-3 underline-offset-4"
          href={reportHref(t("card.reportMessage", { number: review.id }))}
          rel="noopener"
        >
          {t("card.report")}
        </a>
      </div>
    </article>
  );
}

/** The cards, as a ruled column. */
export function ReviewList({
  locale,
  reviews,
}: {
  readonly locale: string;
  readonly reviews: readonly ReviewCardData[];
}): ReactElement {
  return (
    <div className="grid">
      {reviews.map((review) => (
        <ReviewCard key={review.id} locale={locale} review={review} />
      ))}
    </div>
  );
}

export interface ReviewsBlockProps {
  readonly locale: string;
  readonly summary: RatingSummaryData;
  readonly reviews: readonly ReviewCardData[];
  /** The reviews page; each bar links to its filter there. */
  readonly reviewsHref: string;
  /** The review policy, where it exists. */
  readonly policyHref?: string | undefined;
  /** The corridor's lede ("Reviews of orders we delivered in {country}."). */
  readonly lede?: ReactNode;
}

/**
 * The PDP and corridor block (AC-26): the compact summary with "See all reviews" and the policy
 * link, and at most five cards. The caller renders it only with three or more published reviews
 * of its scope; it never draws an empty state.
 */
export function ReviewsBlock({
  locale,
  summary,
  reviews,
  reviewsHref,
  policyHref,
  lede,
}: ReviewsBlockProps): ReactElement {
  const t = useTranslations("reviews");
  const eyebrow = useTranslations("home.reviews");
  return (
    <section
      aria-labelledby="reviews-heading"
      className="grid gap-[28px] pb-(--section-fluid)"
      data-fo-reviews=""
      id="reviews"
    >
      <div>
        <Eyebrow className="mb-[14px]">{eyebrow("eyebrow")}</Eyebrow>
        <Display as="h2" id="reviews-heading" size="title">
          {t.rich("block.heading", { em: (chunks) => <em>{chunks}</em> })}
        </Display>
        {lede === undefined ? null : (
          <p className="text-ink-2 mt-[14px] mb-0">{lede}</p>
        )}
      </div>
      <div className="grid items-start gap-[32px] lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-[72px]">
        <div className="grid content-start gap-[20px]">
          <RatingSummary
            locale={locale}
            starsHref={(stars) => `${reviewsHref}?stars=${String(stars)}`}
            summary={summary}
          />
          <p className="m-0 flex flex-wrap gap-x-[24px] gap-y-[8px]">
            <a className="text-link underline underline-offset-4" href={reviewsHref}>
              {t("block.seeAll")}
            </a>
            {policyHref === undefined ? null : (
              <a className="text-link underline underline-offset-4" href={policyHref}>
                {t("policyLink")}
              </a>
            )}
          </p>
        </div>
        <ReviewList locale={locale} reviews={reviews.slice(0, 5)} />
      </div>
    </section>
  );
}

/** The PDP's quiet line between the title and the price: stars and a count linking to the block. */
export function ReviewsTitleLine({
  summary,
  locale,
}: {
  readonly summary: RatingSummaryData;
  readonly locale: string;
}): ReactElement {
  const t = useTranslations("reviews");
  const shown = visibleAverage(summary.average ?? 0, locale);
  return (
    <p
      className="text-ink-2 m-0 inline-flex items-center gap-[8px] text-sm"
      data-fo-reviews=""
    >
      <RatingStars
        label={t("summary.rated", { average: shown })}
        size={14}
        value={summary.average ?? 0}
      />
      <a className="text-link underline-offset-4" href="#reviews">
        {t("count", { count: summary.count })}
      </a>
    </p>
  );
}
