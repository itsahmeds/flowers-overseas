/**
 * The event schemas spec 013 registers in spec 010's registry (spec 013 §5.2 "Events this spec
 * registers", AC-19; spec 002 §14 A6.6, A7.2; `plan/11` §2; TASK-254).
 *
 * Every event the money half of the order machine writes is parsed by one of these **before any
 * write** (`parsePayload` in the engine refuses a payload that fails, `ORDER_PAYLOAD_INVALID`), so
 * nothing reaches `order_event` or `outbox` unvalidated. Each schema is version 1, `.strict()`,
 * and carries `mode`; payloads carry ids, amounts, currencies, codes and reasons, never a name,
 * email, phone, address or card message. No key here is one the logger would redact
 * (`isRedactedLogKey`, `tests/unit/payments-events.test.ts` walks them): a decline is a provider
 * **code** (`decline_code`), never a `card_*` field and never the bank's text.
 *
 * Who writes what (spec 013 §5.2):
 *
 *  - **through `transition` only** (A6.3 rows): `order.payment_failed` (row 3),
 *    `order.abandoned` (row 4), `order.cancelled` (rows 13, 39, 40), `order.refunded_partial`
 *    (row 30), `order.refunded_full` (rows 31, 32), `order.chargeback_opened` (row 34),
 *    `order.chargeback_won` (row 35), `order.chargeback_lost` (row 36);
 *  - **through `appendEvent` only** (status-preserving): `order.refund_requested` and A7.2's
 *    `order.payment_attempt_failed`.
 *
 * Spec 013 also writes two events other specs register, and adds only **optional** fields to them
 * (`plan/11` §2, "adding a field is additive"): `OrderAuthorisedV1` (spec 010, in
 * `src/modules/orders/service/events.ts`) gains `payment_id` and `capture_method`;
 * `OrderCapturedV1` (spec 011, TASK-215) gains `ORDER_CAPTURED_PAYMENT_FIELDS` below. Spec 011
 * also registers `order.in_production`, which spec 013 writes for `test` and `live` orders.
 *
 * The names are A6.6's, never the diagram's arrow labels (`pay`, `capture`, `capture_failed`,
 * `buyer_cancel`, `expire`, `refund_partial`, `refund_full`, `chargeback`; ruling R8).
 *
 * Registration runs once, when this module is first imported; the `payments` barrel (TASK-255)
 * imports it, so every process that can write a payment event has the schemas.
 */
import { z } from "zod";

import {
  OrderModeSchema,
  registerEventSchema,
  type EventPayloadSchema,
  type OrderEventType,
} from "@/modules/orders";

/**
 * `refund.reason` (spec 002 §14 A7.4), also the reason an order is cancelled with (spec 013 §5.2
 * "Cancellation": `buyer_cancel`, `no_partner`, `redelivery_failed`, or the admin's choice from
 * these). Internal: no buyer surface renders it (spec 013 §5.3). `authorisation_lapsing` stays in
 * the list with A7 and is never written at launch (spec 013 §14).
 */
export const REFUND_REASONS = [
  "buyer_cancel",
  "no_partner",
  "authorisation_lapsing",
  "redelivery_failed",
  "addon_missing",
  "late_delivery",
  "substitution_complaint",
  "quality",
  "goodwill",
  "duplicate",
  "other",
] as const;

export const RefundReasonSchema = z.enum(REFUND_REASONS);
export type RefundReason = z.infer<typeof RefundReasonSchema>;

/** ISO 4217, upper case (spec 002's money pair). */
const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);
/** Integer minor units, strictly positive: a refund or a dispute of nothing is not a fact. */
const PositiveMinorSchema = z.number().int().positive();
/** A provider decline code (`insufficient_funds`), never the bank's text (A7.3). */
const DeclineCodeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/)
  .nullable();

/** The five fields spec 018 §12 asks for, shared by the three refund events. */
const RefundFields = {
  mode: OrderModeSchema,
  refund_id: z.uuid(),
  amount_minor: PositiveMinorSchema,
  currency_code: CurrencyCodeSchema,
  reason: RefundReasonSchema,
} as const;

/** `order.payment_failed` v1 (row 3): the sweep closed an unpaid order after a failed attempt. */
export const OrderPaymentFailedV1 = z
  .object({
    mode: OrderModeSchema,
    payment_id: z.uuid(),
    attempts: z.number().int().positive(),
  })
  .strict();

/**
 * `order.abandoned` v1 (row 4): the sweep closed an unpaid order with no failed attempt. A placed
 * order whose payment never started has no payment row, so `payment_id` is null then.
 */
export const OrderAbandonedV1 = z
  .object({ mode: OrderModeSchema, payment_id: z.uuid().nullable() })
  .strict();

/**
 * `order.cancelled` v1 (rows 13, 39, 40): exactly `reason` and `mode`. The actor is the event's
 * own column; the confirmation reads the actor class, never the reason (spec 013 §5.3).
 */
export const OrderCancelledV1 = z
  .object({ mode: OrderModeSchema, reason: RefundReasonSchema })
  .strict();

/** `order.refund_requested` v1 (status-preserving): the refund row and what it asks for. */
export const OrderRefundRequestedV1 = z.object(RefundFields).strict();

/** `order.refunded_partial` v1 (row 30, D1): status unchanged. */
export const OrderRefundedPartialV1 = z.object(RefundFields).strict();

