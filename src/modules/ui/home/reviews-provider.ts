/**
 * `ReviewsProvider` — the seam the verified-reviews section reads (spec 004 §13's 2026-09-08
 * resolution note "verified-reviews section hidden until real reviews exist, with a Trustpilot
 * slot", §8, **AC-15**; `plan/07` §7; `plan/09` Phase 0 AC 6; founder ruling 2026-09-08 "reviews
 * are real-only, never seeded"; TASK-054).
 *
 * Same shape as `./trending-provider.ts` and spec 003's locale registry, with one difference that
 * is the entire point of the file: **the Phase 0 provider answers with nothing, and there is no
 * configuration that could make it answer otherwise.** There is no `src/config/reviews.ts`, no
 * fixture on a page, no "demo" flag. A review can only enter the site through a provider backed
 * by completed orders (spec 016), so the placeholder rows the canvas draws
 * (`[Buyer first name] · sent to Warszawa · [date]`) cannot reach a rendered page — which is what
 * AC-15 asserts and what `tests/e2e/honesty.spec.ts` proves against the served document.
 *
 * The populated branch is still written, still typed and still covered — by
 * `reviewsProviderOf()` in the unit tests and by `/dev/components` through `ReviewsSection`'s
 * `provider` prop — because the day the first review exists it must render correctly, not be
 * designed then.
 *
 * **Data minimisation is in the type** (`plan/07` §2, GDPR Art. 5(1)(c)): a review carries a
 * first name, the destination town, the date and the text. No surname, no email, no order id, no
 * recipient address, no buyer identifier. Spec 016's provider projects onto exactly this shape,
 * so the section cannot render a field the RoPA does not cover.
 */

/** Whether the reviewer bought the flowers or received them — the canvas's two attributions. */
export const REVIEW_KINDS = ["order", "delivery"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export interface VerifiedReview {
  readonly id: string;
  /** The review text, as written. Never generated, never edited, never seeded. */
  readonly body: string;
  /** First name only (`plan/07` §2). */
  readonly authorFirstName: string;
  /** The destination town, in its own language — the canvas's "sent to Warszawa". */
  readonly place: string;
  /** The delivery date as `YYYY-MM-DD`; the section formats it in the reader's locale. */
  readonly date: string;
  readonly kind: ReviewKind;
}

export interface ReviewsProvider {
  list(): readonly VerifiedReview[];
}

/**
 * The Phase 0 provider. It answers with an empty list because there are no completed orders, and
 * it is a constant rather than a read of a config file so that no data change can populate it.
 */
export const staticReviewsProvider: ReviewsProvider = { list: () => [] };

let active: ReviewsProvider = staticReviewsProvider;

/** The provider the section reads. */
export function getReviewsProvider(): ReviewsProvider {
  return active;
}

/** The injection hook for the seam test. Module-internal — see `./trending-provider.ts`. */
export async function withReviewsProvider<T>(
  provider: ReviewsProvider,
  body: () => T | Promise<T>,
): Promise<T> {
  const previous = active;
  active = provider;
  try {
    return await body();
  } finally {
    active = previous;
  }
}

/** Build a provider from an arbitrary review list — the fake, and spec 016's shape. */
export function reviewsProviderOf(
  reviews: readonly VerifiedReview[],
): ReviewsProvider {
  return { list: () => reviews };
}
