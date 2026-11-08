/**
 * The Measurement Protocol bodies and the validation answer (spec 023 §5.2 "The outbox target",
 * "Validation on staging", AC-17, AC-20, AC-24, AC-26; TASK-491). Every object is strict, so a
 * body can never carry `user_id`, `user_data`, `user_location`, `ip_override`, `device` or any
 * personal field: there is no key for one to arrive in.
 */
import { z } from "zod";

import { Ga4ItemSchema } from "./items";

/** `purchase.checkout_channel` (spec 023 §14 A-orchestrator-2026-10-25 item 2). */
export const CHECKOUT_CHANNELS = [
  "checkout",
  "express",
  "checkout_express",
] as const;
export type CheckoutChannel = (typeof CHECKOUT_CHANNELS)[number];

const ConsentSignal = z.enum(["GRANTED", "DENIED"]);

export const MpConsentSchema = z.strictObject({
  ad_user_data: ConsentSignal,
  ad_personalization: ConsentSignal,
});

const ClientIdSchema = z.string().regex(/^\d{1,20}\.\d{1,20}$/u);
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/u);

const CommonParams = {
  transaction_id: z.uuid(),
  value: z.number().nonnegative().finite(),
  currency: CurrencySchema,
  engagement_time_msec: z.literal(1),
  debug_mode: z.literal(1).optional(),
};

export const MpPurchaseEventSchema = z.strictObject({
  name: z.literal("purchase"),
  params: z.strictObject({
    ...CommonParams,
    items: z.array(Ga4ItemSchema).min(1).max(200),
    session_id: z
      .string()
      .regex(/^\d{1,20}$/u)
      .optional(),
    locale: z.string().regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/u),
    destination_country: z.string().regex(/^[A-Z]{2}$/u),
    country_status: z.enum(["live", "demo", "disabled"]),
    payment_type: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/u),
    checkout_channel: z.enum(CHECKOUT_CHANNELS),
  }),
});

export const MpRefundEventSchema = z.strictObject({
  name: z.literal("refund"),
  params: z.strictObject(CommonParams),
});

const BodyBase = {
  client_id: ClientIdSchema,
  timestamp_micros: z.number().int().positive(),
  consent: MpConsentSchema,
};

export const MpPurchaseBodySchema = z.strictObject({
  ...BodyBase,
  events: z.tuple([MpPurchaseEventSchema]),
});

export const MpRefundBodySchema = z.strictObject({
  ...BodyBase,
  events: z.tuple([MpRefundEventSchema]),
});

export type MpPurchaseBody = z.infer<typeof MpPurchaseBodySchema>;
export type MpRefundBody = z.infer<typeof MpRefundBodySchema>;
export type MpBody = MpPurchaseBody | MpRefundBody;

/** `/debug/mp/collect`'s answer (Google [M3]); only the count and the codes are ever read. */
export const MpValidationResponseSchema = z.object({
  validationMessages: z
    .array(z.object({ validationCode: z.string().max(80).optional() }))
    .default([]),
});