/** `order.refunded_full` v1 (rows 31, 32). */
export const OrderRefundedFullV1 = z.object(RefundFields).strict();

/** `order.chargeback_opened` v1 (row 34): the dispute row and its amount. */
export const OrderChargebackOpenedV1 = z
  .object({
    mode: OrderModeSchema,
    dispute_id: z.uuid(),
    amount_minor: PositiveMinorSchema,
    currency_code: CurrencyCodeSchema,
  })
  .strict();

/** `order.chargeback_won` v1 (row 35). */
export const OrderChargebackWonV1 = z
  .object({ mode: OrderModeSchema, dispute_id: z.uuid() })
  .strict();

/** `order.chargeback_lost` v1 (row 36). */
export const OrderChargebackLostV1 = z
  .object({ mode: OrderModeSchema, dispute_id: z.uuid() })
  .strict();

/**
 * `order.payment_attempt_failed` v1 (A7.2, status-preserving): one decline, written in the same
 * transaction as `payment.attempts + 1`. `attempt` is that new count.
 */
export const OrderPaymentAttemptFailedV1 = z
  .object({
    mode: OrderModeSchema,
    payment_id: z.uuid(),
    attempt: z.number().int().positive(),
    decline_code: DeclineCodeSchema,
  })
  .strict();

/**
 * The optional fields spec 013 adds to spec 011's `OrderCapturedV1` (spec 013 §5.2):
 * `provider_call` is `true` on row 2 (the money is taken) and `false` on row 14 (acceptance, no
 * provider call). Spec 011's schema spreads them (`…ORDER_CAPTURED_PAYMENT_FIELDS`).
 */
export const ORDER_CAPTURED_PAYMENT_FIELDS = {
  payment_id: z.uuid().optional(),
  provider_call: z.boolean().optional(),
} as const;

/** How spec 013 writes each event it registers: through `transition`, or `appendEvent`. */
export type PaymentEventWriter = "transition" | "appendEvent";

export interface PaymentEventEntry {
  readonly version: 1;
  readonly schema: EventPayloadSchema;
  readonly writer: PaymentEventWriter;
}

/** Every event spec 013 registers, with its schema, version and the one engine path it takes. */
export const PAYMENT_EVENT_SCHEMAS = {
  "order.payment_failed": {
    version: 1,
    schema: OrderPaymentFailedV1,
    writer: "transition",
  },
  "order.abandoned": {
    version: 1,
    schema: OrderAbandonedV1,
    writer: "transition",
  },
  "order.cancelled": {
    version: 1,
    schema: OrderCancelledV1,
    writer: "transition",
  },
  "order.refunded_partial": {
    version: 1,
    schema: OrderRefundedPartialV1,
    writer: "transition",
  },
  "order.refunded_full": {
    version: 1,
    schema: OrderRefundedFullV1,
    writer: "transition",
  },
  "order.chargeback_opened": {
    version: 1,
    schema: OrderChargebackOpenedV1,
    writer: "transition",
  },
  "order.chargeback_won": {
    version: 1,
    schema: OrderChargebackWonV1,
    writer: "transition",
  },
  "order.chargeback_lost": {
    version: 1,
    schema: OrderChargebackLostV1,
    writer: "transition",
  },
  "order.refund_requested": {
    version: 1,
    schema: OrderRefundRequestedV1,
    writer: "appendEvent",
  },
  "order.payment_attempt_failed": {
    version: 1,
    schema: OrderPaymentAttemptFailedV1,
    writer: "appendEvent",
  },
} as const satisfies Partial<Record<OrderEventType, PaymentEventEntry>>;

export type PaymentEventType = keyof typeof PAYMENT_EVENT_SCHEMAS;

for (const [type, entry] of Object.entries(PAYMENT_EVENT_SCHEMAS) as [
  PaymentEventType,
  PaymentEventEntry,
][]) {
  registerEventSchema(type, entry.version, entry.schema);
}

/**
 * Spec 011's `OrderCapturedV1` and `OrderInProductionV1`, registered here **ahead of TASK-215**
 * (spec 011's florist commands, not built yet), because spec 013 writes both first: row 2
 * (`placed → paid_unrouted`, `order.captured`, TASK-257), row 14 (TASK-259) and row 16
 * (`order.in_production`, TASK-258). Spec 011 §5.2 gives their fields: `demo: true` for a
 * `system:demo` actor; spec 013 §5.2 adds `payment_id` and `provider_call` to `OrderCapturedV1`
 * (`ORDER_CAPTURED_PAYMENT_FIELDS`). The registry refuses a second registration of one name, so
 * TASK-215 imports these two schemas from here instead of registering its own (carry-forward in
 * `docs/tasks/TASK-215.md`).
 */
export const OrderCapturedV1 = z
  .object({
    mode: OrderModeSchema,
    demo: z.literal(true).optional(),
    ...ORDER_CAPTURED_PAYMENT_FIELDS,
  })
  .strict();

/** `order.in_production` v1 (row 16): the delivery morning's start, or spec 011's demo effect. */
export const OrderInProductionV1 = z
  .object({ mode: OrderModeSchema, demo: z.literal(true).optional() })
  .strict();

registerEventSchema("order.captured", 1, OrderCapturedV1);
registerEventSchema("order.in_production", 1, OrderInProductionV1);
