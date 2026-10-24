/**
 * `order.closed` v1 (spec 022a §5.2 "Events"; spec 002 §14 A6 rows 26, 29, 33; TASK-369).
 *
 * `OrderClosedV1 { mode, from }`: the order's mode and the status it closed from, one of the three
 * statuses that can close. Ids, a mode and a status only: no name, address, amount or message.
 * Registered once, when this module is first imported; the close sweep imports it, so every
 * process that can close an order has the schema (the engine refuses an unregistered event,
 * `ORDER_EVENT_UNREGISTERED`).
 */
import { z } from "zod";

import { OrderModeSchema, registerEventSchema } from "../service";

/** The statuses an order closes from (A6 rows 26, 29 and 33), in the machine's order. */
export const CLOSABLE_STATUSES = [
  "photo_uploaded",
  "resolved",
  "refunded_full",
] as const;

export const ClosableStatusSchema = z.enum(CLOSABLE_STATUSES);
export type ClosableStatus = z.infer<typeof ClosableStatusSchema>;

export const OrderClosedV1 = z
  .object({ mode: OrderModeSchema, from: ClosableStatusSchema })
  .strict();
export type OrderClosedV1 = z.infer<typeof OrderClosedV1>;

registerEventSchema("order.closed", 1, OrderClosedV1);
