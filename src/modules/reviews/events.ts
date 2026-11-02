/**
 * `review.created` v1 (spec 022a §5.2 "Events"; spec 002 §14 A6.6: status-preserving; TASK-368).
 *
 * `ReviewCreatedV1 { mode, reviewId, rating }`: appended to the order's timeline through
 * `appendEvent` with actor `buyer` (`STATUS_PRESERVING_ACTORS['review.created']`) when a buyer
 * submits a review; the order's status does not change. Ids, a mode and the star count only: no
 * text, no name, no email (the review's words live in `review`, never in an event or a log).
 *
 * Registered once, when this module is first imported; the `reviews` barrel imports it, so every
 * process that can write a review has the schema (the engine refuses an unregistered event).
 */
import { z } from "zod";

import { OrderModeSchema, registerEventSchema } from "@/modules/orders";
import { REVIEW_RATING_MAX, REVIEW_RATING_MIN } from "@/config/reviews";

export const ReviewCreatedV1 = z
  .object({
    mode: OrderModeSchema,
    reviewId: z.uuid(),
    rating: z.number().int().min(REVIEW_RATING_MIN).max(REVIEW_RATING_MAX),
  })
  .strict();
export type ReviewCreatedV1 = z.infer<typeof ReviewCreatedV1>;

registerEventSchema("review.created", 1, ReviewCreatedV1);
