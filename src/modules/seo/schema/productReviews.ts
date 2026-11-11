/**
 * The review half of the PDP's `Product` node (spec 022a §6 "Schema", AC-27; TASK-373):
 * `aggregateRating` and up to five named `review` entries, merged into the one `Product` node spec
 * 009 emits and nowhere else. Never on `Organization`, `LocalBusiness`, `WebPage`, the reviews
 * page or a corridor (Google: self-serving reviews are ineligible), never Trustpilot's figures.
 *
 * The caller hands in exactly what the page shows: the summary's average and count, and the cards
 * on the page. `ratingValue` is the visible average to one decimal, as `RatingSummary` prints it;
 * a `review` entry exists only for a card whose author chose to show a first name (§6), with the
 * card's own rating and text.
 */
import { ratingValueOf } from "@/config/review-rating";

import type { JsonLdNode } from "./JsonLd.tsx";

/** At most this many `review` entries: the PDP block shows five cards. */
export const PRODUCT_REVIEW_ENTRIES_MAX = 5;

export interface ProductReviewMarkupInput {
  /** The visible average (unrounded); emitted to one decimal. */
  readonly average: number;
  readonly count: number;
  /** The cards the page shows, newest first. */
  readonly cards: readonly {
    readonly rating: number;
    readonly text: string | null;
    readonly displayName: string | null;
    readonly localeCode: string | null;
    readonly publishedAt: Date;
  }[];
}

/** The `Product` node with `aggregateRating` and its named `review` entries added. */
export function withProductReviews(
  product: JsonLdNode,
  input: ProductReviewMarkupInput,
): JsonLdNode {
  if (product["@type"] !== "Product") {
    throw new Error("review markup goes on a Product node only (spec 022a AC-27)");
  }
  const reviews = input.cards
    .filter((card) => card.displayName !== null)
    .slice(0, PRODUCT_REVIEW_ENTRIES_MAX)
    .map((card) => ({
      "@type": "Review",
      author: { "@type": "Person", name: card.displayName },
      datePublished: card.publishedAt.toISOString().slice(0, 10),
      reviewRating: {
        "@type": "Rating",
        ratingValue: card.rating,
        bestRating: 5,
        worstRating: 1,
      },
      ...(card.text === null
        ? {}
        : {
            reviewBody: card.text,
            ...(card.localeCode === null ? {} : { inLanguage: card.localeCode }),
          }),
    }));
  return {
    ...product,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: ratingValueOf(input.average),
      ratingCount: input.count,
      bestRating: 5,
      worstRating: 1,
    },
    ...(reviews.length === 0 ? {} : { review: reviews }),
  };
}
