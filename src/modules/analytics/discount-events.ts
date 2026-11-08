/**
 * The discount code analytics payloads (spec 047 §2 "Analytics, and what the founder sees", §8
 * "Logs and PII"; AC-23, AC-24; TASK-447): `discount_code_applied`, `discount_code_rejected`, and the
 * GA4 `purchase` event's `coupon` and `discount` parameters. Spec 023 emits them; these builders are
 * its contract.
 *
 * **What they carry, and what they never carry.** The code's id and its internal **campaign label**
 * (the founder reads "which group sent which orders" from it), the refusal reason, and on
 * `purchase` the discount in the order currency. Never the code string, never an email: the
 * schemas are strict and have no field either could arrive in, and the builders take neither.
 *
 * **Nothing for `demo` or `test`.** A demo or test checkout is not a sale; every builder returns
 * `null` for those modes, so no dashboard counts them.
 */
import { z } from "zod";

import { type Money, moneyDecimalString } from "@/modules/i18n";

export const DISCOUNT_CODE_APPLIED_EVENT = "discount_code_applied";
export const DISCOUNT_CODE_REJECTED_EVENT = "discount_code_rejected";

/** The refusal reasons (spec 047 §5.2 `DiscountRefusalReason`). */
const REASONS = [
  "unknown",
  "not_started",
  "ended",
  "wrong_destination",
  "wrong_product",
  "wrong_currency",
  "below_minimum",
  "used_up",
  "already_used_by_you",
  "locked",
] as const;

const CampaignLabelSchema = z.string().min(1).max(80);

export const DiscountAppliedEventSchema = z.strictObject({
  event: z.literal(DISCOUNT_CODE_APPLIED_EVENT),
  params: z.strictObject({
    discount_code_id: z.uuid(),
    campaign_label: CampaignLabelSchema,
  }),
});
export type DiscountAppliedEvent = z.infer<typeof DiscountAppliedEventSchema>;

export const DiscountRejectedEventSchema = z.strictObject({
  event: z.literal(DISCOUNT_CODE_REJECTED_EVENT),
  params: z.strictObject({
    reason: z.enum(REASONS),
    /** Absent for a code that does not exist (`unknown`): there is nothing to name. */
    discount_code_id: z.uuid().optional(),
    campaign_label: CampaignLabelSchema.optional(),
  }),
});
export type DiscountRejectedEvent = z.infer<typeof DiscountRejectedEventSchema>;

/** GA4's `purchase` parameters for a discounted order: the label as `coupon`, the amount off. */
export const PurchaseCouponParamsSchema = z.strictObject({
  coupon: CampaignLabelSchema,
  /** The amount off as a decimal string at the currency's exponent ("4.59"), never a float. */
  discount: z.string().regex(/^\d+(?:\.\d+)?$/u),
  currency: z.string().regex(/^[A-Z]{3}$/u),
});
export type PurchaseCouponParams = z.infer<typeof PurchaseCouponParamsSchema>;

type CheckoutModeName = "demo" | "test" | "live";

/** The code the event is about: its id and internal label, never its text. */
export interface DiscountCodeRef {
  readonly id: string;
  readonly campaignLabel: string;
}

/** `discount_code_applied`, or `null` outside `live`. */
export function discountAppliedEvent(input: {
  readonly mode: CheckoutModeName;
  readonly code: DiscountCodeRef;
}): DiscountAppliedEvent | null {
  if (input.mode !== "live") return null;
  return DiscountAppliedEventSchema.parse({
    event: DISCOUNT_CODE_APPLIED_EVENT,
    params: {
      discount_code_id: input.code.id,
      campaign_label: input.code.campaignLabel,
    },
  });
}

/** `discount_code_rejected` with its reason, or `null` outside `live`. */
export function discountRejectedEvent(input: {
  readonly mode: CheckoutModeName;
  readonly reason: (typeof REASONS)[number];
  /** The code, when the typed text named one. */
  readonly code: DiscountCodeRef | null;
}): DiscountRejectedEvent | null {
  if (input.mode !== "live") return null;
  return DiscountRejectedEventSchema.parse({
    event: DISCOUNT_CODE_REJECTED_EVENT,
    params: {
      reason: input.reason,
      ...(input.code === null
        ? {}
        : {
            discount_code_id: input.code.id,
            campaign_label: input.code.campaignLabel,
          }),
    },
  });
}

/**
 * The `purchase` event's `coupon` (the campaign label, not the code) and `discount` (the amount
 * off, as the currency's decimal string; spec 023 hands GA4 the number), or `null` outside `live`.
 */
export function purchaseCouponParams(input: {
  readonly mode: CheckoutModeName;
  readonly code: DiscountCodeRef;
  readonly discount: Money;
}): PurchaseCouponParams | null {
  if (input.mode !== "live") return null;
  return PurchaseCouponParamsSchema.parse({
    coupon: input.code.campaignLabel,
    discount: moneyDecimalString(input.discount),
    currency: input.discount.currency,
  });
}
