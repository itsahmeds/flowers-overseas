/**
 * The versioned payload schemas of the events spec 011's florist commands write (spec 011 §5.2
 * "Orders", "Jobs and events"; ruling R1; AC-31; TASK-215).
 *
 * Eight catalogue names (`plan/11` §2 as amended by spec 002 A6.6), never the diagram's arrow
 * labels (`accept`, `decline`, `deliver`, …):
 *
 *  - registered **here**: `assignment.accepted`, `assignment.declined`,
 *    `order.no_partner_available`, `order.out_for_delivery`, `order.delivered`,
 *    `order.photo_uploaded`;
 *  - registered **by spec 013** ahead of this task, and used as they are (the registry refuses a
 *    second registration; the brief's carry-forward of PR 405): `order.captured` and
 *    `order.in_production`, `src/modules/payments/events.ts`. Importing the `payments` barrel
 *    below registers them, so the demo effect's two writes are parsed like every other.
 *
 * Every schema is v1, `.strict()` and carries `mode`. The payloads §5.2 names: `by_user_id` for a
 * partner actor (the member who pressed the button), `reason` for a decline (the closed list of
 * `OfferResponseInputSchema`), `media_asset_id` for the photo, `demo: true` for a `system:demo`
 * actor. Ids, a mode and a reason code only: no name, phone, address or card message.
 *
 * `by_user_id` is optional because rows 7, 8, 19, 20 and 25 also allow an `admin` actor, whose id
 * is the actor itself; the commands always send it. `reason` and `media_asset_id` are required:
 * a decline without its reason, or a photo event without its photo, is not a fact.
 *
 * **Not in the `orders` barrel.** These register when this directory is first imported, by the
 * florist routes and the commands' tests, the way `payments` registers its own; the barrel stays
 * free of them so `tests/unit/order-engine-registry.test.ts` can still see an unregistered event
 * refused.
 */
import { z } from "zod";

import "@/modules/payments";

import {
  OrderModeSchema,
  registerEventSchema,
  type OrderEventType,
} from "../service";

/** The decline reasons (§2: we are full, we do not deliver there, …), as stored and sent. */
export const DECLINE_REASONS = [
  "capacity",
  "out_of_area",
  "product_unavailable",
  "closed",
  "other",
] as const;
export const DeclineReasonSchema = z.enum(DECLINE_REASONS);
export type DeclineReason = z.infer<typeof DeclineReasonSchema>;

const ByUser = z.uuid().optional();

/** `assignment.accepted` v1 (row 7). */
export const AssignmentAcceptedV1 = z
  .object({
    mode: OrderModeSchema,
    assignment_id: z.uuid(),
    by_user_id: ByUser,
  })
  .strict();

/** `assignment.declined` v1 (row 8): the reason is the event's point. */
export const AssignmentDeclinedV1 = z
  .object({
    mode: OrderModeSchema,
    assignment_id: z.uuid(),
    reason: DeclineReasonSchema,
    by_user_id: ByUser,
  })
  .strict();

/** `order.no_partner_available` v1 (rows 10, 37, 38): the demo effect after a decline. */
export const OrderNoPartnerAvailableV1 = z
  .object({ mode: OrderModeSchema, demo: z.literal(true).optional() })
  .strict();

/** `order.out_for_delivery` v1 (rows 19, 23). */
export const OrderOutForDeliveryV1 = z
  .object({
    mode: OrderModeSchema,
    assignment_id: z.uuid().optional(),
    by_user_id: ByUser,
  })
  .strict();

/** `order.delivered` v1 (row 20). */
export const OrderDeliveredV1 = z
  .object({
    mode: OrderModeSchema,
    assignment_id: z.uuid().optional(),
    by_user_id: ByUser,
  })
  .strict();

/** `order.photo_uploaded` v1 (row 25): the private, metadata-free asset. */
export const OrderPhotoUploadedV1 = z
  .object({
    mode: OrderModeSchema,
    media_asset_id: z.uuid(),
    assignment_id: z.uuid().optional(),
    by_user_id: ByUser,
  })
  .strict();

/** The six this file registers. */
export const FLORIST_EVENT_SCHEMAS = {
  "assignment.accepted": AssignmentAcceptedV1,
  "assignment.declined": AssignmentDeclinedV1,
  "order.no_partner_available": OrderNoPartnerAvailableV1,
  "order.out_for_delivery": OrderOutForDeliveryV1,
  "order.delivered": OrderDeliveredV1,
  "order.photo_uploaded": OrderPhotoUploadedV1,
} as const satisfies Partial<Record<OrderEventType, z.ZodType>>;

/** Every event type spec 011 writes (§5.2): the six above and spec 013's two. */
export const FLORIST_EVENT_TYPES = [
  "assignment.accepted",
  "assignment.declined",
  "order.no_partner_available",
  "order.captured",
  "order.in_production",
  "order.out_for_delivery",
  "order.delivered",
  "order.photo_uploaded",
] as const satisfies readonly OrderEventType[];

for (const [type, schema] of Object.entries(FLORIST_EVENT_SCHEMAS) as [
  keyof typeof FLORIST_EVENT_SCHEMAS,
  (typeof FLORIST_EVENT_SCHEMAS)[keyof typeof FLORIST_EVENT_SCHEMAS],
][]) {
  registerEventSchema(type, 1, schema);
}
