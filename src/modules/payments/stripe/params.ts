/**
 * The PaymentIntent create parameters (spec 013 §5.2 "`CreateIntentInput` sent to Stripe", AC-7
 * intent-parameter half, AC-1's metadata, T-07; TASK-255).
 *
 *  - `amount` and `currency` from the order, through `toStripeAmount` (AC-9);
 *  - `capture_method: 'automatic'`, and **no** `capture_method` under `payment_method_options`
 *    for any method: nothing is held (the founder's ruling of 2026-10-14, §14);
 *  - `payment_method_types` exactly as `paymentMethodTypesFor()` gave them, never
 *    `automatic_payment_methods`, so the list is ours;
 *  - `payment_method_options.card.request_three_d_secure: 'any'` (§13 Q1);
 *  - `metadata`: exactly the six non-personal keys, for Radar rules;
 *  - `description`: the order reference. No `receipt_email` (spec 016 sends our confirmation) and
 *    no `shipping` (recipient data never reaches Stripe, §8, §13 Q4).
 */
import type { CreateIntentInput } from "../provider.ts";
import { toStripeAmount } from "./amount.ts";

/** The six metadata keys, in Stripe's snake case. Nothing else may be added (AC-1). */
export const INTENT_METADATA_KEYS = [
  "order_id",
  "payment_id",
  "destination_country",
  "buyer_country_declared",
  "is_first_order",
  "order_mode",
] as const;

export type IntentMetadata = Readonly<
  Record<(typeof INTENT_METADATA_KEYS)[number], string>
>;

export function stripeCreateIntentParams(input: CreateIntentInput) {
  const metadata: IntentMetadata = {
    order_id: input.metadata.orderId,
    payment_id: input.metadata.paymentId,
    destination_country: input.metadata.destinationCountry,
    buyer_country_declared: input.metadata.buyerCountryDeclared,
    is_first_order: input.metadata.isFirstOrder ? "true" : "false",
    order_mode: input.metadata.orderMode,
  };
  return {
    amount: toStripeAmount(input.amount),
    currency: input.amount.currency.toLowerCase(),
    capture_method: "automatic",
    payment_method_types: [...input.methodTypes],
    payment_method_options: { card: { request_three_d_secure: "any" } },
    metadata,
    description: input.description,
  } as const;
}

/** Exactly what is sent, field by field (AC-7). */
export type StripeCreateIntentParams = ReturnType<
  typeof stripeCreateIntentParams
>;

type FormValue =
  | string
  | number
  | boolean
  | readonly FormValue[]
  | { readonly [key: string]: FormValue };

/** Stripe's form encoding: `a[b][0]=c`. Keys keep their insertion order. */
export function toStripeForm(params: {
  readonly [key: string]: FormValue;
}): URLSearchParams {
  const form = new URLSearchParams();
  const visit = (prefix: string, value: FormValue): void => {
    if (Array.isArray(value)) {
      (value as readonly FormValue[]).forEach((item, index) => {
        visit(`${prefix}[${String(index)}]`, item);
      });
    } else if (typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        visit(prefix === "" ? key : `${prefix}[${key}]`, item);
      }
    } else {
      form.append(prefix, String(value));
    }
  };
  visit("", params);
  return form;
}
