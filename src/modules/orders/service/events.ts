/**
 * The event catalogue and the event-schema registry (spec 010 §2 "Event names", §5.2; §14 A1.1;
 * spec 002 §14 A6.6; `plan/11` §2; TASK-202).
 *
 * Names are the `plan/11` §2 catalogue's as amended by spec 002 A6.6, never the diagram's arrow
 * labels (`accept`, `capture`, …). A6.6 splits them in two, and the engine enforces the split:
 *
 *  - the **28 transition events** have rows in `order_transition` and go through `transition`
 *    only (A1.4: `appendEvent` refuses them);
 *  - the **8 status-preserving events** have no row and are written by `place` (`order.placed`)
 *    or `appendEvent` (`assignment.offered`, …).
 *
 * `tests/unit/order-engine.test.ts` compares both lists with `tests/fixtures/order-machine.ts`
 * in both directions, so a name cannot drift from the seeded machine.
 *
 * **The registry.** Every event the engine writes is parsed by a versioned zod schema before any
 * write. This spec registers the four it emits (`order.placed`, `order.authorised`,
 * `order.routed`, `assignment.offered`); spec 011 registers its eight and spec 015 the rest
 * through `registerEventSchema`. An event with no registered schema is refused
 * (`ORDER_EVENT_UNREGISTERED`), so nothing reaches `order_event` or `outbox` unvalidated.
 *
 * **No personal data.** Every schema carries `mode` and is `.strict()`; none has a key for a
 * name, phone, email, address, postcode or card message (those live only in the order's
 * snapshots, spec 010 §8). The unit test scans every registered schema's keys.
 */
import { z } from "zod";

/** A6.6: the 28 transition events, which have rows in `order_transition`. */
export const TRANSITION_EVENTS = [
  "order.authorised",
  "order.captured",
  "order.payment_failed",
  "order.abandoned",
  "order.routed",
  "assignment.accepted",
  "assignment.declined",
  "assignment.timed_out",
  "order.no_partner_available",
  "order.manual_reroute",
  "order.cancelled",
  "order.in_production",
  "order.substitution_proposed",
  "order.substitution_resolved",
  "order.out_for_delivery",
  "order.delivered",
  "order.delivery_failed",
  "order.redelivery_scheduled",
  "order.cancelled_refunded",
  "order.photo_uploaded",
  "order.closed",
  "order.disputed",
  "order.resolved",
  "order.refunded_partial",
  "order.refunded_full",
  "order.chargeback_opened",
  "order.chargeback_won",
  "order.chargeback_lost",
] as const;

/** A6.6: the 8 status-preserving events, which have no row. */
export const STATUS_PRESERVING_EVENTS = [
  "order.placed",
  "assignment.offered",
  "order.refund_requested",
  "customer.created",
  "recipient.created",
  "review.created",
  "partner.status_changed",
  "country.status_changed",
] as const;

export const ORDER_EVENT_TYPES = [
  ...TRANSITION_EVENTS,
  ...STATUS_PRESERVING_EVENTS,
] as const;

export type TransitionEventType = (typeof TRANSITION_EVENTS)[number];
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

export const OrderEventTypeSchema = z.enum(ORDER_EVENT_TYPES);

/** `order.mode` (spec 010 §5.1 A): the demo marker every event payload carries. */
export const ORDER_MODES = ["demo", "test", "live"] as const;
export const OrderModeSchema = z.enum(ORDER_MODES);
export type OrderMode = z.infer<typeof OrderModeSchema>;

/** ISO 4217, upper case (spec 002's money pair). */
const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);
/** A calendar date, `YYYY-MM-DD`. */
const IsoDateSchema = z.iso.date();
/** Integer minor units (`CLAUDE.md`: never a float). */
const MinorSchema = z.number().int().nonnegative();

/** `order.placed` v1, written by `place` at seq 1. */
export const OrderPlacedV1 = z
  .object({
    mode: OrderModeSchema,
    buyerCurrency: CurrencyCodeSchema,
    buyerTotalMinor: MinorSchema,
    deliveryDate: IsoDateSchema,
    lineCount: z.number().int().positive(),
  })
  .strict();

/** `order.authorised` v1. In `demo` there is no payment (`system:demo_guard`, AC-20). */
export const OrderAuthorisedV1 = z.object({ mode: OrderModeSchema }).strict();

/** `order.routed` v1: the florist the order is offered to. */
export const OrderRoutedV1 = z
  .object({ mode: OrderModeSchema, partnerId: z.uuid() })
  .strict();

/** `assignment.offered` v1: the offer and its answer window (`plan/06` §5.2). */
export const AssignmentOfferedV1 = z
  .object({
    mode: OrderModeSchema,
    assignmentId: z.uuid(),
    partnerId: z.uuid(),
    attempt: z.number().int().positive(),
    answerWindowMinutes: z.number().int().positive(),
  })
  .strict();

/**
 * Status-preserving events only `place` may write: `order.placed` is seq 1 of a new order and
 * never a second event on an existing one, so `appendEvent` refuses it (`ORDER_EVENT_PLACE_ONLY`).
 */
export const PLACE_ONLY_EVENTS: ReadonlySet<OrderEventType> = new Set([
  "order.placed",
]);

/**
 * The actor classes allowed to append a status-preserving event (the `allowed_actors` of an
 * event with no `order_transition` row). An offer is made by routing (`system`) or by an admin
 * re-offering by hand, never by a buyer or a florist. An event absent from this map has no class
 * rule yet; the spec that registers its schema adds its row here.
 */
export const STATUS_PRESERVING_ACTORS: Readonly<
  Partial<
    Record<
      OrderEventType,
      readonly ("buyer" | "partner" | "admin" | "system")[]
    >
  >
> = {
  "assignment.offered": ["system", "admin"],
};

/** What the engine needs of a payload schema: it parses to an object that names its mode. */
export type EventPayloadSchema = z.ZodType<{ mode: OrderMode }>;

export interface RegisteredEvent {
  readonly version: number;
  readonly schema: EventPayloadSchema;
}

const registry = new Map<OrderEventType, RegisteredEvent>();

/**
 * Registers the versioned payload schema of `type`. Throws on a second registration of the same
 * name, so two specs cannot silently disagree about one event.
 */
export function registerEventSchema(
  type: OrderEventType,
  version: number,
  schema: EventPayloadSchema,
): void {
  if (registry.has(type)) {
    throw new Error(`event schema already registered: ${type}`);
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new RangeError(`event schema version must be ≥ 1: ${type}`);
  }
  registry.set(type, { version, schema });
}

/** The registered schema of `type`, or undefined. */
export function eventSchema(type: string): RegisteredEvent | undefined {
  const parsed = OrderEventTypeSchema.safeParse(type);
  return parsed.success ? registry.get(parsed.data) : undefined;
}

/** Every registered event name (for the PII scan and the docs). */
export function registeredEventTypes(): readonly OrderEventType[] {
  return [...registry.keys()];
}

registerEventSchema("order.placed", 1, OrderPlacedV1);
registerEventSchema("order.authorised", 1, OrderAuthorisedV1);
registerEventSchema("order.routed", 1, OrderRoutedV1);
registerEventSchema("assignment.offered", 1, AssignmentOfferedV1);
