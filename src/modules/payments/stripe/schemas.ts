/**
 * Zod over the Stripe fields the adapter reads (spec 013 §5.2; `CLAUDE.md` "Zod at every
 * boundary"; TASK-255). Each schema names only what this spec uses and lets the rest through
 * unread, so a field Stripe adds is not a failure and a field we read that moves is.
 *
 * Shapes follow the OpenAPI document of the pinned version (`version.ts`); the contract suite
 * parses Stripe's published fixtures for that version with these same schemas.
 */
import { z } from "zod";

import { providerIntentStatuses, providerRefundStatuses } from "../provider.ts";

const unixSeconds = z.number().int().nonnegative();
const minorUnits = z.number().int().nonnegative();

export const StripeChargeSchema = z.object({
  id: z.string().min(1),
  object: z.literal("charge"),
  outcome: z.object({ risk_score: z.number().int().nullish() }).nullish(),
  payment_method_details: z
    .object({
      type: z.string().min(1),
      card: z
        .object({
          brand: z.string().nullish(),
          last4: z.string().nullish(),
          capture_before: unixSeconds.nullish(),
          three_d_secure: z.object({ result: z.string().nullish() }).nullish(),
          wallet: z.object({ type: z.string().min(1) }).nullish(),
        })
        .nullish(),
    })
    .nullish(),
});
export type StripeCharge = z.infer<typeof StripeChargeSchema>;

export const StripeLastPaymentErrorSchema = z.object({
  type: z.string().min(1),
  code: z.string().nullish(),
  decline_code: z.string().nullish(),
  charge: z.string().nullish(),
  payment_method: z.object({ id: z.string().min(1) }).nullish(),
});

export const StripePaymentIntentSchema = z.object({
  id: z.string().min(1),
  object: z.literal("payment_intent"),
  amount: minorUnits,
  currency: z.string().length(3),
  status: z.enum(providerIntentStatuses),
  capture_method: z.enum(["automatic", "automatic_async", "manual"]),
  client_secret: z.string().nullish(),
  livemode: z.boolean(),
  last_payment_error: StripeLastPaymentErrorSchema.nullish(),
  latest_charge: z.union([z.string(), StripeChargeSchema]).nullish(),
});
export type StripePaymentIntent = z.infer<typeof StripePaymentIntentSchema>;

export const StripeRefundSchema = z.object({
  id: z.string().min(1),
  object: z.literal("refund"),
  amount: minorUnits,
  currency: z.string().length(3),
  status: z.enum(providerRefundStatuses).nullish(),
  payment_intent: z
    .union([z.string(), z.object({ id: z.string().min(1) })])
    .nullish(),
  failure_reason: z.string().nullish(),
});
export type StripeRefund = z.infer<typeof StripeRefundSchema>;

/** `StripeEventSchema`: the envelope of a webhook or an `events.list` item (spec 013 §5.2). */
export const StripeEventSchema = z.object({
  id: z.string().min(1),
  object: z.literal("event"),
  type: z.string().min(1),
  livemode: z.boolean(),
  created: unixSeconds,
  data: z.object({
    object: z.object({ id: z.string().min(1), object: z.string().min(1) }),
  }),
});
export type StripeEvent = z.infer<typeof StripeEventSchema>;

export const StripeEventListSchema = z.object({
  object: z.literal("list"),
  has_more: z.boolean(),
  data: z.array(StripeEventSchema),
});

/** Stripe's error envelope. `message` is deliberately not read: it never reaches a buyer (AC-5). */
export const StripeErrorSchema = z.object({
  error: z.object({
    type: z.string().min(1),
    code: z.string().nullish(),
    decline_code: z.string().nullish(),
  }),
});
