/**
 * The events spec 016's router writes, their actors, and the two schemas it registers (spec 016
 * §5.2 "Transitions and events this spec writes", "Contracts consumed"; AC-32; TASK-328).
 *
 * Catalogue names only (spec 002 A6.6 as amended by A7), never the diagram's arrow labels
 * (`route`, `timeout`, `exhausted` …):
 *
 * | When                           | Event                         | Row | Actor                      |
 * |--------------------------------|-------------------------------|-----|----------------------------|
 * | first offer                    | `order.routed`, then `assignment.offered` | 6 | `system:order.route` |
 * | re-offer                       | `assignment.offered`          | —   | `system:order.route`       |
 * | an offer's time runs out       | `assignment.timed_out`        | 9   | `system:assignment.timeout`|
 * | no florist left, `routing.auto` off | `order.no_partner_available` | 10, A8 | `system:order.route` |
 * | the founder reroutes (TASK-329) | `order.manual_reroute`, `order.routed`, `assignment.offered` | 11, 12 | `admin:{uuid}` |
 *
 * Registered **here**: `assignment.timed_out` and `order.manual_reroute` (§5.2: "This spec
 * registers versioned schemas for `assignment.timed_out` and `order.manual_reroute`"). The others
 * are registered by their owners and used as they are: `order.routed` and `assignment.offered`
 * by spec 010 (the engine), `order.no_partner_available` by spec 011's florist actions, which is
 * why that module is imported for its registrations below.
 *
 * Every payload is ids, a mode and counts: no name, address, postcode or phone.
 */
import { z } from "zod";

import "../florist-actions/events";

import { ActorSchema } from "../service/actor";
import {
  OrderModeSchema,
  registerEventSchema,
  type OrderEventType,
} from "../service/events";

/** The router's actor (§5.2): first offers, re-offers, exhaustion. */
export const ORDER_ROUTE_ACTOR = ActorSchema.parse("system:order.route");

/** The timeout job's actor (§5.2): `assignment.timed_out`. */
export const ASSIGNMENT_TIMEOUT_ACTOR = ActorSchema.parse(
  "system:assignment.timeout",
);

/** `assignment.timed_out` v1 (row 9): which offer ran out, so V4 reaches its florist. */
export const AssignmentTimedOutV1 = z
  .object({
    mode: OrderModeSchema,
    assignmentId: z.uuid(),
    partnerId: z.uuid(),
    attempt: z.number().int().positive(),
  })
  .strict();

/** `order.manual_reroute` v1 (row 11): the florist the founder chose (spec 020's button). */
export const OrderManualRerouteV1 = z
  .object({ mode: OrderModeSchema, partnerId: z.uuid() })
  .strict();

registerEventSchema("assignment.timed_out", 1, AssignmentTimedOutV1);
registerEventSchema("order.manual_reroute", 1, OrderManualRerouteV1);

/**
 * Every event the router writes itself (AC-32): five catalogue names, nothing else. TASK-329's
 * `manualReroute` adds `order.manual_reroute` (row 11); the expiry's `order.cancelled` is written
 * by spec 013's `cancelOrder`, never here.
 */
export const ROUTING_WRITTEN_EVENTS = [
  "order.routed",
  "assignment.offered",
  "assignment.timed_out",
  "order.no_partner_available",
  "order.manual_reroute",
] as const satisfies readonly OrderEventType[];
