/**
 * The florist rating and acceptance rate (spec 022a §2 "The florist rating", §5.2
 * `partners.rating_refresh`, §11, §13 Q10; AC-21, AC-22; TASK-372).
 *
 *  - `partnerRatingBp(ratings, now)` = round(2000 × mean) over the first-party ratings of the
 *    last 90 days that are not removed (5.00 = 10000, 4.50 = 9000); `null` under 3 ratings.
 *  - `acceptanceRateBp(offers, now)` = round(10000 × accepted / answered) over 90 days, withdrawn
 *    offers excluded; `null` under 5 answered offers.
 *  - `refreshPartnerRatings(executor, now, partnerId?)` writes both columns for one florist, or for
 *    every non-demo florist (the nightly run). It never writes `status`: pausing stays manual
 *    (`plan/06` §5.4); a low rating raises `alert=partners.rating_low` and nothing else.
 *
 * The window is absolute time (90 × 24 hours), never calendar days. Spec 016's `rankCandidates`
 * reads a `NULL` rating as 9000 (`src/config/routing.ts`).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  ACCEPTANCE_MINIMUM,
  RATING_BP_PER_STAR,
  RATING_MINIMUM,
  RATING_WINDOW_DAYS,
} from "@/config/reviews";
import type { OrderExecutor } from "@/modules/orders";

const WINDOW_MS = RATING_WINDOW_DAYS * 24 * 3_600_000;

/** An active florist under this rating with at least `RATING_MINIMUM` ratings raises an alert. */
export const RATING_LOW_BP = 8400;

export interface RatingInput {
  readonly rating: number;
  readonly createdAt: Date;
  readonly removed: boolean;
}

export interface OfferInput {
  readonly response: "accept" | "decline" | "timeout" | null;
  readonly respondedAt: Date | null;
  readonly withdrawn: boolean;
}

function inWindow(at: Date, now: Date): boolean {
  const age = now.getTime() - at.getTime();
  return age >= 0 && age <= WINDOW_MS;
}

/** `rating_90d_bp` (§13 Q10). Pure. */
export function partnerRatingBp(
  ratings: readonly RatingInput[],
  now: Date,
): number | null {
  const counted = ratings.filter(
    (entry) => !entry.removed && inWindow(entry.createdAt, now),
  );
  if (counted.length < RATING_MINIMUM) return null;
  const sum = counted.reduce((total, entry) => total + entry.rating, 0);
  return Math.round((RATING_BP_PER_STAR * sum) / counted.length);
}

/** `acceptance_rate_bp` (§2). Pure. */
export function acceptanceRateBp(
  offers: readonly OfferInput[],
  now: Date,
): number | null {
  const answered = offers.filter(
    (offer) =>
      !offer.withdrawn &&
      offer.response !== null &&
      offer.respondedAt !== null &&
      inWindow(offer.respondedAt, now),
  );
  if (answered.length < ACCEPTANCE_MINIMUM) return null;
  const accepted = answered.filter((offer) => offer.response === "accept");
  return Math.round((10_000 * accepted.length) / answered.length);
}

const RatingRow = z.object({
  rating: z.coerce.number().int(),
  created_at: z.coerce.date(),
  removed: z.boolean(),
});
const OfferRow = z.object({
  response: z.enum(["accept", "decline", "timeout"]).nullable(),
  responded_at: z.coerce.date().nullable(),
  withdrawn: z.boolean(),
});
const PartnerRow = z.object({ id: z.uuid(), status: z.string() });

export interface RatingRefresh {
  readonly partnerId: string;
  readonly ratingBp: number | null;
  readonly acceptanceBp: number | null;
  /** Active, rated by at least the minimum, and under 4.20: the ops alert's condition (§11). */
  readonly low: boolean;
}

/** Both values for one florist, computed from its rows and written to its two columns. */
async function refreshOne(
  executor: OrderExecutor,
  partner: z.infer<typeof PartnerRow>,
  now: Date,
): Promise<RatingRefresh> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  const ratings = (
    await executor.execute(sql`
      SELECT rating, created_at, (moderation_status = 'hidden') AS removed
      FROM review
      WHERE partner_id = ${partner.id} AND source = 'internal'
        AND created_at >= ${since}::timestamptz`)
  ).map((row) => {
    const parsed = RatingRow.parse(row);
    return {
      rating: parsed.rating,
      createdAt: parsed.created_at,
      removed: parsed.removed,
    };
  });
  const offers = (
    await executor.execute(sql`
      SELECT response, responded_at, (withdrawn_at IS NOT NULL) AS withdrawn
      FROM order_assignment
      WHERE partner_id = ${partner.id} AND responded_at >= ${since}::timestamptz`)
  ).map((row) => {
    const parsed = OfferRow.parse(row);
    return {
      response: parsed.response,
      respondedAt: parsed.responded_at,
      withdrawn: parsed.withdrawn,
    };
  });
  const ratingBp = partnerRatingBp(ratings, now);
  const acceptanceBp = acceptanceRateBp(offers, now);
  await executor.execute(sql`
    UPDATE fulfillment_partner
    SET rating_90d_bp = ${ratingBp}, acceptance_rate_bp = ${acceptanceBp}
    WHERE id = ${partner.id}
      AND (rating_90d_bp IS DISTINCT FROM ${ratingBp}
           OR acceptance_rate_bp IS DISTINCT FROM ${acceptanceBp})`);
  return {
    partnerId: partner.id,
    ratingBp,
    acceptanceBp,
    low:
      partner.status === "active" &&
      ratingBp !== null &&
      ratingBp < RATING_LOW_BP,
  };
}

/**
 * `partners.rating_refresh`: one florist (after a submission or a moderation touching it), or
 * every non-demo florist (nightly). Writes the two columns only, never `status`.
 */
export async function refreshPartnerRatings(
  executor: OrderExecutor,
  now: Date,
  partnerId?: string,
): Promise<RatingRefresh[]> {
  const partners = (
    await executor.execute(
      partnerId === undefined
        ? sql`SELECT id, status FROM fulfillment_partner WHERE status <> 'demo' ORDER BY id`
        : sql`SELECT id, status FROM fulfillment_partner WHERE id = ${partnerId}`,
    )
  ).map((row) => PartnerRow.parse(row));
  const results: RatingRefresh[] = [];
  for (const partner of partners) {
    results.push(await refreshOne(executor, partner, now));
  }
  return results;
}
