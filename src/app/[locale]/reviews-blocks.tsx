import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { LocaleCode } from "@/config/locales";
import { formatRegionName } from "@/modules/i18n";
import {
  type ReviewDisplay,
  reviewBlockDisplay,
} from "@/modules/reviews/display";
import { type JsonLdNode, withProductReviews } from "@/modules/seo";
import {
  ReviewsBlock,
  ReviewsTitleLine,
} from "@/modules/ui/reviews/ReviewDisplay";

import { cardOf, reviewPolicyHref, reviewsPath } from "./reviews-route";

/**
 * Spec 022a's PDP and corridor blocks, composed where the page and the reviews already meet (spec
 * 022a §2 "Display", §5.3, §6 "Schema"; AC-26, AC-27; TASK-373): `src/modules/catalog` and
 * `src/modules/geo` may not read the reviews, so their routes ask here and hand the elements in.
 * Absent under three published reviews of the scope: no line, no block, no markup.
 */

export interface ProductReviews {
  readonly display: ReviewDisplay;
  readonly line: ReactElement;
  readonly block: ReactElement;
}

/** The PDP's line and block for `sku`, or `undefined` under the minimum. */
export async function productReviews(
  locale: string,
  sku: string,
): Promise<ProductReviews | undefined> {
  const display = await reviewBlockDisplay({ productSku: sku });
  if (display === undefined) return undefined;
  return {
    display,
    line: <ReviewsTitleLine locale={locale} summary={display.summary} />,
    block: (
      <ReviewsBlock
        locale={locale}
        policyHref={await reviewPolicyHref(locale)}
        reviews={display.reviews.map(cardOf)}
        reviewsHref={reviewsPath(locale)}
        summary={display.summary}
      />
    ),
  };
}

/**
 * The PDP's JSON-LD with the review half on its `Product` node (AC-27): `aggregateRating` equal to
 * the visible summary and a `review` entry per visible named card. A page whose `Product` node is
 * gated off (spec 009) gets nothing: there is no other node to put it on.
 */
export function withReviewMarkup(
  nodes: readonly (JsonLdNode | undefined)[],
  reviews: ProductReviews | undefined,
): readonly (JsonLdNode | undefined)[] {
  if (reviews === undefined) return nodes;
  const { summary } = reviews.display;
  if (summary.average === null) return nodes;
  const average = summary.average;
  return nodes.map((node) =>
    node?.["@type"] === "Product"
      ? withProductReviews(node, {
          average,
          count: summary.count,
          cards: reviews.display.reviews.map((review) => ({
            rating: review.rating,
            text: review.text,
            displayName: review.display_name,
            localeCode: review.locale_code,
            publishedAt: review.published_at,
          })),
        })
      : node,
  );
}

/** The corridor block for `iso2`, or `undefined` under the minimum. Never any markup. */
export async function corridorReviews(
  locale: string,
  iso2: string,
): Promise<ReactElement | undefined> {
  const display = await reviewBlockDisplay({ countryIso2: iso2 });
  if (display === undefined) return undefined;
  const t = await getTranslations({ locale, namespace: "reviews" });
  return (
    <ReviewsBlock
      lede={t("block.country", {
        country: formatRegionName(iso2, locale as LocaleCode),
      })}
      locale={locale}
      policyHref={await reviewPolicyHref(locale)}
      reviews={display.reviews.map(cardOf)}
      reviewsHref={reviewsPath(locale)}
      summary={display.summary}
    />
  );
}
